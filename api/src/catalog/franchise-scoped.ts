import type { FastifyInstance } from 'fastify'
import { characterRoutes } from './characters/routes.js'
import { itemRoutes } from './items/routes.js'
import { toyLineRoutes } from './toy-lines/routes.js'
import { referenceRoutes } from './reference/routes.js'

/**
 * Register franchise-scoped child routes.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
export async function franchiseScopedRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  await fastify.register(characterRoutes, { prefix: '/characters' })
  await fastify.register(itemRoutes, { prefix: '/items' })
  await fastify.register(toyLineRoutes, { prefix: '/toy-lines' })
  await fastify.register(referenceRoutes)
}
