import type { FastifyInstance } from 'fastify';
import { listCharacters, getCharacterBySlug, getCharacterFacets } from './queries.js';
import type { CharacterListRow, CharacterDetail, CharacterFilters } from './queries.js';
import { listCharactersSchema, getCharacterSchema, getCharacterFacetsSchema } from './schemas.js';
import { decodeCursor, buildCursorPage, clampLimit } from '../shared/pagination.js';

interface FranchiseParams {
  franchise: string;
}
interface FranchiseSlugParams {
  franchise: string;
  slug: string;
}
interface CharactersListQuery {
  limit?: number;
  cursor?: string;
  continuity_family?: string;
  faction?: string;
  character_type?: string;
  sub_group?: string;
}

/**
 * Extract character filters from validated querystring params.
 *
 * @param query - Validated query params
 */
function extractCharacterFilters(query: CharactersListQuery | CharacterFilters): CharacterFilters {
  const filters: CharacterFilters = {};
  if (query.continuity_family !== undefined) filters.continuity_family = query.continuity_family;
  if (query.faction !== undefined) filters.faction = query.faction;
  if (query.character_type !== undefined) filters.character_type = query.character_type;
  if (query.sub_group !== undefined) filters.sub_group = query.sub_group;
  return filters;
}

/**
 * Format a character row for list responses.
 *
 * @param row - Database row to format
 */
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
  };
}

/**
 * Format a character detail for the detail response.
 *
 * @param detail - Character detail to format
 */
function formatDetail(detail: CharacterDetail) {
  const { base, subGroups, appearances, componentCharacters } = detail;
  return {
    ...formatListItem(base),
    combiner_role: base.combiner_role,
    combined_form: base.combined_form_slug ? { slug: base.combined_form_slug, name: base.combined_form_name! } : null,
    component_characters: componentCharacters,
    sub_groups: subGroups,
    appearances,
    metadata: base.metadata,
    created_at: base.created_at,
    updated_at: base.updated_at,
  };
}

const rateLimitConfig = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const;

/**
 * Register character catalog routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function characterRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Params: FranchiseParams; Querystring: CharactersListQuery }>(
    '/',
    { schema: listCharactersSchema, config: rateLimitConfig },
    async (request, reply) => {
      const limit = clampLimit(request.query.limit);

      let cursor: { name: string; id: string } | null = null;
      if (request.query.cursor) {
        cursor = decodeCursor(request.query.cursor);
        if (!cursor) return reply.code(400).send({ error: 'Invalid cursor' });
      }

      const filters = extractCharacterFilters(request.query);

      const { rows, totalCount } = await listCharacters({
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
  fastify.get<{ Params: FranchiseParams; Querystring: CharacterFilters }>(
    '/facets',
    { schema: getCharacterFacetsSchema, config: rateLimitConfig },
    async (request) => {
      const filters = extractCharacterFilters(request.query);
      return getCharacterFacets(request.params.franchise, filters);
    }
  );

  fastify.get<{ Params: FranchiseSlugParams }>(
    '/:slug',
    { schema: getCharacterSchema, config: rateLimitConfig },
    async (request, reply) => {
      const detail = await getCharacterBySlug(request.params.franchise, request.params.slug);
      if (!detail) return reply.code(404).send({ error: 'Character not found' });
      return formatDetail(detail);
    }
  );
}
