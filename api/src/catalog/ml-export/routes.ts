import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { photoPath } from '../photos/storage.js';
import { getExportableItemsBySearch, getExportableItemsByFilters, type ExportItemPhotoRow } from './queries.js';
import { mlExportSchema } from './schemas.js';

const LOW_PHOTO_THRESHOLD = 10;

interface MlExportQuery {
  q?: string;
  franchise?: string;
  manufacturer?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
  character?: string;
}

interface ManifestEntry {
  photo_path: string;
  label: string;
  item_name: string;
  franchise_slug: string;
  item_slug: string;
}

interface ManifestWarning {
  label: string;
  photo_count: number;
  message: string;
}

interface ManifestData {
  entries: ManifestEntry[];
  warnings: ManifestWarning[];
  totalItems: number;
  franchiseCount: number;
}

interface Manifest {
  version: number;
  exported_at: string;
  stats: {
    total_photos: number;
    items: number;
    franchises: number;
    low_photo_items: number;
  };
  entries: ManifestEntry[];
  warnings: ManifestWarning[];
}

/**
 * Group flat query rows by item_id, building manifest entries and warnings.
 *
 * @param rows - Flat photo rows from the export query
 * @param storagePath - Absolute path to photo storage directory
 */
function buildManifestData(rows: ExportItemPhotoRow[], storagePath: string): ManifestData {
  const itemMap = new Map<string, { slug: string; name: string; franchiseSlug: string; photoIds: string[] }>();

  for (const row of rows) {
    let item = itemMap.get(row.item_id);
    if (!item) {
      item = {
        slug: row.item_slug,
        name: row.item_name,
        franchiseSlug: row.franchise_slug,
        photoIds: [],
      };
      itemMap.set(row.item_id, item);
    }
    if (row.photo_id) {
      item.photoIds.push(row.photo_id);
    }
  }

  const entries: ManifestEntry[] = [];
  const warnings: ManifestWarning[] = [];

  for (const [itemId, item] of itemMap) {
    const label = `${item.franchiseSlug}/${item.slug}`;

    for (const photoId of item.photoIds) {
      entries.push({
        photo_path: photoPath(storagePath, itemId, photoId, 'original'),
        label,
        item_name: item.name,
        franchise_slug: item.franchiseSlug,
        item_slug: item.slug,
      });
    }

    if (item.photoIds.length < LOW_PHOTO_THRESHOLD) {
      warnings.push({
        label,
        photo_count: item.photoIds.length,
        message: `Low photo count — may reduce classification accuracy`,
      });
    }
  }

  const franchiseSlugs = new Set<string>();
  for (const item of itemMap.values()) {
    franchiseSlugs.add(item.franchiseSlug);
  }

  return { entries, warnings, totalItems: itemMap.size, franchiseCount: franchiseSlugs.size };
}

/**
 * Generate an ISO8601 filename suitable for filesystem storage.
 * Produces format: 20260321T154530Z.json
 */
function generateExportFilename(): string {
  return (
    new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '') + '.json'
  );
}

/**
 * Extract item filters from the query params (same shape as items browse).
 *
 * @param query - Validated query params
 */
function extractFilters(query: MlExportQuery) {
  const filters: Record<string, string | boolean> = {};
  if (query.manufacturer !== undefined) filters.manufacturer = query.manufacturer;
  if (query.size_class !== undefined) filters.size_class = query.size_class;
  if (query.toy_line !== undefined) filters.toy_line = query.toy_line;
  if (query.continuity_family !== undefined) filters.continuity_family = query.continuity_family;
  if (query.is_third_party !== undefined) filters.is_third_party = query.is_third_party;
  if (query.character !== undefined) filters.character = query.character;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

/**
 * Register ML export routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function mlExportRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.post<{ Querystring: MlExportQuery }>(
    '/',
    {
      schema: mlExportSchema,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    },
    async (request, reply) => {
      if (!config.ml.exportPath) {
        return reply.code(500).send({ error: 'ML_EXPORT_PATH is not configured' });
      }

      const { q, franchise } = request.query;

      if (!q && !franchise) {
        return reply.code(400).send({ error: 'At least one of q or franchise is required' });
      }

      let rows: ExportItemPhotoRow[];
      if (q) {
        rows = await getExportableItemsBySearch(q, franchise ?? null);
      } else {
        rows = await getExportableItemsByFilters(franchise!, extractFilters(request.query));
      }

      const exportPath = config.ml.exportPath;
      const { entries, warnings, totalItems, franchiseCount } = buildManifestData(rows, config.photos.storagePath);

      const exportedAt = new Date().toISOString();
      const filename = generateExportFilename();

      const manifest: Manifest = {
        version: 1,
        exported_at: exportedAt,
        stats: {
          total_photos: entries.length,
          items: totalItems,
          franchises: franchiseCount,
          low_photo_items: warnings.length,
        },
        entries,
        warnings,
      };

      try {
        await mkdir(exportPath, { recursive: true });
        await writeFile(join(exportPath, filename), JSON.stringify(manifest, null, 2));
      } catch (err) {
        request.log.error({ err }, 'ML export manifest write failed');
        return reply.code(500).send({ error: 'Failed to write export manifest' });
      }

      return {
        exported_at: exportedAt,
        filename,
        stats: manifest.stats,
        warnings: manifest.warnings,
      };
    }
  );
}
