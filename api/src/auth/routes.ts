import { withTransaction } from '../db/pool.js'
import * as queries from '../db/queries.js'
import { verifyAppleToken, isPrivateRelayEmail } from './apple.js'
import { verifyGoogleToken } from './google.js'
import { hashToken, createAndStoreRefreshToken, rotateRefreshToken } from './tokens.js'
import { signinSchema, refreshSchema, logoutSchema, meSchema, linkAccountSchema } from './schemas.js'
import { REFRESH_TOKEN_COOKIE, setRefreshTokenCookie, clearRefreshTokenCookie, readSignedCookie } from './cookies.js'
import { isNetworkError, ProviderVerificationError, HttpError } from './errors.js'
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyBaseLogger } from 'fastify'
import type {
  User,
  SigninRequest,
  RefreshRequest,
  LogoutRequest,
  LinkAccountRequest,
  ProviderClaims,
  OAuthProvider,
} from '../types/index.js'

/** Maximum length for device_info / user-agent stored in refresh_tokens.device_info VARCHAR(255). */
const MAX_DEVICE_INFO_LENGTH = 255
/** Maximum length for user-agent stored in auth_events.user_agent VARCHAR(512). */
const MAX_AUDIT_USER_AGENT_LENGTH = 512
/** Maximum length for display_name stored in users.display_name VARCHAR(255). */
const MAX_DISPLAY_NAME_LENGTH = 255
/**
 * Maximum allowed avatar URL length. The DB column is TEXT (unbounded); this
 * application-level limit is the sole width constraint. If the column is ever
 * changed to VARCHAR, this constant must match.
 */
const MAX_AVATAR_URL_LENGTH = 2048

/**
 * UUID v4 regular expression for sub claim validation.
 * Case-insensitive: node-postgres always returns lowercase UUIDs, but we accept
 * uppercase input and normalise. The /i flag allows clients to pass UUIDs in any
 * case without rejecting valid tokens.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validate a string is a well-formed UUID. Returns true if valid.
 *
 * @param value - The string to test
 */
function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

/**
 * Type guard for a JWT payload object that contains a string `sub` claim.
 *
 * @param user - The value to test
 */
function isUserPayload(user: unknown): user is { sub: string } {
  return (
    typeof user === 'object' &&
    user !== null &&
    'sub' in user &&
    // TS cannot narrow property types from 'in' checks; cast to access .sub safely after shape guard
    typeof (user as Record<string, unknown>).sub === 'string'
  )
}

/**
 * Strip control characters, trim whitespace, and truncate a User-Agent string
 * to `maxLength`. Returns null when the header is absent or empty after sanitization.
 *
 * @param request - Fastify request object
 * @param maxLength - Column width to truncate to
 */
function sanitizeUserAgent(request: FastifyRequest, maxLength: number): string | null {
  const ua = request.headers['user-agent']
  if (typeof ua !== 'string') return null
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars from user input
  return ua.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength) || null
}

/**
 * Return the sanitized User-Agent truncated to refresh_tokens.device_info VARCHAR(255).
 *
 * @param request - Fastify request object
 */
function getUserAgent(request: FastifyRequest): string | null {
  return sanitizeUserAgent(request, MAX_DEVICE_INFO_LENGTH)
}

/**
 * Return the sanitized User-Agent truncated to auth_events.user_agent VARCHAR(512).
 *
 * @param request - Fastify request object
 */
function getRawUserAgent(request: FastifyRequest): string | null {
  return sanitizeUserAgent(request, MAX_AUDIT_USER_AGENT_LENGTH)
}

async function verifyProviderToken(
  provider: OAuthProvider,
  idToken: string,
  nonce?: string,
): Promise<ProviderClaims> {
  if (provider === 'apple') {
    if (!nonce) throw new ProviderVerificationError('Nonce is required for Apple Sign-In')
    return verifyAppleToken(idToken, nonce)
  }
  return verifyGoogleToken(idToken)
}

/**
 * Verify a provider token, returning the claims on success or sending an
 * error reply (401 / 503) and returning null on expected failure. Re-throws
 * unknown errors so the global error handler returns 500.
 *
 * @param provider - OAuth provider name
 * @param idToken - The provider's id_token
 * @param nonce - Optional nonce (required for Apple)
 * @param log - Fastify logger for infrastructure errors
 * @param reply - Fastify reply to send error responses on
 */
async function verifyProviderTokenOrReply(
  provider: OAuthProvider,
  idToken: string,
  nonce: string | undefined,
  log: FastifyBaseLogger,
  reply: FastifyReply,
): Promise<ProviderClaims | null> {
  try {
    return await verifyProviderToken(provider, idToken, nonce)
  } catch (err) {
    if (err instanceof ProviderVerificationError) {
      reply.code(401).send({ error: 'Invalid provider token' })
      return null // reply already sent; callers check `if (!claims) return`
    }
    if (isNetworkError(err)) {
      log.error({ err }, 'Provider token verification infrastructure error')
      reply.code(503).send({ error: 'Authentication service unavailable' })
      return null // reply already sent; callers check `if (!claims) return`
    }
    throw err
  }
}

/**
 * Whitelist only non-sensitive fields for raw_profile storage.
 *
 * `raw_profile` is stored as an immutable audit snapshot of what the provider
 * asserted at the time of account creation or linking. Callers should use the
 * dedicated columns (`oauth_accounts.provider_user_id`, `users.email_verified`)
 * as the authoritative source for provider data rather than reading from `raw_profile`.
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
 * Returns null when the result is empty after stripping (e.g. whitespace-only or
 * control-char-only input), so callers receive null rather than an empty string.
 *
 * @param name - Raw user-supplied display name
 */
function sanitizeDisplayName(name: string): string | null {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars from user input
  const stripped = name.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, MAX_DISPLAY_NAME_LENGTH)
  return stripped.length > 0 ? stripped : null
}

/**
 * Validate and sanitize an avatar URL. Only `https://` URLs that are
 * well-formed and within the length limit are accepted. Any other scheme
 * (e.g. javascript:, data:), malformed URL, or URL exceeding the maximum
 * length is rejected and null returned.
 *
 * @param url - Raw avatar URL from provider claims
 */
function sanitizeAvatarUrl(url: string | null | undefined): string | null {
  if (!url || url.length > MAX_AVATAR_URL_LENGTH) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    // Reject URLs containing credentials (userinfo) to prevent storing them in the DB
    if (parsed.username !== '' || parsed.password !== '') return null
    return parsed.href
  } catch {
    return null
  }
}

/**
 * Validate a user loaded during a race-condition fallback is not deactivated.
 * Throws HttpError(403) if the user account has been deactivated.
 *
 * @param user - User record loaded from a concurrent-insert re-fetch
 */
function assertNotDeactivated(user: Pick<User, 'deactivated_at'>): void {
  if (user.deactivated_at) {
    throw new HttpError(403, { error: 'Account deactivated' })
  }
}

/**
 * Handle the concurrent-insert race condition: when createOAuthAccount returns null
 * (ON CONFLICT DO NOTHING), re-fetch the existing oauth_account and its user.
 * Validates the re-fetched user is not deactivated.
 *
 * @param client - Database client (inside transaction)
 * @param provider - OAuth provider name
 * @param providerUserId - Provider-specific user identifier
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

/** Result from resolveOrCreateUser. */
interface ResolvedUser {
  user: queries.UserRow
  oauthAccount: queries.OAuthAccountRow
}

/**
 * Core signin logic: given verified provider claims, find or create the user
 * and OAuth account row. Handles:
 *  - Existing oauth_account → load user
 *  - Verified email match → link new provider to existing user
 *  - Brand-new user → insert user first, then oauth_account
 *  - Concurrent first-login race → re-fetch after ON CONFLICT
 *
 * @param client - Database client (inside transaction)
 * @param provider - OAuth provider name
 * @param claims - Verified claims from the provider's ID token
 * @param safeName - Sanitized display name from user_info (Apple first-login)
 * @param ip - Client IP address for audit log
 * @param ua - User-agent string truncated to 255 chars for device_info storage
 * @param rawUa - User-agent string truncated to 512 chars for audit log storage
 * @param log - Fastify logger for non-fatal audit log warnings
 */
async function resolveOrCreateUser(
  client: queries.QueriesClient,
  provider: OAuthProvider,
  claims: ProviderClaims,
  safeName: string | null,
  ip: string,
  ua: string | null,
  rawUa: string | null,
  log: FastifyBaseLogger,
): Promise<ResolvedUser> {
  // ── Branch A: existing oauth_account ──────────────────────────────────────
  // Use a single JOIN query to fetch both the oauth_account and user in one
  // round-trip — this is the most frequent code path (returning user signin).
  const existingWithUser = await queries.findOAuthAccountWithUser(client, provider, claims.sub)

  if (existingWithUser) {
    const { oauthAccount: existingOAuthAccount } = existingWithUser
    let existingUser = existingWithUser.user
    assertNotDeactivated(existingUser)

    // Upgrade email_verified if the provider now asserts it is true but stored value is false
    if (claims.email_verified && !existingUser.email_verified) {
      await queries.setUserEmailVerified(client, existingUser.id)
      // Reflect the upgrade in the returned user object without a second DB round-trip
      existingUser = { ...existingUser, email_verified: true }
    }

    // Update display_name if missing and provided
    if (safeName && !existingUser.display_name) {
      await queries.updateUserDisplayName(client, existingUser.id, safeName)
      return { user: { ...existingUser, display_name: safeName }, oauthAccount: existingOAuthAccount }
    }

    return { user: existingUser, oauthAccount: existingOAuthAccount }
  }

  // ── Branch B: verified-email account linking ───────────────────────────────
  // Security tradeoff: this path automatically links a new OAuth provider to an
  // existing account when the provider asserts email_verified = true and the email
  // matches an existing user. This is a deliberate, widely-adopted pattern (used by
  // Google, GitHub, etc.) that trades a small residual risk (a compromised or
  // attacker-controlled provider could silently take over the account) for a smooth
  // user experience (no extra consent step required for verified emails).
  //
  // The safeguard is that ONLY providers whose email_verified claim is true reach
  // this branch. All auto-link events are recorded as 'provider_auto_linked' (distinct
  // from user-initiated 'link_account') so security teams can monitor and alert on
  // this path independently.
  if (claims.email && claims.email_verified) {
    const existingUser = await queries.findUserByEmail(client, claims.email)

    if (existingUser) {
      assertNotDeactivated(existingUser)

      const oauthAccount = await queries.createOAuthAccount(client, {
        user_id: existingUser.id,
        provider,
        provider_user_id: claims.sub,
        email: claims.email,
        is_private_email: isPrivateRelayEmail(claims.email),
        raw_profile: sanitizeRawProfile(claims),
      })

      // Handle concurrent insert race — if insert returned null, re-fetch
      if (!oauthAccount) {
        const resolved = await handleOAuthConflict(client, provider, claims.sub)
        if (!resolved) {
          throw new Error('Concurrent request conflict, please retry')
        }
        return resolved
      }

      try {
        await queries.logAuthEvent(client, {
          user_id: existingUser.id,
          event_type: 'provider_auto_linked',
          ip_address: ip,
          user_agent: rawUa,
          metadata: { provider, auto_linked: true },
        })
      } catch (auditErr) {
        log.error({ err: auditErr }, 'audit log failed for provider_auto_linked — signin will commit')
      }

      return { user: existingUser, oauthAccount }
    }
  }

  // ── Branch C: new user — insert user first, then oauth_account ────────────
  // Inserting users first prevents the placeholder user_id FK violation.
  // The race-condition protection is the (provider, provider_user_id) UNIQUE
  // index on oauth_accounts, not the user row.
  const newUser = await queries.createUser(client, {
    email: claims.email,
    email_verified: claims.email_verified,
    display_name: safeName ?? (claims.name ? sanitizeDisplayName(claims.name) : null),
    avatar_url: sanitizeAvatarUrl(claims.picture),
  })

  const oauthAccount = await queries.createOAuthAccount(client, {
    user_id: newUser.id,
    provider,
    provider_user_id: claims.sub,
    email: claims.email,
    is_private_email: claims.email ? isPrivateRelayEmail(claims.email) : false,
    raw_profile: sanitizeRawProfile(claims),
  })

  // ON CONFLICT means another concurrent request created the oauth_account first.
  // Re-fetch to get the winner's user.
  if (!oauthAccount) {
    const resolved = await handleOAuthConflict(client, provider, claims.sub)
    if (!resolved) {
      throw new Error('Concurrent request conflict, please retry')
    }
    // The user row we created above is now an orphan (no linked oauth_account).
    // TODO(#42): add a scheduled cleanup job for any orphans missed by inline cleanup.
    // Attempt inline cleanup — if it fails, warn and continue (transaction still commits).
    try {
      await queries.deleteOrphanUser(client, newUser.id)
      // Cleanup succeeded: log at debug level since the orphan was resolved inline.
      log.debug(
        { orphanUserId: newUser.id, provider, providerUserId: claims.sub },
        'orphan user row created during concurrent signup race — cleaned up inline',
      )
    } catch (cleanupErr) {
      // Cleanup failed: log at warn level so the background job can pick this up.
      log.warn(
        { err: cleanupErr, orphanUserId: newUser.id, provider, providerUserId: claims.sub },
        'orphan user cleanup failed — will be caught by background job',
      )
    }
    return resolved
  }

  return { user: newUser, oauthAccount }
}

/**
 * Extract the refresh token from a request — checking both the signed httpOnly
 * cookie and the request body. Returns `{ token }` on success or
 * `{ statusCode, error }` when the token is missing or the cookie HMAC is invalid.
 *
 * @param request - Fastify request object
 */
function extractRefreshToken(
  request: FastifyRequest,
): { token: string } | { statusCode: number; error: string } {
  // Extract refresh_token from the request body with defensive guards.
  // request.body is typed as unknown on the base FastifyRequest; this helper is
  // shared across /refresh and /logout so we must guard before accessing properties.
  const body = request.body
  let rawBodyToken: string | null = null
  if (typeof body === 'object' && body !== null && 'refresh_token' in body) {
    // body typed as unknown on base FastifyRequest; typeof guard above confirms object shape
    const candidate = (body as Record<string, unknown>).refresh_token
    if (typeof candidate === 'string') {
      rawBodyToken = candidate
    }
  }
  // readSignedCookie atomically reads and verifies the HMAC of the signed cookie.
  // Cookies are stored in `s:value.hmac` wire format by @fastify/cookie when
  // signed:true is set; unsignCookie() strips the prefix and verifies the HMAC.
  const unsigned = readSignedCookie(request, REFRESH_TOKEN_COOKIE)
  if (unsigned !== null && !unsigned.valid) {
    // Cookie present but HMAC invalid — treat as tampered
    return { statusCode: 401, error: 'Invalid refresh token' }
  }
  const cookieToken = unsigned?.value ?? null
  const token = rawBodyToken ?? cookieToken
  if (!token) return { statusCode: 401, error: 'Missing refresh token' }
  return { token }
}

/**
 * Sign a JWT access token after a successful transaction. Throws a plain Error
 * (not HttpError) on failure so the global error handler can redact the message
 * in production.
 *
 * @param reply - Fastify reply (carries the jwtSign method)
 * @param userId - The user's UUID to embed as `sub`
 * @param log - Logger for recording signing failures
 * @param operation - Human-readable label for the log message (e.g. "signin", "refresh")
 */
async function signAccessToken(
  reply: FastifyReply,
  userId: string,
  log: FastifyBaseLogger,
  operation: string,
): Promise<string> {
  try {
    return await reply.jwtSign({ sub: userId })
  } catch (signErr) {
    log.error({ err: signErr }, `JWT signing failed after successful ${operation}`)
    throw new Error('Token signing failed', { cause: signErr })
  }
}

/**
 * Register all authentication routes under the /auth prefix.
 *
 * @param fastify - Fastify instance to register routes on
 * @param _opts - Fastify plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async even when no await is used
export async function authRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  // ─── Content-Type enforcement ─────────────────────────────────────────
  // Reject non-JSON POST requests to any route in this plugin scope.
  // Registered here (inside the plugin) rather than on the root instance so
  // the check is scoped exactly to /auth/* routes without brittle URL-prefix
  // string matching. Blocks CSRF via form submission (application/x-www-form-
  // urlencoded or multipart/form-data).

  fastify.addHook('preValidation', async (request, reply) => {
    if (request.method !== 'POST') return
    const contentType = request.headers['content-type']
    // Allow requests with no Content-Type header (zero-body POSTs).
    // A client sending a body-less POST correctly omits Content-Type entirely.
    if (contentType === undefined) return
    // Split on ';' to strip parameters (e.g. charset=utf-8) and compare only the MIME type.
    // startsWith() would incorrectly accept 'application/jsonp' or 'application/json-evil'.
    const baseType = (contentType.split(';')[0] ?? '').trim()
    if (baseType !== 'application/json') {
      return reply.code(415).send({ error: 'Content-Type must be application/json' })
    }
  })

  // ─── POST /signin ─────────────────────────────────────────────────────────

  fastify.post<{ Body: SigninRequest }>(
    '/signin',
    {
      schema: signinSchema,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { provider, id_token, nonce, user_info } = request.body

      const ip = request.ip
      const ua = getUserAgent(request)
      const rawUa = getRawUserAgent(request)
      const safeName = user_info?.name ? sanitizeDisplayName(user_info.name) : null

      const claims = await verifyProviderTokenOrReply(provider, id_token, nonce, fastify.log, reply)
      if (!claims) return

      const clientType = claims.client_type

      // userId is intentionally omitted — the user may not exist yet (new signup).
      // Auth tables must permit unauthenticated access (app.user_id = '') during signin.
      // Transaction handles all DB work; JWT signing happens after COMMIT
      const txResult = await withTransaction(async (client) => {
        const { user } = await resolveOrCreateUser(client, provider, claims, safeName, ip, ua, rawUa, fastify.log)

        // Generate refresh token (DB-bound); JWT signing deferred to after COMMIT
        const refreshToken = await createAndStoreRefreshToken(client, user.id, ua, clientType)

        // Log signin event — non-fatal: audit log failure must not roll back the business transaction
        try {
          await queries.logAuthEvent(client, {
            user_id: user.id,
            event_type: 'signin',
            ip_address: ip,
            user_agent: rawUa,
            metadata: { provider },
          })
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for signin — signin will commit')
        }

        return {
          userId: user.id,
          refreshToken,
          user: queries.toUserResponse(user),
        }
      })

      // JWT signing happens after transaction COMMIT — decoupled from DB lifecycle
      const accessToken = await signAccessToken(reply, txResult.userId, fastify.log, 'signin')

      if (clientType === 'native') {
        // Native clients (iOS/Android): token in body, no cookie
        return {
          access_token: accessToken,
          refresh_token: txResult.refreshToken,
          user: txResult.user,
        }
      }

      // Web clients: token in httpOnly cookie, null in body
      setRefreshTokenCookie(reply, txResult.refreshToken)
      return {
        access_token: accessToken,
        refresh_token: null,
        user: txResult.user,
      }
    },
  )

  // ─── POST /refresh ────────────────────────────────────────────────────────

  fastify.post<{ Body: RefreshRequest }>(
    '/refresh',
    {
      schema: refreshSchema,
      // Rate-limit by IP only. keyGenerator runs at onRequest time (before body
      // parsing), so request.body is always null there; a custom token-hash key
      // would silently always fall through to IP anyway.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const extracted = extractRefreshToken(request)
      if ('statusCode' in extracted) {
        return reply.code(extracted.statusCode).send({ error: extracted.error })
      }
      const { token: refreshToken } = extracted

      const tokenHash = hashToken(refreshToken)
      const ip = request.ip
      const ua = getUserAgent(request)
      const rawUa = getRawUserAgent(request)

      // Transaction handles all DB work; JWT signing deferred to after COMMIT.
      // refresh_tokens has NO RLS policies (confirmed in migrations 003–008) so
      // withTransaction is called without a userId — the unauthenticated context
      // (app.user_id = '') is intentional here; token lookup is by hash, not by user.
      //
      // Returns a tagged union: { type: 'reuse_detected', userId } when a revoked token
      // is presented (reuse detected, revocation committed), or { type: 'rotated', ... }
      // for the normal rotation result. Using a tagged return rather than throwing HttpError
      // inside the callback ensures the revocation transaction COMMITS before the 401 is
      // sent — HttpError thrown inside withTransaction triggers ROLLBACK.
      const txResult = await withTransaction(async (client) => {
        // Acquire a row lock (FOR UPDATE) to close the TOCTOU gap between
        // reuse detection and revocation — a single locked read replaces the
        // previous two-query pattern. The SQL also filters expired tokens via
        // AND expires_at > NOW() to avoid a separate JS date comparison.
        const token = await queries.findRefreshTokenForRotation(client, tokenHash)

        if (!token) {
          // Token not found or expired (SQL filters both with AND expires_at > NOW())
          throw new HttpError(401, { error: 'Invalid refresh token' })
        }

        // Token exists but is already revoked — reuse detected.
        // Revoke the entire token family for this user inside the current transaction.
        // Fail-closed: if revokeAllUserRefreshTokens throws, the transaction rolls back
        // and the caller receives a 500. This is intentional — we must not allow a
        // rotation to proceed when we know all tokens for this user should be revoked.
        // A 500 is safer than silently proceeding with potentially compromised tokens.
        //
        // IMPORTANT: Do NOT throw HttpError here. HttpError inside withTransaction triggers
        // ROLLBACK, which would undo the revocation. Instead, return a tagged union value so the
        // caller can send the 401 AFTER this transaction commits.
        if (token.revoked_at) {
          await queries.revokeAllUserRefreshTokens(client, token.user_id)
          // Audit log is best-effort: a failure must not roll back the security-critical
          // revocation. Log at error level — failing to record a security event is serious.
          try {
            await queries.logAuthEvent(client, {
              user_id: token.user_id,
              event_type: 'token_reuse_detected',
              ip_address: ip,
              user_agent: rawUa,
            })
          } catch (auditErr) {
            fastify.log.error({ err: auditErr }, 'audit log failed for token_reuse_detected — security revocation will commit')
          }
          // Return tagged union value — revocation is committed when withTransaction resolves normally
          return { type: 'reuse_detected' as const, userId: token.user_id }
        }

        // NOTE: getUserStatus has no row lock. This is safe only if account deactivation
        // atomically revokes all refresh tokens. If that invariant is ever broken, a narrow
        // race exists between token lock acquisition and this deactivation check.
        // Check user is not deactivated
        const userStatus = await queries.getUserStatus(client, token.user_id)
        // Both 'not_found' and 'deactivated' return the same message to prevent user enumeration
        if (userStatus === 'not_found' || userStatus === 'deactivated') {
          throw new HttpError(403, { error: 'Account deactivated' })
        }

        // Rotate: revoke old, create new (carry over the stored client_type)
        const newRefreshToken = await rotateRefreshToken(
          client,
          tokenHash,
          token.user_id,
          ua,
          token.client_type,
        )

        // Non-fatal: audit log failure must not roll back the token rotation
        try {
          await queries.logAuthEvent(client, {
            user_id: token.user_id,
            event_type: 'refresh',
            ip_address: ip,
            user_agent: rawUa,
          })
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for refresh — token rotation will commit')
        }

        return {
          type: 'rotated' as const,
          userId: token.user_id,
          refreshToken: newRefreshToken,
          clientType: token.client_type,
        }
      })

      // Revocation committed above (transaction returned normally). Send 401 now,
      // outside the transaction, so the DB write is guaranteed to have persisted.
      if (txResult.type === 'reuse_detected') {
        return reply.code(401).send({ error: 'Token reuse detected' })
      }

      // JWT signing happens after transaction COMMIT — decoupled from DB lifecycle
      const accessToken = await signAccessToken(reply, txResult.userId, fastify.log, 'refresh')

      if (txResult.clientType === 'native') {
        // Native clients: token in body, no cookie
        return {
          access_token: accessToken,
          refresh_token: txResult.refreshToken,
        }
      }

      // Web clients: token in httpOnly cookie, null in body
      setRefreshTokenCookie(reply, txResult.refreshToken)
      return {
        access_token: accessToken,
        refresh_token: null,
      }
    },
  )

  // ─── POST /logout ─────────────────────────────────────────────────────────

  fastify.post<{ Body: LogoutRequest }>(
    '/logout',
    {
      schema: logoutSchema,
      preHandler: [fastify.authenticate],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const extracted = extractRefreshToken(request)
      if ('statusCode' in extracted) {
        return reply.code(extracted.statusCode).send({ error: extracted.error })
      }
      const { token: refreshToken } = extracted

      if (!isUserPayload(request.user)) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      const user = request.user

      // Validate sub is a well-formed UUID before doing any DB work (matches layout of /link-account)
      if (!isValidUuid(user.sub)) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      const tokenHash = hashToken(refreshToken)
      const ip = request.ip
      const rawUa = getRawUserAgent(request)

      await withTransaction(async (client) => {
        // Intentionally uses findRefreshTokenByHash (no expiry filter) so users can
        // revoke sessions even after the refresh token has expired. This ensures a
        // clean logout regardless of token state.
        const token = await queries.findRefreshTokenByHash(client, tokenHash)

        if (!token) {
          // Token not found — log a warning for observability; do NOT clear cookie
          // since the token was never actually revoked.
          request.log.warn({ tokenHashPrefix: tokenHash.slice(0, 8), userId: user.sub }, 'Logout: refresh token not found in database')
          throw new HttpError(401, { error: 'Invalid refresh token' })
        }

        if (token.user_id !== user.sub) {
          throw new HttpError(403, { error: 'Token does not belong to this user' })
        }

        if (token.revoked_at !== null) {
          throw new HttpError(401, { error: 'Refresh token already revoked' })
        }

        await queries.revokeRefreshToken(client, tokenHash)

        // Non-fatal: audit log failure must not roll back the token revocation
        try {
          await queries.logAuthEvent(client, {
            user_id: user.sub,
            event_type: 'logout',
            ip_address: ip,
            user_agent: rawUa,
          })
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for logout — token revocation will commit')
        }
      }, user.sub)

      // Clear the httpOnly cookie only after the transaction has committed successfully.
      // Keeping this outside the callback ensures the HTTP response is only mutated
      // once the DB state is confirmed, and keeps side-effects out of the DB callback.
      clearRefreshTokenCookie(reply)

      return reply.code(204).send()
    },
  )

  // ─── GET /me ─────────────────────────────────────────────────────────────

  fastify.get(
    '/me',
    {
      schema: meSchema,
      preHandler: [fastify.authenticate],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!isUserPayload(request.user)) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      const user = request.user

      if (!isValidUuid(user.sub)) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      const result = await withTransaction(async (client) => {
        const userWithAccounts = await queries.findUserWithAccounts(client, user.sub)
        if (!userWithAccounts) {
          throw new HttpError(401, { error: 'User not found' })
        }

        return {
          ...queries.toUserResponse(userWithAccounts.user),
          linked_accounts: userWithAccounts.accounts.map((a) => ({
            provider: a.provider,
            email: a.email,
          })),
        }
      }, user.sub)

      return result
    },
  )

  // ─── POST /link-account ───────────────────────────────────────────────────

  fastify.post<{ Body: LinkAccountRequest }>(
    '/link-account',
    {
      schema: linkAccountSchema,
      preHandler: [fastify.authenticate],
      // Rate-limit by IP only. keyGenerator runs at onRequest time (before JWT
      // preHandler), so request.user is not yet populated; accessing it there
      // would throw a 500.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { provider, id_token, nonce } = request.body

      if (!isUserPayload(request.user)) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }
      const user = request.user
      const ip = request.ip
      const rawUa = getRawUserAgent(request)

      // Validate sub is a well-formed UUID before using it in DB queries
      if (!isValidUuid(user.sub)) {
        return reply.code(401).send({ error: 'Unauthorized' })
      }

      const claims = await verifyProviderTokenOrReply(provider, id_token, nonce, fastify.log, reply)
      if (!claims) return

      const result = await withTransaction(async (client) => {
        // TOCTOU note: the findOAuthAccount + userHasProvider pre-checks below run without
        // a FOR UPDATE lock, so a concurrent request could link the same account between
        // these reads and the createOAuthAccount write. This is intentional: the
        // ON CONFLICT DO NOTHING clause in createOAuthAccount is the authoritative safety
        // guard. The pre-checks are best-effort only — they exist to return user-friendly
        // error messages rather than to enforce uniqueness. The TOCTOU window is acceptable
        // because the worst outcome is a generic "Account already linked" 409 from the
        // ON CONFLICT path rather than a tailored message from the pre-check path.

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
        const linked = await queries.createOAuthAccount(client, {
          user_id: user.sub,
          provider,
          provider_user_id: claims.sub,
          email: claims.email,
          is_private_email: claims.email ? isPrivateRelayEmail(claims.email) : false,
          raw_profile: sanitizeRawProfile(claims),
        })

        // ON CONFLICT DO NOTHING returned null — a concurrent request already linked this account
        if (!linked) {
          throw new HttpError(409, { error: 'Account already linked' })
        }

        // Non-fatal: audit log failure must not roll back the account link
        try {
          await queries.logAuthEvent(client, {
            user_id: user.sub,
            event_type: 'link_account',
            ip_address: ip,
            user_agent: rawUa,
            metadata: { provider },
          })
        } catch (auditErr) {
          fastify.log.error({ err: auditErr }, 'audit log failed for link_account — account link will commit')
        }

        // Return updated user with linked accounts in a single JOIN query
        const userWithAccounts = await queries.findUserWithAccounts(client, user.sub)
        if (!userWithAccounts) throw new HttpError(500, { error: 'Failed to fetch user after account link' })

        return {
          ...queries.toUserResponse(userWithAccounts.user),
          linked_accounts: userWithAccounts.accounts.map((a) => ({
            provider: a.provider,
            email: a.email,
          })),
        }
      }, user.sub)

      return result
    },
  )
}
