import type { FastifyInstance } from 'fastify';

import { HttpError } from '../auth/errors.js';
import { withTransaction } from '../db/pool.js';
import type { PackageCondition } from '../types/index.js';
import type { CollectionListRow } from './queries.js';
import * as queries from './queries.js';
import {
  addCollectionItemSchema,
  checkCollectionSchema,
  collectionStatsSchema,
  deleteCollectionItemSchema,
  exportCollectionSchema,
  getCollectionItemSchema,
  importCollectionSchema,
  listCollectionSchema,
  patchCollectionItemSchema,
  restoreCollectionItemSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Application-enforced cap on collection_items.notes (TEXT column, no DB constraint). */
const MAX_NOTES_LENGTH = 2000;

/** Default C-grade for new collection items (C5 = Good+). Matches DB column default. */
const DEFAULT_ITEM_CONDITION = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHECK_ITEM_IDS = 50;
const MAX_IMPORT_ITEMS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip control characters, trim, and truncate notes.
 * Returns null for empty strings after sanitization.
 *
 * @param input - Raw notes string
 */
function sanitizeNotes(input: string): string | null {
  return (
    input
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
      .slice(0, MAX_NOTES_LENGTH) || null
  );
}

/**
 * Format a flat DB row into the nested API response shape.
 * The manufacturer_name non-null assertion is safe: the LEFT JOIN guarantees
 * both slug and name come from the same manufacturers row.
 *
 * @param row - Flat database row
 */
function formatCollectionItem(row: CollectionListRow): Record<string, unknown> {
  return {
    id: row.id,
    item_id: row.item_id,
    item_name: row.item_name,
    item_slug: row.item_slug,
    franchise: { slug: row.franchise_slug, name: row.franchise_name },
    manufacturer: row.manufacturer_slug ? { slug: row.manufacturer_slug, name: row.manufacturer_name! } : null,
    toy_line: { slug: row.toy_line_slug, name: row.toy_line_name },
    thumbnail_url: row.thumbnail_url,
    package_condition: row.package_condition,
    item_condition: row.item_condition,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Route interfaces
// ---------------------------------------------------------------------------

interface IdParams {
  id: string;
}

interface ListQuery {
  franchise?: string;
  package_condition?: string;
  item_condition_min?: number;
  search?: string;
  page?: number;
  limit?: number;
}

interface AddBody {
  item_id: string;
  package_condition?: PackageCondition;
  item_condition?: number;
  notes?: string;
}

interface PatchBody {
  package_condition?: PackageCondition;
  item_condition?: number;
  notes?: string | null;
}

interface ExportQuery {
  include_deleted?: boolean;
}

interface ImportItem {
  franchise_slug: string;
  item_slug: string;
  package_condition?: PackageCondition;
  item_condition?: number;
  notes?: string | null;
  added_at?: string;
}

type ImportMode = 'append' | 'overwrite';

interface ImportBody {
  version: number;
  mode?: ImportMode;
  items: ImportItem[];
}

interface CheckQuery {
  itemIds: string;
}

// ---------------------------------------------------------------------------
// Rate limit configs
// ---------------------------------------------------------------------------

const readRateLimit = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const;
const writeRateLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } } as const;
const deleteRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } } as const;
const exportRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } } as const;
const importRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } } as const;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Register all collection routes under the /collection prefix.
 * All routes require authentication (any role). All queries use withTransaction
 * for RLS context — this is the first RLS-protected module in the app.
 *
 * @param fastify - Fastify instance
 * @param _opts - Plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function collectionRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  // ─── Content-Type enforcement ─────────────────────────────────────────
  fastify.addHook('preValidation', async (request, reply) => {
    if (request.method !== 'POST' && request.method !== 'PATCH') return;
    const contentType = request.headers['content-type'];
    if (contentType === undefined) return;
    const baseType = (contentType.split(';')[0] ?? '').trim();
    if (baseType !== 'application/json') {
      return reply.code(415).send({ error: 'Content-Type must be application/json' });
    }
  });

  // requireRole('user') accepts all authenticated users (user, curator, admin)
  // per the role hierarchy. The real access control is RLS on collection_items.
  const authPreHandler = [fastify.authenticate, fastify.requireRole('user')];

  // ─── GET /collection/stats (must precede /:id) ────────────────────────

  fastify.get(
    '/stats',
    { schema: collectionStatsSchema, preHandler: authPreHandler, config: readRateLimit },
    async (request) => {
      return withTransaction(async (client) => {
        return queries.getCollectionStats(client);
      }, request.user.sub);
    }
  );

  // ─── GET /collection/check (must precede /:id) ────────────────────────

  fastify.get<{ Querystring: CheckQuery }>(
    '/check',
    { schema: checkCollectionSchema, preHandler: authPreHandler, config: readRateLimit },
    async (request, reply) => {
      const raw = request.query.itemIds
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (raw.length === 0) {
        return reply.code(400).send({ error: 'itemIds must contain at least one UUID' });
      }
      if (raw.length > MAX_CHECK_ITEM_IDS) {
        return reply.code(400).send({ error: `itemIds must contain at most ${MAX_CHECK_ITEM_IDS} UUIDs` });
      }
      for (const id of raw) {
        if (!UUID_RE.test(id)) {
          return reply.code(400).send({ error: `Invalid UUID: ${id}` });
        }
      }

      const dbRows = await withTransaction(async (client) => {
        return queries.checkCollectionItems(client, raw);
      }, request.user.sub);

      // Build result map: start with all requested IDs as { count: 0, collection_ids: [] }
      const items: Record<string, { count: number; collection_ids: string[] }> = {};
      for (const id of raw) {
        items[id] = { count: 0, collection_ids: [] };
      }
      for (const row of dbRows) {
        items[row.item_id] = { count: row.count, collection_ids: row.collection_ids };
      }

      return { items };
    }
  );

  // ─── GET /collection/export (must precede /:id) ─────────────────────

  fastify.get<{ Querystring: ExportQuery }>(
    '/export',
    { schema: exportCollectionSchema, preHandler: authPreHandler, config: exportRateLimit },
    async (request) => {
      const includeDeleted = request.query.include_deleted ?? false;
      const items = await withTransaction(async (client) => {
        return queries.exportCollectionItems(client, includeDeleted);
      }, request.user.sub);

      return {
        version: 1,
        exported_at: new Date().toISOString(),
        items,
      };
    }
  );

  // ─── POST /collection/import (must precede /:id) ───────────────────

  fastify.post<{ Body: ImportBody }>(
    '/import',
    { schema: importCollectionSchema, preHandler: authPreHandler, config: importRateLimit },
    async (request, reply) => {
      const { items, mode } = request.body;
      const importMode: ImportMode = mode ?? 'append';

      // Defense-in-depth — schema enforces maxItems: 500
      if (items.length > MAX_IMPORT_ITEMS) {
        return reply.code(400).send({ error: `Import limited to ${MAX_IMPORT_ITEMS} items` });
      }

      return withTransaction(async (client) => {
        // In overwrite mode, soft-delete all existing items first
        let overwrittenCount = 0;
        if (importMode === 'overwrite') {
          overwrittenCount = await queries.softDeleteAllCollectionItems(client);
        }

        const resolved = await queries.batchGetItemIdsBySlugs(client, items);

        const imported: Array<{
          franchise_slug: string;
          item_slug: string;
          item_name: string;
          package_condition: PackageCondition;
          item_condition: number;
        }> = [];
        const unresolved: Array<{
          franchise_slug: string;
          item_slug: string;
          reason: string;
        }> = [];

        for (const item of items) {
          const key = `${item.franchise_slug}::${item.item_slug}`;
          const match = resolved.get(key);

          if (!match) {
            unresolved.push({
              franchise_slug: item.franchise_slug,
              item_slug: item.item_slug,
              reason: 'Item not found in catalog',
            });
            continue;
          }

          const packageCondition: PackageCondition = item.package_condition ?? 'unknown';
          const itemCondition = item.item_condition ?? DEFAULT_ITEM_CONDITION;
          const sanitizedNotes = typeof item.notes === 'string' ? sanitizeNotes(item.notes) : null;

          await client.query('SAVEPOINT import_item');
          try {
            await queries.insertCollectionItem(
              client,
              request.user.sub,
              match.item_id,
              packageCondition,
              itemCondition,
              sanitizedNotes
            );
            await client.query('RELEASE SAVEPOINT import_item');
            imported.push({
              franchise_slug: item.franchise_slug,
              item_slug: item.item_slug,
              item_name: match.item_name,
              package_condition: packageCondition,
              item_condition: itemCondition,
            });
          } catch (err) {
            request.log.warn(
              { err, franchise_slug: item.franchise_slug, item_slug: item.item_slug },
              'import: insert failed, rolling back savepoint'
            );
            await client.query('ROLLBACK TO SAVEPOINT import_item');
            unresolved.push({
              franchise_slug: item.franchise_slug,
              item_slug: item.item_slug,
              reason: 'Insert failed',
            });
          }
        }

        return { imported, unresolved, overwritten_count: overwrittenCount };
      }, request.user.sub);
    }
  );

  // ─── GET /collection ──────────────────────────────────────────────────

  fastify.get<{ Querystring: ListQuery }>(
    '/',
    { schema: listCollectionSchema, preHandler: authPreHandler, config: readRateLimit },
    async (request) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const offset = (page - 1) * limit;

      const { rows, totalCount } = await withTransaction(async (client) => {
        return queries.listCollectionItems(client, {
          franchise: request.query.franchise ?? null,
          package_condition: request.query.package_condition ?? null,
          item_condition_min: request.query.item_condition_min ?? null,
          search: request.query.search ?? null,
          limit,
          offset,
        });
      }, request.user.sub);

      return { data: rows.map(formatCollectionItem), page, limit, total_count: totalCount };
    }
  );

  // ─── POST /collection ─────────────────────────────────────────────────

  fastify.post<{ Body: AddBody }>(
    '/',
    { schema: addCollectionItemSchema, preHandler: authPreHandler, config: writeRateLimit },
    async (request, reply) => {
      const { item_id, package_condition, item_condition, notes } = request.body;
      const sanitizedNotes = notes !== undefined ? sanitizeNotes(notes) : null;

      const row = await withTransaction(async (client) => {
        const exists = await queries.itemExists(client, item_id);
        if (!exists) throw new HttpError(404, { error: 'Catalog item not found' });

        const newId = await queries.insertCollectionItem(
          client,
          request.user.sub,
          item_id,
          package_condition ?? 'unknown',
          item_condition ?? DEFAULT_ITEM_CONDITION,
          sanitizedNotes
        );

        const created = await queries.getCollectionItemById(client, newId);
        if (!created) throw new HttpError(500, { error: 'Failed to fetch created item' });
        return created;
      }, request.user.sub);

      return reply.code(201).send(formatCollectionItem(row));
    }
  );

  // ─── GET /collection/:id ──────────────────────────────────────────────

  fastify.get<{ Params: IdParams }>(
    '/:id',
    { schema: getCollectionItemSchema, preHandler: authPreHandler, config: readRateLimit },
    async (request) => {
      return withTransaction(async (client) => {
        const row = await queries.getCollectionItemById(client, request.params.id);
        if (!row || row.deleted_at !== null) throw new HttpError(404, { error: 'Collection item not found' });
        return formatCollectionItem(row);
      }, request.user.sub);
    }
  );

  // ─── PATCH /collection/:id ────────────────────────────────────────────

  fastify.patch<{ Params: IdParams; Body: PatchBody }>(
    '/:id',
    { schema: patchCollectionItemSchema, preHandler: authPreHandler, config: writeRateLimit },
    async (request, reply) => {
      const body = request.body;
      const hasPackageCondition = Object.hasOwn(body, 'package_condition');
      const hasItemCondition = Object.hasOwn(body, 'item_condition');
      const hasNotes = Object.hasOwn(body, 'notes');

      if (!hasPackageCondition && !hasItemCondition && !hasNotes) {
        return reply
          .code(400)
          .send({ error: 'At least one field (package_condition, item_condition, notes) is required' });
      }

      let sanitizedNotes: string | null = null;
      if (hasNotes && typeof body.notes === 'string') {
        sanitizedNotes = sanitizeNotes(body.notes);
      } else if (hasNotes) {
        sanitizedNotes = body.notes ?? null;
      }

      const row = await withTransaction(async (client) => {
        const locked = await queries.lockCollectionItem(client, request.params.id);
        if (!locked) throw new HttpError(404, { error: 'Collection item not found' });
        if (locked.deleted_at !== null) throw new HttpError(404, { error: 'Collection item not found' });

        const wasUpdated = await queries.updateCollectionItem(client, request.params.id, {
          package_condition: hasPackageCondition ? body.package_condition : undefined,
          item_condition: hasItemCondition ? body.item_condition : undefined,
          notes: sanitizedNotes,
          notesProvided: hasNotes,
        });
        if (!wasUpdated) throw new HttpError(500, { error: 'Update failed unexpectedly' });

        const updated = await queries.getCollectionItemById(client, request.params.id);
        if (!updated) throw new HttpError(404, { error: 'Collection item not found' });
        return updated;
      }, request.user.sub);

      return formatCollectionItem(row);
    }
  );

  // ─── DELETE /collection/:id ───────────────────────────────────────────

  fastify.delete<{ Params: IdParams }>(
    '/:id',
    { schema: deleteCollectionItemSchema, preHandler: authPreHandler, config: deleteRateLimit },
    async (request, reply) => {
      await withTransaction(async (client) => {
        const deleted = await queries.softDeleteCollectionItem(client, request.params.id);
        if (!deleted) throw new HttpError(404, { error: 'Collection item not found' });
      }, request.user.sub);

      return reply.code(204).send();
    }
  );

  // ─── POST /collection/:id/restore ─────────────────────────────────────

  fastify.post<{ Params: IdParams }>(
    '/:id/restore',
    { schema: restoreCollectionItemSchema, preHandler: authPreHandler, config: writeRateLimit },
    async (request) => {
      return withTransaction(async (client) => {
        // Unconditional UPDATE — idempotent for already-active items
        const updated = await queries.restoreCollectionItem(client, request.params.id);
        if (!updated) throw new HttpError(404, { error: 'Collection item not found' });

        const row = await queries.getCollectionItemById(client, request.params.id);
        if (!row) throw new HttpError(404, { error: 'Collection item not found' });
        return formatCollectionItem(row);
      }, request.user.sub);
    }
  );
}
