import type { FastifyInstance } from 'fastify';
import { listItems, getItemBySlug, getItemFacets } from './queries.js';
import type { ItemFilters } from './queries.js';
import { listItemsSchema, getItemSchema, getItemFacetsSchema } from './schemas.js';
import { decodeCursor, buildCursorPage, clampLimit } from '../shared/pagination.js';
import { formatListItem, formatDetail } from '../shared/formatters.js';

interface FranchiseParams {
  franchise: string;
}
interface FranchiseSlugParams {
  franchise: string;
  slug: string;
}
interface ItemsListQuery {
  limit?: number;
  cursor?: string;
  manufacturer?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
  character?: string;
}

/**
 * Extract item filters from validated querystring params.
 *
 * @param query - Validated query params
 */
function extractFilters(query: ItemsListQuery | ItemFilters): ItemFilters {
  const filters: ItemFilters = {};
  if (query.manufacturer !== undefined) filters.manufacturer = query.manufacturer;
  if (query.size_class !== undefined) filters.size_class = query.size_class;
  if (query.toy_line !== undefined) filters.toy_line = query.toy_line;
  if (query.continuity_family !== undefined) filters.continuity_family = query.continuity_family;
  if (query.is_third_party !== undefined) filters.is_third_party = query.is_third_party;
  if (query.character !== undefined) filters.character = query.character;
  return filters;
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
  fastify.get<{ Params: FranchiseParams; Querystring: ItemsListQuery }>(
    '/',
    { schema: listItemsSchema, config: rateLimitConfig },
    async (request, reply) => {
      const limit = clampLimit(request.query.limit);

      let cursor: { name: string; id: string } | null = null;
      if (request.query.cursor) {
        cursor = decodeCursor(request.query.cursor);
        if (!cursor) return reply.code(400).send({ error: 'Invalid cursor' });
      }

      const filters = extractFilters(request.query);

      const { rows, totalCount } = await listItems({
        franchiseSlug: request.params.franchise,
        limit,
        cursor,
        filters,
      });

      const page = buildCursorPage(rows.map(formatListItem), limit);
      return { ...page, total_count: totalCount };
    }
  );

  // Facets must be registered before /:slug to prevent Fastify matching "facets" as a slug
  fastify.get<{ Params: FranchiseParams; Querystring: ItemFilters }>(
    '/facets',
    { schema: getItemFacetsSchema, config: rateLimitConfig },
    async (request) => {
      const filters = extractFilters(request.query);
      return getItemFacets(request.params.franchise, filters);
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
