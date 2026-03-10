import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose'
import type { FastifyInstance } from 'fastify'
import { withTransaction } from '../db/pool.js'
import * as queries from '../db/queries.js'
import { config } from '../config.js'
import { appleWebhookSchema } from './schemas.js'

/** Apple's JWKS endpoint for verifying server-to-server notification JWTs. */
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys')

/** Expected issuer for Apple server-to-server notification JWTs. */
const APPLE_ISSUER = 'https://appleid.apple.com'

/**
 * Build the set of accepted audience values from Apple config.
 * Apple sends the bundle ID or services ID as the `aud` claim depending on
 * whether the user signed in via native (iOS) or web (Sign in with Apple JS).
 */
function getAllowedAudiences(): string[] {
  const audiences = [config.apple.bundleId]
  if (config.apple.servicesId) {
    audiences.push(config.apple.servicesId)
  }
  return audiences
}

/**
 * Type guard for the parsed `events` claim inside Apple's server-to-server JWT.
 * The `events` claim is a JSON string that, when parsed, must be an object with
 * `type` and `sub` string fields.
 *
 * @param value - The parsed JSON value to validate
 */
function isAppleEventPayload(value: unknown): value is { type: string; sub: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'sub' in value &&
    typeof (value as Record<string, unknown>).type === 'string' &&
    typeof (value as Record<string, unknown>).sub === 'string'
  )
}

/**
 * Register the Apple server-to-server webhook endpoint.
 *
 * Mounted at `/auth/webhooks/apple` in server.ts — separate from authRoutes
 * to avoid the Content-Type: application/json enforcement hook.
 *
 * @param fastify - Fastify instance to register routes on
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async even when no await is used
export async function appleWebhookRoute(fastify: FastifyInstance, _opts: object): Promise<void> {
  // Accept any content type — Apple sends the JWT as a raw POST body, not JSON.
  // This parser reads the entire body as a UTF-8 string.
  fastify.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  const appleJWKS = createRemoteJWKSet(APPLE_JWKS_URL)
  const allowedAudiences = getAllowedAudiences()

  fastify.post(
    '/',
    {
      schema: appleWebhookSchema,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const rawBody = request.body
      if (typeof rawBody !== 'string' || rawBody.length === 0) {
        return reply.code(401).send({ error: 'Missing or empty payload' })
      }

      // ── Verify JWT signature against Apple JWKS ──────────────────────────
      let payload: Record<string, unknown>
      try {
        const result = await jwtVerify(rawBody, appleJWKS, {
          issuer: APPLE_ISSUER,
          audience: allowedAudiences,
        })
        payload = result.payload as Record<string, unknown>
      } catch (err) {
        if (
          err instanceof joseErrors.JWSSignatureVerificationFailed ||
          err instanceof joseErrors.JWTExpired ||
          err instanceof joseErrors.JWTClaimValidationFailed
        ) {
          request.log.debug({ err }, 'Apple webhook JWT verification failed')
          return reply.code(401).send({ error: 'Invalid webhook token' })
        }
        // Unexpected error (e.g. JWKS fetch failure) — log and return 200
        // to avoid Apple retry storms for transient infrastructure issues
        request.log.error({ err }, 'Apple webhook JWT verification unexpected error')
        return { ok: true }
      }

      // ── Parse the events claim ───────────────────────────────────────────
      const eventsClaim = payload.events
      if (typeof eventsClaim !== 'string') {
        request.log.debug({ payload }, 'Apple webhook missing events claim')
        return reply.code(401).send({ error: 'Missing events claim' })
      }

      let parsedEvent: unknown
      try {
        parsedEvent = JSON.parse(eventsClaim)
      } catch {
        request.log.debug({ eventsClaim }, 'Apple webhook malformed events JSON')
        return reply.code(401).send({ error: 'Malformed events claim' })
      }

      if (!isAppleEventPayload(parsedEvent)) {
        request.log.debug({ parsedEvent }, 'Apple webhook invalid events structure')
        return reply.code(401).send({ error: 'Invalid events structure' })
      }

      const { type: eventType, sub: providerUserId } = parsedEvent

      // ── Look up user ─────────────────────────────────────────────────────
      // withTransaction without userId — webhook is unauthenticated, no RLS context
      await withTransaction(async (client) => {
        const oauthAccount = await queries.findOAuthAccount(client, 'apple', providerUserId)
        if (!oauthAccount) {
          request.log.debug({ providerUserId, eventType }, 'Apple webhook: no user found for sub')
          return
        }

        const userId = oauthAccount.user_id

        if (eventType === 'consent-revoked') {
          await queries.revokeAllUserRefreshTokens(client, userId)
          try {
            await queries.logAuthEvent(client, {
              user_id: userId,
              event_type: 'consent_revoked',
              ip_address: request.ip,
              user_agent: null,
              metadata: { provider: 'apple', apple_event_type: eventType },
            })
          } catch (auditErr) {
            request.log.error({ err: auditErr }, 'audit log failed for consent_revoked — revocation will commit')
          }
        } else if (eventType === 'account-delete') {
          await queries.deactivateUser(client, userId)
          await queries.revokeAllUserRefreshTokens(client, userId)
          try {
            await queries.logAuthEvent(client, {
              user_id: userId,
              event_type: 'account_deactivated',
              ip_address: request.ip,
              user_agent: null,
              metadata: { provider: 'apple', apple_event_type: eventType },
            })
          } catch (auditErr) {
            request.log.error({ err: auditErr }, 'audit log failed for account_deactivated — deactivation will commit')
          }
        } else {
          request.log.debug({ eventType, providerUserId }, 'Apple webhook: unknown event type, ignoring')
        }
      })

      return { ok: true }
    },
  )
}
