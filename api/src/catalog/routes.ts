import type { FastifyInstance } from 'fastify';
import { franchiseRoutes } from './franchises/routes.js';
import { manufacturerRoutes } from './manufacturers/routes.js';
import { searchRoutes } from './search/routes.js';
import { mlExportRoutes } from './ml-export/routes.js';
import { franchiseScopedRoutes } from './franchise-scoped.js';

/**
 * Register top-level catalog routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
export async function catalogRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  // Unscoped routes
  await fastify.register(franchiseRoutes, { prefix: '/franchises' });
  await fastify.register(manufacturerRoutes, { prefix: '/manufacturers' });
  await fastify.register(searchRoutes);
  await fastify.register(mlExportRoutes, { prefix: '/ml-export' });

  // Franchise-scoped routes — :franchise param inherited by all child plugins
  await fastify.register(franchiseScopedRoutes, { prefix: '/franchises/:franchise' });
}
