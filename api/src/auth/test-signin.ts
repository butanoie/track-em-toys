import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { withTransaction } from '../db/pool.js';
import * as queries from '../db/queries.js';
import { createAndStoreRefreshToken } from './tokens.js';
import { setRefreshTokenCookie } from './cookies.js';
import type { UserRole } from '../types/index.js';

/** Reusable error response schema. */
const errorResponse = {
  type: 'object',
  required: ['error'],
  additionalProperties: false,
  properties: { error: { type: 'string' } },
} as const;

/** Fastify route schema for POST /auth/test-signin. */
const testSigninSchema = {
  description:
    'Test-only endpoint: create or update a test user and return real JWT + refresh token cookie. Only available in non-production environments. Emails must end with @e2e.test.',
  tags: ['auth', 'test'],
  summary: 'Test sign-in (non-production only)',
  body: {
    type: 'object',
    required: ['email', 'role'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', minLength: 5, pattern: '^[^@]+@e2e\\.test$' },
      role: { type: 'string', enum: ['user', 'curator', 'admin'] },
      display_name: { type: 'string', minLength: 1, maxLength: 255 },
    },
  },
  response: {
    200: {
      type: 'object',
      required: ['access_token', 'refresh_token', 'user'],
      additionalProperties: false,
      properties: {
        access_token: { type: 'string' },
        refresh_token: { type: 'null' },
        user: {
          type: 'object',
          required: ['id', 'email', 'display_name', 'avatar_url', 'role'],
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            email: { type: ['string', 'null'] },
            display_name: { type: ['string', 'null'] },
            avatar_url: { type: ['string', 'null'] },
            role: { type: 'string', enum: ['user', 'curator', 'admin'] },
          },
        },
      },
    },
    400: errorResponse,
    500: errorResponse,
  },
} as const;

interface TestSigninBody {
  email: string;
  role: UserRole;
  display_name?: string;
}

/**
 * Test-only auth plugin: POST /test-signin.
 *
 * Creates or upserts a test user (constrained to `@e2e.test` emails) and
 * returns a real JWT access token + signed httpOnly refresh token cookie.
 * Bypasses OAuth provider verification entirely.
 *
 * Guard: throws at registration time if NODE_ENV === 'production'.
 *
 * @param fastify - Fastify instance to register the route on
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function testSigninRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  if (config.nodeEnv === 'production') {
    throw new Error('test-signin route must never be registered in production');
  }

  fastify.post<{ Body: TestSigninBody }>(
    '/test-signin',
    {
      schema: testSigninSchema,
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { email, role, display_name } = request.body;
      const safeName = display_name ?? email.split('@')[0] ?? 'E2E User';

      const txResult = await withTransaction(async (client) => {
        // Upsert: create the user or update role/status if they already exist.
        // ON CONFLICT targets the functional unique index idx_users_email_lower.
        // Resets deactivated_at/deleted_at so previously-tombstoned test users work.
        const { rows } = await client.query<queries.UserRow>(
          `INSERT INTO users (email, email_verified, display_name, avatar_url, role)
           VALUES (LOWER($1), true, $2, NULL, $3)
           ON CONFLICT (LOWER(email)) DO UPDATE SET
             role = EXCLUDED.role,
             email_verified = true,
             display_name = COALESCE(users.display_name, EXCLUDED.display_name),
             deactivated_at = NULL,
             deleted_at = NULL,
             updated_at = NOW()
           RETURNING id, email, email_verified, display_name, avatar_url, role, deactivated_at, deleted_at, created_at, updated_at`,
          [email, safeName, role]
        );
        const user = rows[0];
        if (!user) throw new Error('Upsert returned no rows');

        // Create a real refresh token (web client type → cookie path)
        const refreshToken = await createAndStoreRefreshToken(client, user.id, 'e2e-test', 'web');

        return { user, refreshToken };
      });

      // Sign JWT after transaction commits (same pattern as production signin)
      let accessToken: string;
      try {
        accessToken = await reply.jwtSign({ sub: txResult.user.id, role: txResult.user.role });
      } catch (signErr) {
        fastify.log.error({ err: signErr }, 'JWT signing failed in test-signin');
        throw new Error('Token signing failed', { cause: signErr });
      }

      // Set the signed httpOnly refresh token cookie (web client path)
      setRefreshTokenCookie(reply, txResult.refreshToken);

      return {
        access_token: accessToken,
        refresh_token: null,
        user: queries.toUserResponse(txResult.user),
      };
    }
  );
}
