import type { FastifyInstance } from 'fastify';
import { searchCatalog, type SearchResultRow } from './queries.js';
import { searchSchema } from './schemas.js';

interface SearchQuery {
  q: string;
  franchise?: string;
  type?: 'character' | 'item';
  page?: number;
  limit?: number;
}

/**
 * Format a search result row for responses.
 *
 * @param row - Database row to format
 */
function formatResult(row: SearchResultRow) {
  return {
    entity_type: row.entity_type,
    id: row.id,
    name: row.name,
    slug: row.slug,
    franchise: { slug: row.franchise_slug, name: row.franchise_name },
    continuity_family: row.continuity_family_slug
      ? { slug: row.continuity_family_slug, name: row.continuity_family_name! }
      : null,
    character: row.character_slug ? { slug: row.character_slug, name: row.character_name! } : null,
    manufacturer: row.manufacturer_slug ? { slug: row.manufacturer_slug, name: row.manufacturer_name! } : null,
    toy_line: row.toy_line_slug ? { slug: row.toy_line_slug, name: row.toy_line_name! } : null,
    thumbnail_url: row.thumbnail_url,
    size_class: row.size_class,
    year_released: row.year_released,
    is_third_party: row.is_third_party,
    data_quality: row.data_quality,
    product_code: row.product_code,
  };
}

/**
 * Register catalog search routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function searchRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Querystring: SearchQuery }>(
    '/search',
    {
      schema: searchSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 20;
      const offset = (page - 1) * limit;

      const { rows, totalCount, characterCount, itemCount } = await searchCatalog({
        query: request.query.q,
        franchiseSlug: request.query.franchise ?? null,
        entityType: request.query.type ?? null,
        limit,
        offset,
      });

      return {
        data: rows.map(formatResult),
        page,
        limit,
        total_count: totalCount,
        character_count: characterCount,
        item_count: itemCount,
      };
    }
  );
}
