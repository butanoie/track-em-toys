import type { FastifyInstance, FastifyRequest } from 'fastify'
import { withTransaction } from '../db/pool.js'
import * as queries from '../db/queries.js'
import { verifyAppleToken, isPrivateRelayEmail } from './apple.js'
import { verifyGoogleToken } from './google.js'
import { hashToken, createAndStoreRefreshToken, rotateRefreshToken } from './tokens.js'
import { signinSchema, refreshSchema, logoutSchema, linkAccountSchema } from './schemas.js'
import { REFRESH_TOKEN_COOKIE, setRefreshTokenCookie, clearRefreshTokenCookie } from './cookies.js'
import type {
  SigninRequest,
  RefreshRequest,
  LogoutRequest,
  LinkAccountRequest,
  ProviderClaims,
  OAuthProvider,
} from '../types/index.js'

/** Structured error thrown inside transactions to trigger ROLLBACK + HTTP response. */
export class HttpError extends Error {
  /**
   * Create an HttpError that will be caught outside the transaction.
   *
   * @param statusCode - HTTP status code to return
   * @param body - JSON response body
   */
  constructor(
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(JSON.stringify(body))
    this.name = 'HttpError'
  }
}

function getUserAgent(request: FastifyRequest): string | null {
  const ua = request.headers['user-agent']
  return typeof ua === 'string' ? ua.slice(0, 512) : null
}

async function verifyProviderToken(
  provider: OAuthProvider,
  idToken: string,
  nonce?: string,
): Promise<ProviderClaims> {
  if (provider === 'apple') {
    if (!nonce) throw new Error('Nonce is required for Apple Sign-In')
    return verifyAppleToken(idToken, nonce)
  }
  return verifyGoogleToken(idToken)
}

/**
 * Whitelist only non-sensitive fields for raw_profile storage.
 *
 * @param claims - Provider claims to extract safe fields from
 */
function sanitizeRawProfile(claims: ProviderClaims): Record<string, unknown> {
  return {
    sub: claims.sub,
    email_verified: claims.email_verified,
  }
}

/**
 * Strip control characters and trim whitespace from user-supplied names.
 *
 * @param name - Raw user-supplied display name
 */
function sanitizeDisplayName(name: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars from user input
  return name.replace(/[\x00-\x1F\x7F]/g, '').trim()
}

/**
 * Validate a user loaded during a race-condition fallback is not deactivated.
 * Throws HttpError(403) if the user account has been deactivated.
 *
 * @param user - User record loaded from a concurrent-insert re-fetch
 */
function assertNotDeactivated(user: { deactivated_at: string | null }): void {
  if (user.deactivated_at) {
    throw new HttpError(403, { error: 'Account deactivated' })
  }
}

/**
 * Handle the concurrent-insert race condition: when createOAuthAccount returns null
 * (ON CONFLICT DO NOTHING), re-fetch the existing oauth_account and its user.
 * Validates the re-fetched user is not deactivated.
 *
 * @returns The re-fetched user, or null if the oauth_account was not found (should not happen)
 */
async function handleOAuthConflict(
  client: queries.QueriesClient,
  provider: OAuthProvider,
  providerUserId: string,
): Promise<{ user: queries.UserRow; oauthAccount: queries.OAuthAccountRow } | null> {
  const oauthAccount = await queries.findOAuthAccount(client, provider, providerUserId)
  if (!oauthAccount) return null

  const user = await queries.findUserById(client, oauthAccount.user_id)
  if (!user) throw new Error('User not found for oauth account')
  assertNotDeactivated(user)

  return { user, oauthAccount }
}

/**
 * Register all authentication routes under the /auth prefix.
 *
 * @param fastify - Fastify instance to register routes on
 */
export function authRoutes(fastify: FastifyInstance): void {
  // ─── POST /signin ─────────────────────────────────────────────────────────

  fastify.post<{ Body: SigninRequest }>(
    '/signin',
    {
      schema: signinSchema,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { provider, id_token, nonce, user_info } = request.body

      const claims = await verifyProviderToken(provider, id_token, nonce)
      const ip = request.ip
      const ua = getUserAgent(request)
      const safeName = user_info?.name ? sanitizeDisplayName(user_info.name) : null

      try {
        // Transaction handles all DB work; JWT signing happens after COMMIT
        const txResult = await withTransaction(async (client) => {
          // Step 3: Look up existing oauth_account
          let oauthAccount = await queries.findOAuthAccount(client, provider, claims.sub)

          let user

          if (oauthAccount) {
            // Step 4: Existing account — load user
            user = await queries.findUserById(client, oauthAccount.user_id)
            if (!user) throw new Error('User not found for oauth account')
            assertNotDeactivated(user)

            // Update display_name if missing and provided
            if (safeName && !user.display_name) {
              await queries.updateUserDisplayName(client, user.id, safeName)
              user.display_name = safeName
            }
          } else if (claims.email && claims.email_verified) {
            // Step 5: Try account linking by verified email
            const existingUser = await queries.findUserByEmail(client, claims.email)

            if (existingUser) {
              assertNotDeactivated(existingUser)
              user = existingUser

              // Create the oauth_account link
              oauthAccount = await queries.createOAuthAccount(client, {
                user_id: user.id,
                provider,
                provider_user_id: claims.sub,
                email: claims.email,
                is_private_email: isPrivateRelayEmail(claims.email),
                raw_profile: sanitizeRawProfile(claims),
              })

              // Handle concurrent insert race — if insert returned null, re-fetch
              if (!oauthAccount) {
                const resolved = await handleOAuthConflict(client, provider, claims.sub)
                if (resolved) {
                  user = resolved.user
                  oauthAccount = resolved.oauthAccount
                }
              }

              await queries.logAuthEvent(client, {
                user_id: user.id,
                event_type: 'link_account',
                ip_address: ip,
                user_agent: ua,
                metadata: { provider, auto_linked: true },
              })
            } else {
              // Step 6: New user — insert oauth_account first to avoid orphans
              oauthAccount = await queries.createOAuthAccount(client, {
                user_id: '', // placeholder — will be updated after user creation
                provider,
                provider_user_id: claims.sub,
                email: claims.email,
                is_private_email: isPrivateRelayEmail(claims.email),
                raw_profile: sanitizeRawProfile(claims),
              })

              // ON CONFLICT means another request already created this oauth_account
              if (!oauthAccount) {
                const resolved = await handleOAuthConflict(client, provider, claims.sub)
                if (resolved) {
                  user = resolved.user
                  oauthAccount = resolved.oauthAccount
                }
              } else {
                // We won the race — create user and link the oauth_account
                user = await queries.createUser(client, {
                  email: claims.email,
                  email_verified: claims.email_verified,
                  display_name: safeName ?? claims.name ?? null,
                  avatar_url: claims.picture ?? null,
                })

                await queries.updateOAuthAccountUserId(client, oauthAccount.id, user.id)
                oauthAccount.user_id = user.id
              }
            }
          } else {
            // Step 6 (no email or unverified): New user without email linking
            // Insert oauth_account first to avoid orphan users on race condition
            oauthAccount = await queries.createOAuthAccount(client, {
              user_id: '', // placeholder — will be updated after user creation
              provider,
              provider_user_id: claims.sub,
              email: claims.email,
              is_private_email: claims.email ? isPrivateRelayEmail(claims.email) : false,
              raw_profile: sanitizeRawProfile(claims),
            })

            if (!oauthAccount) {
              const resolved = await handleOAuthConflict(client, provider, claims.sub)
              if (resolved) {
                user = resolved.user
                oauthAccount = resolved.oauthAccount
              }
            } else {
              user = await queries.createUser(client, {
                email: claims.email,
                email_verified: claims.email_verified,
                display_name: safeName ?? claims.name ?? null,
                avatar_url: claims.picture ?? null,
              })

              await queries.updateOAuthAccountUserId(client, oauthAccount.id, user.id)
              oauthAccount.user_id = user.id
            }
          }

          if (!user) throw new Error('Failed to resolve user during signin')

          // Step 8: Generate refresh token (DB-bound); JWT signing deferred to after COMMIT
          const refreshToken = await createAndStoreRefreshToken(client, user.id, ua)

          // Step 9: Log signin event
          await queries.logAuthEvent(client, {
            user_id: user.id,
            event_type: 'signin',
            ip_address: ip,
            user_agent: ua,
            metadata: { provider },
          })

          return {
            userId: user.id,
            refreshToken,
            user: queries.toUserResponse(user),
          }
        })

        // JWT signing happens after transaction COMMIT — decoupled from DB lifecycle
        const accessToken = await reply.jwtSign({ sub: txResult.userId })

        // Set refresh token as httpOnly cookie for web clients
        setRefreshTokenCookie(reply, txResult.refreshToken)

        return {
          access_token: accessToken,
          refresh_token: txResult.refreshToken,
          user: txResult.user,
        }
      } catch (err) {
        if (err instanceof HttpError) {
          return reply.code(err.statusCode).send(err.body)
        }
        throw err
      }
    },
  )

  // ─── POST /refresh ────────────────────────────────────────────────────────

  fastify.post<{ Body: RefreshRequest }>(
    '/refresh',
    {
      schema: refreshSchema,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => {
            // Rate-limit by token hash (not just IP) to prevent bypass via IP rotation
            const body = request.body as RefreshRequest | undefined
            if (body?.refresh_token) return hashToken(body.refresh_token)
            return request.ip
          },
        },
      },
    },
    async (request, reply) => {
      // Accept refresh token from body or httpOnly cookie
      const bodyToken = request.body.refresh_token
      const cookieToken = request.cookies[REFRESH_TOKEN_COOKIE]
      const refresh_token = bodyToken || cookieToken

      if (!refresh_token) {
        return reply.code(400).send({ error: 'Missing refresh token' })
      }

      const tokenHash = hashToken(refresh_token)
      const ip = request.ip
      const ua = getUserAgent(request)

      try {
        // Transaction handles all DB work; JWT signing deferred to after COMMIT
        const txResult = await withTransaction(async (client) => {
          // Check if token exists at all (for reuse detection)
          const existingToken = await queries.findRefreshTokenByHash(client, tokenHash)

          if (existingToken && existingToken.revoked_at) {
            // Token reuse detected — revoke all tokens for this user
            await queries.revokeAllUserRefreshTokens(client, existingToken.user_id)
            await queries.logAuthEvent(client, {
              user_id: existingToken.user_id,
              event_type: 'token_reuse_detected',
              ip_address: ip,
              user_agent: ua,
            })
            throw new HttpError(401, { error: 'Token reuse detected' })
          }

          // Find active (non-revoked, non-expired) token
          const activeToken = await queries.findActiveRefreshToken(client, tokenHash)
          if (!activeToken) {
            throw new HttpError(401, { error: 'Invalid refresh token' })
          }

          // Check user is not deactivated
          const userStatus = await queries.getUserStatus(client, activeToken.user_id)
          if (userStatus === 'not_found' || userStatus === 'deactivated') {
            throw new HttpError(403, { error: 'Account deactivated' })
          }

          // Rotate: revoke old, create new
          const newRefreshToken = await rotateRefreshToken(
            client,
            tokenHash,
            activeToken.user_id,
            ua,
          )

          await queries.logAuthEvent(client, {
            user_id: activeToken.user_id,
            event_type: 'refresh',
            ip_address: ip,
            user_agent: ua,
          })

          return {
            userId: activeToken.user_id,
            refreshToken: newRefreshToken,
          }
        })

        // JWT signing happens after transaction COMMIT
        const accessToken = await reply.jwtSign({ sub: txResult.userId })

        // Set rotated refresh token as httpOnly cookie for web clients
        setRefreshTokenCookie(reply, txResult.refreshToken)

        return {
          access_token: accessToken,
          refresh_token: txResult.refreshToken,
        }
      } catch (err) {
        if (err instanceof HttpError) {
          return reply.code(err.statusCode).send(err.body)
        }
        throw err
      }
    },
  )

  // ─── POST /logout ─────────────────────────────────────────────────────────

  fastify.post<{ Body: LogoutRequest }>(
    '/logout',
    {
      schema: logoutSchema,
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      // Accept refresh token from body or httpOnly cookie
      const bodyToken = request.body.refresh_token
      const cookieToken = request.cookies[REFRESH_TOKEN_COOKIE]
      const refresh_token = bodyToken || cookieToken

      if (!refresh_token) {
        return reply.code(400).send({ error: 'Missing refresh token' })
      }

      const tokenHash = hashToken(refresh_token)
      const user = request.user as { sub: string }
      const ip = request.ip
      const ua = getUserAgent(request)

      await withTransaction(async (client) => {
        // Verify token belongs to the authenticated user before revoking
        const token = await queries.findRefreshTokenByHash(client, tokenHash)
        if (token && token.user_id !== user.sub) {
          throw new HttpError(403, { error: 'Token does not belong to this user' })
        }

        await queries.revokeRefreshToken(client, tokenHash)
        await queries.logAuthEvent(client, {
          user_id: user.sub,
          event_type: 'logout',
          ip_address: ip,
          user_agent: ua,
        })
      }, user.sub)

      // Clear the httpOnly cookie
      clearRefreshTokenCookie(reply)

      return reply.code(204).send()
    },
  )

  // ─── POST /link-account ───────────────────────────────────────────────────

  fastify.post<{ Body: LinkAccountRequest }>(
    '/link-account',
    {
      schema: linkAccountSchema,
      preHandler: [fastify.authenticate],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => {
            return (request.user as { sub: string }).sub
          },
        },
      },
    },
    async (request, reply) => {
      const { provider, id_token, nonce } = request.body
      const user = request.user as { sub: string }
      const ip = request.ip
      const ua = getUserAgent(request)

      const claims = await verifyProviderToken(provider, id_token, nonce)

      try {
        const result = await withTransaction(async (client) => {
          // Check if provider account already linked to another user
          const existing = await queries.findOAuthAccount(client, provider, claims.sub)
          if (existing && existing.user_id !== user.sub) {
            throw new HttpError(409, {
              error: 'This provider account is already linked to a different user',
            })
          }

          // Check if current user already has this provider
          const hasProvider = await queries.userHasProvider(client, user.sub, provider)
          if (hasProvider) {
            throw new HttpError(409, {
              error: 'You already have an account linked with this provider',
            })
          }

          // Create the link
          await queries.createOAuthAccount(client, {
            user_id: user.sub,
            provider,
            provider_user_id: claims.sub,
            email: claims.email,
            is_private_email: claims.email ? isPrivateRelayEmail(claims.email) : false,
            raw_profile: sanitizeRawProfile(claims),
          })

          await queries.logAuthEvent(client, {
            user_id: user.sub,
            event_type: 'link_account',
            ip_address: ip,
            user_agent: ua,
            metadata: { provider },
          })

          // Return updated user with linked accounts
          const updatedUser = await queries.findUserById(client, user.sub)
          const accounts = await queries.findOAuthAccountsByUserId(client, user.sub)

          if (!updatedUser) throw new Error('User not found after link')

          return {
            ...queries.toUserResponse(updatedUser),
            linked_accounts: accounts.map((a) => ({
              provider: a.provider,
              email: a.email,
            })),
          }
        }, user.sub)

        return result
      } catch (err) {
        if (err instanceof HttpError) {
          return reply.code(err.statusCode).send(err.body)
        }
        throw err
      }
    },
  )
}
