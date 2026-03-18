import type { FastifyInstance } from 'fastify'
import { searchCatalog } from './queries.js'
import type { SearchResultRow } from './queries.js'
import { searchSchema } from './schemas.js'

interface SearchQuery {
  q: string
  franchise?: string
  page?: number
  limit?: number
}

function formatResult(row: SearchResultRow) {
  return {
    entity_type: row.entity_type,
    id: row.id,
    name: row.name,
    slug: row.slug,
    franchise: { slug: row.franchise_slug, name: row.franchise_name },
  }
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function searchRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Querystring: SearchQuery }>(
    '/search',
    {
      schema: searchSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request) => {
      const page = request.query.page ?? 1
      const limit = Math.max(1, Math.min(request.query.limit ?? 20, 100))
      const offset = (page - 1) * limit

      const { rows, totalCount } = await searchCatalog({
        query: request.query.q,
        franchiseSlug: request.query.franchise ?? null,
        limit,
        offset,
      })

      return {
        data: rows.map(formatResult),
        page,
        limit,
        total_count: totalCount,
      }
    },
  )
}
