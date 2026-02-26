import type { FastifyInstance, FastifyReply } from 'fastify'
import { getJwks } from './key-store.js'

/** JSON Schema for a single JWK entry — whitelists only known safe fields. */
const jwkKeySchema = {
  type: 'object',
  properties: {
    kty: { type: 'string' },
    crv: { type: 'string' },
    x: { type: 'string' },
    y: { type: 'string' },
    kid: { type: 'string' },
    alg: { type: 'string' },
    use: { type: 'string' },
  },
  required: ['kty', 'crv', 'x', 'y', 'kid', 'alg', 'use'],
  additionalProperties: false,
} as const

/**
 * Register the /.well-known/jwks.json route for public key discovery.
 *
 * @param fastify - Fastify instance
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async even when no await is used
export async function jwksRoute(fastify: FastifyInstance, _opts: object): Promise<void> {
  fastify.get(
    '/.well-known/jwks.json',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              keys: {
                type: 'array',
                items: jwkKeySchema,
              },
            },
            required: ['keys'],
            additionalProperties: false,
          },
        },
      },
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (_request, reply: FastifyReply) => {
      reply.header('Cache-Control', 'public, max-age=3600')
      return getJwks()
    },
  )
}
