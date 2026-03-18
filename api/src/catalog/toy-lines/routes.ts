import type { FastifyInstance } from 'fastify'
import { listToyLines, getToyLineBySlug } from './queries.js'
import type { ToyLineRow } from './queries.js'
import { listToyLinesSchema, getToyLineSchema } from './schemas.js'

interface FranchiseParams { franchise: string }
interface FranchiseSlugParams { franchise: string; slug: string }

/**
 * Format a toy line row for responses.
 *
 * @param row - Database row to format
 */
function formatToyLine(row: ToyLineRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    franchise: { slug: row.franchise_slug, name: row.franchise_name },
    manufacturer: { slug: row.manufacturer_slug, name: row.manufacturer_name },
    scale: row.scale,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const rateLimitConfig = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const

/**
 * Register toy line catalog routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function toyLineRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Params: FranchiseParams }>(
    '/',
    { schema: listToyLinesSchema, config: rateLimitConfig },
    async (request) => {
      const rows = await listToyLines(request.params.franchise)
      return { data: rows.map(formatToyLine) }
    },
  )

  fastify.get<{ Params: FranchiseSlugParams }>(
    '/:slug',
    { schema: getToyLineSchema, config: rateLimitConfig },
    async (request, reply) => {
      const row = await getToyLineBySlug(request.params.franchise, request.params.slug)
      if (!row) return reply.code(404).send({ error: 'Toy line not found' })
      return formatToyLine(row)
    },
  )
}
