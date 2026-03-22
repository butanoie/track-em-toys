import type { FastifyInstance } from 'fastify';
import { characterExistsBySlug } from '../characters/queries.js';
import { getItemIdBySlug } from '../items/queries.js';
import { getCharacterRelationships, getItemRelationships } from './queries.js';
import { getCharacterRelationshipsSchema, getItemRelationshipsSchema } from './schemas.js';

interface FranchiseSlugParams {
  franchise: string;
  slug: string;
}

const rateLimitConfig = { rateLimit: { max: 100, timeWindow: '1 minute' } } as const;

/**
 * Register character relationship routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function characterRelationshipRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Params: FranchiseSlugParams }>(
    '/',
    { schema: getCharacterRelationshipsSchema, config: rateLimitConfig },
    async (request, reply) => {
      const { franchise, slug } = request.params;
      const exists = await characterExistsBySlug(franchise, slug);
      if (!exists) return reply.code(404).send({ error: 'Character not found' });
      const relationships = await getCharacterRelationships(franchise, slug);
      return { relationships };
    }
  );
}

/**
 * Register item relationship routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function itemRelationshipRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get<{ Params: FranchiseSlugParams }>(
    '/',
    { schema: getItemRelationshipsSchema, config: rateLimitConfig },
    async (request, reply) => {
      const { franchise, slug } = request.params;
      const itemId = await getItemIdBySlug(franchise, slug);
      if (!itemId) return reply.code(404).send({ error: 'Item not found' });
      const relationships = await getItemRelationships(franchise, slug);
      return { relationships };
    }
  );
}
