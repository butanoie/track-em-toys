import type { FastifyInstance } from 'fastify'
import { listCharacters, getCharacterBySlug } from './queries.js'
import type { CharacterListRow, CharacterDetail } from './queries.js'
import { listCharactersSchema, getCharacterSchema } from './schemas.js'
import { decodeCursor, buildCursorPage, clampLimit } from '../shared/pagination.js'

interface FranchiseParams { franchise: string }
interface FranchiseSlugParams { franchise: string; slug: string }
interface PaginationQuery { limit?: number; cursor?: string }

function formatListItem(row: CharacterListRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    franchise: { slug: row.franchise_slug, name: row.franchise_name },
    faction: row.faction_slug ? { slug: row.faction_slug, name: row.faction_name! } : null,
    continuity_family: { slug: row.continuity_family_slug, name: row.continuity_family_name },
    character_type: row.character_type,
    alt_mode: row.alt_mode,
    is_combined_form: row.is_combined_form,
  }
}

function formatDetail(detail: CharacterDetail) {
  const { base, subGroups, appearances } = detail
  return {
    ...formatListItem(base),
    combiner_role: base.combiner_role,
    combined_form: base.combined_form_slug
      ? { slug: base.combined_form_slug, name: base.combined_form_name! }
      : null,
    sub_groups: subGroups,
    appearances,
    metadata: base.metadata,
    created_at: base.created_at,
    updated_at: base.updated_at,
  }
}

const rateLimitConfig = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function characterRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Params: FranchiseParams; Querystring: PaginationQuery }>(
    '/',
    { schema: listCharactersSchema, config: rateLimitConfig },
    async (request, reply) => {
      const limit = clampLimit(request.query.limit)

      let cursor: { name: string; id: string } | null = null
      if (request.query.cursor) {
        cursor = decodeCursor(request.query.cursor)
        if (!cursor) return reply.code(400).send({ error: 'Invalid cursor' })
      }

      const { rows, totalCount } = await listCharacters({
        franchiseSlug: request.params.franchise,
        limit,
        cursor,
      })

      const page = buildCursorPage(rows.map(formatListItem), limit)
      return { ...page, total_count: totalCount }
    },
  )

  fastify.get<{ Params: FranchiseSlugParams }>(
    '/:slug',
    { schema: getCharacterSchema, config: rateLimitConfig },
    async (request, reply) => {
      const detail = await getCharacterBySlug(request.params.franchise, request.params.slug)
      if (!detail) return reply.code(404).send({ error: 'Character not found' })
      return formatDetail(detail)
    },
  )
}
