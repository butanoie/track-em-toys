import type { FastifyInstance } from 'fastify';
import {
  listFactions,
  getFactionBySlug,
  listSubGroups,
  getSubGroupBySlug,
  listContinuityFamilies,
  getContinuityFamilyBySlug,
} from './queries.js';
import type { SubGroupRow } from './queries.js';
import {
  listFactionsSchema,
  getFactionSchema,
  listSubGroupsSchema,
  getSubGroupSchema,
  listContinuityFamiliesSchema,
  getContinuityFamilySchema,
} from './schemas.js';

interface FranchiseParams {
  franchise: string;
}
interface FranchiseSlugParams {
  franchise: string;
  slug: string;
}

/**
 * Format a sub-group row for responses.
 *
 * @param row - Database row to format
 */
function formatSubGroup(row: SubGroupRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    faction: row.faction_slug ? { slug: row.faction_slug, name: row.faction_name! } : null,
    notes: row.notes,
    created_at: row.created_at,
  };
}

const rateLimitConfig = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const;

/**
 * Register reference data routes (factions, sub-groups, continuity families).
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function referenceRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  // ─── Factions ─────────────────────────────────────────────────────────

  fastify.get<{ Params: FranchiseParams }>(
    '/factions',
    { schema: listFactionsSchema, config: rateLimitConfig },
    async (request) => {
      const data = await listFactions(request.params.franchise);
      return { data };
    }
  );

  fastify.get<{ Params: FranchiseSlugParams }>(
    '/factions/:slug',
    { schema: getFactionSchema, config: rateLimitConfig },
    async (request, reply) => {
      const faction = await getFactionBySlug(request.params.franchise, request.params.slug);
      if (!faction) return reply.code(404).send({ error: 'Faction not found' });
      return faction;
    }
  );

  // ─── Sub-Groups ───────────────────────────────────────────────────────

  fastify.get<{ Params: FranchiseParams }>(
    '/sub-groups',
    { schema: listSubGroupsSchema, config: rateLimitConfig },
    async (request) => {
      const rows = await listSubGroups(request.params.franchise);
      return { data: rows.map(formatSubGroup) };
    }
  );

  fastify.get<{ Params: FranchiseSlugParams }>(
    '/sub-groups/:slug',
    { schema: getSubGroupSchema, config: rateLimitConfig },
    async (request, reply) => {
      const row = await getSubGroupBySlug(request.params.franchise, request.params.slug);
      if (!row) return reply.code(404).send({ error: 'Sub-group not found' });
      return formatSubGroup(row);
    }
  );

  // ─── Continuity Families ──────────────────────────────────────────────

  fastify.get<{ Params: FranchiseParams }>(
    '/continuity-families',
    { schema: listContinuityFamiliesSchema, config: rateLimitConfig },
    async (request) => {
      const data = await listContinuityFamilies(request.params.franchise);
      return { data };
    }
  );

  fastify.get<{ Params: FranchiseSlugParams }>(
    '/continuity-families/:slug',
    { schema: getContinuityFamilySchema, config: rateLimitConfig },
    async (request, reply) => {
      const cf = await getContinuityFamilyBySlug(request.params.franchise, request.params.slug);
      if (!cf) return reply.code(404).send({ error: 'Continuity family not found' });
      return cf;
    }
  );
}
