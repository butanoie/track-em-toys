import type { FastifyInstance } from 'fastify';
import { mlModelsRoutes } from './models/routes.js';

/**
 * Register top-level ML routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
export async function mlRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  await fastify.register(mlModelsRoutes, { prefix: '/models' });
}
