import type { FastifyInstance } from 'fastify';
import { mlModelsRoutes } from './models/routes.js';
import { mlModelQualityRoutes } from './models/quality-routes.js';
import { mlEventWriteRoutes, mlStatsRoutes } from './events/routes.js';

/**
 * Register top-level ML routes.
 *
 * Telemetry stats (DB-backed) live under /stats via mlStatsRoutes.
 * Model quality (filesystem-backed) lives under /stats/model-quality via mlModelQualityRoutes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
export async function mlRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  await fastify.register(mlModelsRoutes, { prefix: '/models' });
  await fastify.register(mlEventWriteRoutes, { prefix: '/events' });
  await fastify.register(mlStatsRoutes, { prefix: '/stats' });
  await fastify.register(mlModelQualityRoutes, { prefix: '/stats/model-quality' });
}
