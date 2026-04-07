import { readFileSync, accessSync, constants as fsConstants } from 'node:fs';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Secret } from '@fastify/jwt';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { getPublicKeyPem, getCurrentKid, initKeyStore } from './auth/key-store.js';
import { jwksRoute } from './auth/jwks.js';
import { authRoutes } from './auth/routes.js';
import { appleWebhookRoute } from './auth/webhooks.js';
import { HttpError } from './auth/errors.js';
import { docsPlugin } from './plugins/docs.js';
import { catalogRoutes } from './catalog/routes.js';
import { adminRoutes } from './admin/routes.js';
import { collectionRoutes } from './collection/routes.js';
import { mlRoutes } from './ml/routes.js';
import { requireRole } from './auth/role.js';
import type { UserRole } from './types/index.js';

// ─── Fastify type augmentation ─────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (minRole: UserRole) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Augment @fastify/jwt to type request.user as { sub, role } project-wide,
// avoiding unsafe casts in route handlers.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: UserRole };
    user: { sub: string; role: UserRole };
  }
}

/**
 * Build and configure the Fastify server with all plugins, middleware, and routes.
 */
export async function buildServer(): Promise<FastifyInstance> {
  // Initialize the key store before anything that needs JWT keys.
  // This must happen before route registration so getCurrentKid() is available.
  await initKeyStore();

  const httpsOptions =
    config.tls?.certFile && config.tls.keyFile
      ? { cert: readFileSync(config.tls.certFile), key: readFileSync(config.tls.keyFile) }
      : undefined;

  const fastify = Fastify({
    logger: {
      level: config.logLevel,
    },
    trustProxy: config.trustProxy,
    ...(httpsOptions && { https: httpsOptions }),
  });

  // ─── CORS ──────────────────────────────────────────────────────────────

  await fastify.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    maxAge: 86400,
  });

  // ─── Cookies (for refresh token httpOnly cookies) ──────────────────────

  await fastify.register(cookie, {
    secret: config.cookieSecret,
  });

  // ─── Rate Limiting ─────────────────────────────────────────────────────

  await fastify.register(rateLimit, {
    global: false,
  });

  // ─── JWT ───────────────────────────────────────────────────────────────

  /**
   * Type guard for JWT token header objects. Returns true if the value is a
   * non-null object, which is guaranteed to carry the header fields we need.
   *
   * @param v - The value to test
   */
  function isTokenHeader(v: unknown): v is { kid?: string } {
    return typeof v === 'object' && v !== null;
  }

  // Workaround: @fastify/jwt's Secret type does not declare the async
  // (request, token) => string two-argument overload. The Fastify JWT runtime
  // accepts this shape and calls it correctly at verification time. This cast
  // is the minimal suppression until @fastify/jwt exports the overload upstream.
  // Track upstream: https://github.com/fastify/fastify-jwt/issues
  // eslint-disable-next-line @typescript-eslint/require-await -- must match Secret async signature
  const publicKeyResolver = (async (_request: FastifyRequest, token: Record<string, unknown>) => {
    if (!isTokenHeader(token.header)) {
      throw new Error('Token missing header');
    }
    const kid = typeof token.header.kid === 'string' ? token.header.kid : undefined;
    if (!kid) throw new Error('Token missing kid header');
    const pem = getPublicKeyPem(kid);
    if (!pem) throw new Error(`Unknown key id: ${kid}`);
    return pem;
    // Cast required: @fastify/jwt lacks a two-argument async Secret overload. Runtime accepts
    // this shape correctly. Track upstream: https://github.com/fastify/fastify-jwt/issues
  }) as Secret;

  await fastify.register(jwt, {
    secret: {
      private: config.jwt.privateKey,
      public: publicKeyResolver,
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
  });

  // ─── Global error handler ─────────────────────────────────────────────────
  // Registered before route plugins so it applies to all routes, including
  // those registered inside plugins. Redacts internal error messages in
  // non-development environments so that unhandled errors (e.g. unexpected
  // DB failures) never leak stack traces or internal implementation details.

  fastify.setErrorHandler((err, request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send(err.body);
    }
    request.log.error({ err }, 'Unhandled route error');
    const isDev = config.nodeEnv === 'development';
    const msg = err instanceof Error ? err.message : undefined;
    const rawCode =
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      // typeof guard on the preceding line confirms statusCode is a number
      typeof (err as Record<string, unknown>).statusCode === 'number'
        ? ((err as Record<string, unknown>).statusCode as number) // safe: typeof guard above confirmed number
        : 500;
    const statusCode = rawCode >= 400 && rawCode <= 599 ? rawCode : 500;
    const message: string = isDev && typeof msg === 'string' ? msg : 'Internal Server Error';
    return reply.code(statusCode).send({ error: message });
  });

  // ─── Auth decorator ────────────────────────────────────────────────────

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      request.log.debug({ err }, 'JWT verification failed');
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ─── Role decorator ──────────────────────────────────────────────────
  // Factory function: returns a preHandler that checks the JWT role claim
  // against the required minimum. Must be used AFTER authenticate.

  fastify.decorate('requireRole', requireRole);

  // ─── API Documentation (non-production only) ────────────────────────────

  if (config.nodeEnv !== 'production') {
    await fastify.register(docsPlugin);

    // Test-only signin endpoint: bypasses OAuth providers, creates test users
    // with real JWT + refresh token cookies for E2E Playwright tests.
    // Dynamic import ensures the module is never loaded in production builds.
    const { testSigninRoutes } = await import('./auth/test-signin.js');
    await fastify.register(testSigninRoutes, { prefix: '/auth' });

    // Test-only photo seed endpoint: seeds pending item_photos + contributions
    // for Photo Approval Dashboard E2E tests (Phase 1.9b #72). Same non-prod
    // gating pattern — dynamic import keeps it out of production builds.
    const { testPhotosRoutes } = await import('./admin/test-photos.js');
    await fastify.register(testPhotosRoutes, { prefix: '/admin/test-photos' });
  }

  // ─── Health check ──────────────────────────────────────────────────────

  fastify.get(
    '/health',
    {
      schema: {
        description: 'Returns the current server health status.',
        tags: ['system'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            properties: { status: { type: 'string' } },
            required: ['status'],
            additionalProperties: false,
          },
        },
      },
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- Fastify requires async handlers
    async () => ({ status: 'ok' })
  );

  // ─── JWKS endpoint ─────────────────────────────────────────────────────

  await fastify.register(jwksRoute);

  // ─── Apple webhook ───────────────────────────────────────────────────
  // Registered before authRoutes at a separate prefix to avoid the
  // Content-Type: application/json enforcement hook scoped to authRoutes.
  // Apple sends raw JWT strings, not JSON.

  await fastify.register(appleWebhookRoute, { prefix: '/auth/webhooks/apple' });

  // ─── Auth routes ───────────────────────────────────────────────────────
  // The Content-Type enforcement hook is registered inside authRoutes so it
  // only applies to the /auth/* routes within that plugin scope, avoiding
  // brittle URL-prefix string matching on the root instance.

  await fastify.register(authRoutes, { prefix: '/auth' });

  // ─── Catalog routes ────────────────────────────────────────────────────

  await fastify.register(catalogRoutes, { prefix: '/catalog' });

  // ─── Admin routes ───────────────────────────────────────────────────────

  await fastify.register(adminRoutes, { prefix: '/admin' });

  // ─── Collection routes (first RLS-protected module) ───────────────────

  await fastify.register(collectionRoutes, { prefix: '/collection' });

  // ─── ML routes ─────────────────────────────────────────────────────

  await fastify.register(mlRoutes, { prefix: '/ml' });

  // ─── Photo storage validation ──────────────────────────────────────────
  // Validate storage path exists and is writable at startup (all environments).
  // Upload routes write to disk in all environments; only static serving is dev-only.

  if (config.nodeEnv !== 'test') {
    try {
      accessSync(config.photos.storagePath, fsConstants.R_OK | fsConstants.W_OK);
    } catch {
      throw new Error(`PHOTO_STORAGE_PATH "${config.photos.storagePath}" does not exist or is not writable`);
    }
  }

  // ─── Photo static serving (development only) ─────────────────────────
  // In production, photos are served by a CDN. In development, the API
  // serves them directly from PHOTO_STORAGE_PATH via @fastify/static.

  if (config.nodeEnv === 'development') {
    const fastifyStatic = await import('@fastify/static');
    await fastify.register(fastifyStatic.default, {
      root: config.photos.storagePath,
      prefix: '/photos/',
      decorateReply: false,
      index: false,
    });
  }

  // ─── ML model file serving (development only) ──────────────────────
  // In production, model files are served by a CDN (ML_MODELS_BASE_URL).
  // In development, the API serves them from ML_MODELS_PATH via @fastify/static.

  if (config.nodeEnv === 'development' && config.ml.modelsPath) {
    const fastifyStatic = await import('@fastify/static');
    await fastify.register(fastifyStatic.default, {
      root: config.ml.modelsPath,
      prefix: '/ml/model-files/',
      decorateReply: false,
      index: false,
    });
  }

  // NOTE: RLS context (app.user_id) is set inside withTransaction() on the
  // same connection that executes business logic, not via a global hook.

  return fastify;
}
