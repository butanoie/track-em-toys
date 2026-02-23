import type { FastifyInstance } from 'fastify'
import { getJwks } from './key-store.js'

/**
 * Register the /.well-known/jwks.json route for public key discovery.
 *
 * @param fastify - Fastify instance
 */
export function jwksRoute(fastify: FastifyInstance): void {
  fastify.get('/.well-known/jwks.json', async () => {
    return getJwks()
  })
}
