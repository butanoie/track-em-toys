import type { FastifyInstance } from 'fastify';
import { listItems, getItemBySlug } from './queries.js';
import type { ItemListRow, ItemDetail } from './queries.js';
import { listItemsSchema, getItemSchema } from './schemas.js';
import { decodeCursor, buildCursorPage, clampLimit } from '../shared/pagination.js';

interface FranchiseParams {
  franchise: string;
}
interface FranchiseSlugParams {
  franchise: string;
  slug: string;
}
interface PaginationQuery {
  limit?: number;
  cursor?: string;
}

/**
 * Format an item row for list responses.
 *
 * @param row - Database row to format
 */
function formatListItem(row: ItemListRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    franchise: { slug: row.franchise_slug, name: row.franchise_name },
    character: { slug: row.character_slug, name: row.character_name },
    manufacturer: row.manufacturer_slug ? { slug: row.manufacturer_slug, name: row.manufacturer_name! } : null,
    toy_line: { slug: row.toy_line_slug, name: row.toy_line_name },
    size_class: row.size_class,
    year_released: row.year_released,
    is_third_party: row.is_third_party,
    data_quality: row.data_quality,
  };
}

/**
 * Format an item detail for the detail response.
 *
 * @param detail - Item detail to format
 */
function formatDetail(detail: ItemDetail) {
  const { base, photos } = detail;
  return {
    ...formatListItem(base),
    appearance: base.appearance_slug
      ? {
          slug: base.appearance_slug,
          name: base.appearance_name!,
          source_media: base.appearance_source_media,
          source_name: base.appearance_source_name,
        }
      : null,
    description: base.description,
    barcode: base.barcode,
    sku: base.sku,
    product_code: base.product_code,
    photos,
    metadata: base.metadata,
    created_at: base.created_at,
    updated_at: base.updated_at,
  };
}

const rateLimitConfig = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const;

/**
 * Register item catalog routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function itemRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Params: FranchiseParams; Querystring: PaginationQuery }>(
    '/',
    { schema: listItemsSchema, config: rateLimitConfig },
    async (request, reply) => {
      const limit = clampLimit(request.query.limit);

      let cursor: { name: string; id: string } | null = null;
      if (request.query.cursor) {
        cursor = decodeCursor(request.query.cursor);
        if (!cursor) return reply.code(400).send({ error: 'Invalid cursor' });
      }

      const { rows, totalCount } = await listItems({
        franchiseSlug: request.params.franchise,
        limit,
        cursor,
      });

      const page = buildCursorPage(rows.map(formatListItem), limit);
      return { ...page, total_count: totalCount };
    }
  );

  fastify.get<{ Params: FranchiseSlugParams }>(
    '/:slug',
    { schema: getItemSchema, config: rateLimitConfig },
    async (request, reply) => {
      const detail = await getItemBySlug(request.params.franchise, request.params.slug);
      if (!detail) return reply.code(404).send({ error: 'Item not found' });
      return formatDetail(detail);
    }
  );
}
