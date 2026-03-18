import type { FastifyInstance } from 'fastify';
import { listFranchises, getFranchiseBySlug } from './queries.js';
import { listFranchisesSchema, getFranchiseSchema } from './schemas.js';

/**
 * Register franchise catalog routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function franchiseRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get(
    '/',
    {
      schema: listFranchisesSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async () => {
      const data = await listFranchises();
      return { data };
    }
  );

  fastify.get<{ Params: { slug: string } }>(
    '/:slug',
    {
      schema: getFranchiseSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const franchise = await getFranchiseBySlug(request.params.slug);
      if (!franchise) {
        return reply.code(404).send({ error: 'Franchise not found' });
      }
      return franchise;
    }
  );
}
