import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Secret } from '@fastify/jwt'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { getPrivateKeyPem, getPublicKeyPem, getCurrentKid } from './auth/key-store.js'
import { jwksRoute } from './auth/jwks.js'
import { authRoutes } from './auth/routes.js'

// ─── Fastify type augmentation ─────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>
  }
}

/**
 * Build and configure the Fastify server with all plugins, middleware, and routes.
 */
export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
    trustProxy: config.trustProxy,
  })

  // ─── CORS ──────────────────────────────────────────────────────────────

  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  })

  // ─── Cookies (for refresh token httpOnly cookies) ──────────────────────

  await fastify.register(cookie)

  // ─── Rate Limiting ─────────────────────────────────────────────────────

  await fastify.register(rateLimit, {
    global: false,
  })

  // ─── JWT ───────────────────────────────────────────────────────────────

  await fastify.register(jwt, {
    secret: {
      private: getPrivateKeyPem(),
      // eslint-disable-next-line @typescript-eslint/require-await -- must match Secret async signature
      public: (async (_request: FastifyRequest, token: Record<string, unknown>) => {
        const header = (token.header ?? token) as Record<string, unknown>
        const kid = header.kid as string | undefined
        if (!kid) throw new Error('Token missing kid header')
        const pem = getPublicKeyPem(kid)
        if (!pem) throw new Error(`Unknown key id: ${kid}`)
        return pem
      }) as Secret,
    },
    sign: {
      algorithm: 'ES256',
      expiresIn: config.jwt.accessTokenExpiry,
      iss: config.jwt.issuer,
      aud: config.jwt.audience,
      kid: getCurrentKid(),
    },
    verify: {
      allowedIss: [config.jwt.issuer],
      allowedAud: [config.jwt.audience],
    },
    decode: { complete: true },
  })

  // ─── Auth decorator ────────────────────────────────────────────────────

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
    },
  )

  // ─── Health check ──────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify requires async handlers
  fastify.get('/health', async () => ({ status: 'ok' }))

  // ─── JWKS endpoint ─────────────────────────────────────────────────────

  await fastify.register(jwksRoute)

  // ─── Auth routes ───────────────────────────────────────────────────────

  await fastify.register(authRoutes, { prefix: '/auth' })

  // NOTE: RLS context (app.user_id) is set inside withTransaction() on the
  // same connection that executes business logic, not via a global hook.

  return fastify
}
