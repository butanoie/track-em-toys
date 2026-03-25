import type { FastifyInstance } from 'fastify';
import {
  listManufacturers,
  getManufacturerBySlug,
  listManufacturerStats,
  listManufacturerItems,
  getManufacturerItemFacets,
} from './queries.js';
import type { ManufacturerItemFilters } from './queries.js';
import {
  listManufacturersSchema,
  getManufacturerSchema,
  listManufacturerStatsSchema,
  listManufacturerItemsSchema,
  getManufacturerItemFacetsSchema,
} from './schemas.js';
import { formatListItem } from '../shared/formatters.js';

interface SlugParams {
  slug: string;
}

interface ManufacturerItemsListQuery {
  page?: number;
  limit?: number;
  franchise?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
}

interface ManufacturerFacetsQuery {
  franchise?: string;
  size_class?: string;
  toy_line?: string;
  continuity_family?: string;
  is_third_party?: boolean;
}

/**
 * Extract manufacturer item filters from validated querystring params.
 *
 * @param query - Validated query params
 */
function extractManufacturerFilters(
  query: ManufacturerItemsListQuery | ManufacturerFacetsQuery
): ManufacturerItemFilters {
  const filters: ManufacturerItemFilters = {};
  if (query.franchise !== undefined) filters.franchise = query.franchise;
  if (query.size_class !== undefined) filters.size_class = query.size_class;
  if (query.toy_line !== undefined) filters.toy_line = query.toy_line;
  if (query.continuity_family !== undefined) filters.continuity_family = query.continuity_family;
  if (query.is_third_party !== undefined) filters.is_third_party = query.is_third_party;
  return filters;
}

const rateLimitConfig = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const;

/**
 * Register manufacturer catalog routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function manufacturerRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get('/', { schema: listManufacturersSchema, config: rateLimitConfig }, async () => {
    const data = await listManufacturers();
    return { data };
  });

  // Stats must be registered before /:slug to prevent Fastify matching "stats" as a slug
  fastify.get('/stats', { schema: listManufacturerStatsSchema, config: rateLimitConfig }, async () => {
    const data = await listManufacturerStats();
    return { data };
  });

  fastify.get<{ Params: SlugParams }>(
    '/:slug',
    { schema: getManufacturerSchema, config: rateLimitConfig },
    async (request, reply) => {
      const manufacturer = await getManufacturerBySlug(request.params.slug);
      if (!manufacturer) {
        return reply.code(404).send({ error: 'Manufacturer not found' });
      }
      return manufacturer;
    }
  );

  fastify.get<{ Params: SlugParams; Querystring: ManufacturerItemsListQuery }>(
    '/:slug/items',
    { schema: listManufacturerItemsSchema, config: rateLimitConfig },
    async (request, reply) => {
      const manufacturer = await getManufacturerBySlug(request.params.slug);
      if (!manufacturer) {
        return reply.code(404).send({ error: 'Manufacturer not found' });
      }

      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const offset = (page - 1) * limit;
      const filters = extractManufacturerFilters(request.query);

      const { rows, totalCount } = await listManufacturerItems({
        manufacturerSlug: request.params.slug,
        limit,
        offset,
        filters,
      });

      return { data: rows.map(formatListItem), page, limit, total_count: totalCount };
    }
  );

  // Facets must be registered before a potential /:slug/items/:itemSlug
  fastify.get<{ Params: SlugParams; Querystring: ManufacturerFacetsQuery }>(
    '/:slug/items/facets',
    { schema: getManufacturerItemFacetsSchema, config: rateLimitConfig },
    async (request, reply) => {
      const manufacturer = await getManufacturerBySlug(request.params.slug);
      if (!manufacturer) {
        return reply.code(404).send({ error: 'Manufacturer not found' });
      }

      const filters = extractManufacturerFilters(request.query);
      return getManufacturerItemFacets(request.params.slug, filters);
    }
  );
}
