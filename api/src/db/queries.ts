import net from 'node:net'
import type pg from 'pg'
import type {
  User,
  OAuthAccount,
  RefreshToken,
  AuthEventType,
  OAuthProvider,
  UserResponse,
  ClientType,
} from '../types/index.js'

/** Re-export PoolClient so route helpers can accept a typed client parameter. */
export type { PoolClient as QueriesClient } from './pool.js'
/** Re-export row types for use in route helpers. */
export type { User as UserRow, OAuthAccount as OAuthAccountRow } from '../types/index.js'

/**
 * Minimal database client interface: only the promise-returning `query` overload.
 * Used for narrowing parameters in functions that only execute SQL and do not
 * need acquire/release semantics (e.g. token helpers called from tokens.ts).
 * A full `PoolClient` satisfies this type, so callers are not broken.
 *
 * We intentionally do not use `Pick<PoolClient, 'query'>` here because that
 * would include the callback-based overloads that return `void`, which makes
 * `vi.fn().mockResolvedValue(QueryResult<T>)` fail in test files.
 */
export interface QueryOnlyClient {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    queryTextOrConfig: string | pg.QueryConfig,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>
}

/** Maximum length for user_agent stored in auth_events.user_agent VARCHAR(512). */
const MAX_AUTH_EVENT_USER_AGENT_LENGTH = 512

// ─── Users ───────────────────────────────────────────────────────────────────

/**
 * Find a user by their primary key.
 *
 * @param client - Database client
 * @param id - User UUID
 */
export async function findUserById(
  client: QueryOnlyClient,
  id: string,
): Promise<User | null> {
  const { rows } = await client.query<User>(
    'SELECT id, email, email_verified, display_name, avatar_url, deactivated_at, created_at, updated_at FROM users WHERE id = $1',
    [id],
  )
  return rows[0] ?? null
}

/**
 * Find a user by verified email (case-insensitive).
 *
 * @param client - Database client
 * @param email - Email address to search
 */
export async function findUserByEmail(
  client: QueryOnlyClient,
  email: string,
): Promise<User | null> {
  const { rows } = await client.query<User>(
    'SELECT id, email, email_verified, display_name, avatar_url, deactivated_at, created_at, updated_at FROM users WHERE LOWER(email) = LOWER($1) AND email_verified = true',
    [email],
  )
  return rows[0] ?? null
}

/**
 * Create a new user record.
 *
 * NOTE: The returned `User.email` is the lowercased form stored by the database
 * (via `LOWER($1)`), which may differ from the input `email` parameter.
 *
 * @param client - Database client
 * @param params - User fields to insert
 */
export async function createUser(
  client: QueryOnlyClient,
  params: {
    email: string | null
    email_verified: boolean
    display_name: string | null
    avatar_url: string | null
  },
): Promise<User> {
  const { rows } = await client.query<User>(
    `INSERT INTO users (email, email_verified, display_name, avatar_url)
     VALUES (LOWER($1), $2, $3, $4)
     RETURNING id, email, email_verified, display_name, avatar_url, deactivated_at, created_at, updated_at`,
    [params.email, params.email_verified, params.display_name, params.avatar_url],
  )
  const user = rows[0]
  if (!user) throw new Error('INSERT INTO users returned no rows')
  return user
}

/**
 * Set display_name if it is currently null (idempotent for Apple name persistence).
 *
 * @param client - Database client
 * @param userId - User UUID
 * @param displayName - The name to set
 */
export async function updateUserDisplayName(
  client: QueryOnlyClient,
  userId: string,
  displayName: string,
): Promise<void> {
  await client.query(
    `UPDATE users SET display_name = $2, updated_at = NOW()
     WHERE id = $1 AND display_name IS NULL`,
    [userId, displayName],
  )
}

/**
 * Upgrade a user's email_verified flag to true.
 * Only performs the UPDATE when email_verified is currently false to avoid
 * unnecessary writes on the hot signin path.
 *
 * @param client - Database client
 * @param userId - User UUID
 */
export async function setUserEmailVerified(
  client: QueryOnlyClient,
  userId: string,
): Promise<void> {
  await client.query(
    'UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1 AND email_verified = false',
    [userId],
  )
}

export type UserStatus = 'active' | 'deactivated' | 'not_found'

/**
 * Get the account status of a user: active, deactivated, or not found.
 *
 * @param client - Database client
 * @param userId - User UUID
 */
export async function getUserStatus(
  client: QueryOnlyClient,
  userId: string,
): Promise<UserStatus> {
  const { rows } = await client.query<{ deactivated_at: string | null }>(
    'SELECT deactivated_at FROM users WHERE id = $1',
    [userId],
  )
  const row = rows[0]
  if (!row) return 'not_found'
  return row.deactivated_at !== null ? 'deactivated' : 'active'
}

/**
 * Mark a user as deactivated by setting deactivated_at to NOW().
 * No-op if the user is already deactivated (WHERE deactivated_at IS NULL).
 *
 * @param client - Database client
 * @param userId - User UUID
 */
export async function deactivateUser(
  client: QueryOnlyClient,
  userId: string,
): Promise<void> {
  await client.query(
    'UPDATE users SET deactivated_at = NOW(), updated_at = NOW() WHERE id = $1 AND deactivated_at IS NULL',
    [userId],
  )
}

// ─── OAuth Accounts ──────────────────────────────────────────────────────────

/** Combined result from findOAuthAccountWithUser. */
export interface OAuthAccountWithUser {
  oauthAccount: OAuthAccount
  user: User
}

/**
 * Find an OAuth account together with its owning user in a single JOIN query.
 * This is the hot path for Branch A (returning user signin) — it replaces the
 * two sequential queries findOAuthAccount + findUserById with one round-trip.
 *
 * Returns null when no oauth_account matches (provider, providerUserId), OR when
 * the oauth_account exists but the users row is missing (FK orphan). The INNER JOIN
 * means both cases produce zero rows and are indistinguishable from the caller's
 * perspective — the function always returns null for "not found".
 *
 * @param client - Database client
 * @param provider - OAuth provider name
 * @param providerUserId - The user's ID at the provider
 */
export async function findOAuthAccountWithUser(
  client: QueryOnlyClient,
  provider: OAuthProvider,
  providerUserId: string,
): Promise<OAuthAccountWithUser | null> {
  const { rows } = await client.query<{
    oauth_account_id: string
    oa_user_id: string
    oa_provider: OAuthProvider
    oa_provider_user_id: string
    oa_email: string | null
    oa_is_private_email: boolean
    oa_raw_profile: Record<string, unknown> | null
    oa_created_at: string
    user_id: string
    user_email: string | null
    email_verified: boolean
    display_name: string | null
    avatar_url: string | null
    deactivated_at: string | null
    user_created_at: string
    updated_at: string
  }>(
    `SELECT
       oa.id                 AS oauth_account_id,
       oa.user_id            AS oa_user_id,
       oa.provider           AS oa_provider,
       oa.provider_user_id   AS oa_provider_user_id,
       oa.email              AS oa_email,
       oa.is_private_email   AS oa_is_private_email,
       oa.raw_profile        AS oa_raw_profile,
       oa.created_at         AS oa_created_at,
       u.id                  AS user_id,
       u.email               AS user_email,
       u.email_verified,
       u.display_name,
       u.avatar_url,
       u.deactivated_at,
       u.created_at          AS user_created_at,
       u.updated_at
     FROM oauth_accounts oa
     JOIN users u ON u.id = oa.user_id
     WHERE oa.provider = $1 AND oa.provider_user_id = $2`,
    [provider, providerUserId],
  )

  const row = rows[0]
  if (!row) return null

  const oauthAccount: OAuthAccount = {
    id: row.oauth_account_id,
    user_id: row.oa_user_id,
    provider: row.oa_provider,
    provider_user_id: row.oa_provider_user_id,
    email: row.oa_email,
    is_private_email: row.oa_is_private_email,
    raw_profile: row.oa_raw_profile,
    created_at: row.oa_created_at,
  }

  const user: User = {
    id: row.user_id,
    email: row.user_email,
    email_verified: row.email_verified,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    deactivated_at: row.deactivated_at,
    created_at: row.user_created_at,
    updated_at: row.updated_at,
  }

  return { oauthAccount, user }
}

/**
 * Find an OAuth account by provider and provider-specific user ID.
 *
 * @param client - Database client
 * @param provider - OAuth provider name
 * @param providerUserId - The user's ID at the provider
 */
export async function findOAuthAccount(
  client: QueryOnlyClient,
  provider: OAuthProvider,
  providerUserId: string,
): Promise<OAuthAccount | null> {
  const { rows } = await client.query<OAuthAccount>(
    'SELECT id, user_id, provider, provider_user_id, email, is_private_email, raw_profile, created_at FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerUserId],
  )
  return rows[0] ?? null
}

/**
 * Insert an OAuth account link. Uses ON CONFLICT DO NOTHING for concurrent-safe first-login.
 * Returns null if the row already existed (conflict).
 *
 * @param client - Database client
 * @param params - OAuth account fields
 */
export async function createOAuthAccount(
  client: QueryOnlyClient,
  params: {
    user_id: string
    provider: OAuthProvider
    provider_user_id: string
    email: string | null
    is_private_email: boolean
    raw_profile: Record<string, unknown> | null
  },
): Promise<OAuthAccount | null> {
  const { rows } = await client.query<OAuthAccount>(
    `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, is_private_email, raw_profile)
     VALUES ($1, $2, $3, LOWER($4), $5, $6)
     ON CONFLICT (provider, provider_user_id) DO NOTHING
     RETURNING id, user_id, provider, provider_user_id, email, is_private_email, raw_profile, created_at`,
    [
      params.user_id,
      params.provider,
      params.provider_user_id,
      params.email,
      params.is_private_email,
      params.raw_profile ? JSON.stringify(params.raw_profile) : null,
    ],
  )
  return rows[0] ?? null
}

/**
 * Get all OAuth accounts linked to a user.
 *
 * @param client - Database client
 * @param userId - User UUID
 */
export async function findOAuthAccountsByUserId(
  client: QueryOnlyClient,
  userId: string,
): Promise<OAuthAccount[]> {
  const { rows } = await client.query<OAuthAccount>(
    'SELECT id, user_id, provider, provider_user_id, email, is_private_email, raw_profile, created_at FROM oauth_accounts WHERE user_id = $1',
    [userId],
  )
  return rows
}

/** Shape returned by findUserWithAccounts. */
export interface UserWithAccounts {
  user: User
  accounts: OAuthAccount[]
}

/** Row shape returned by the LEFT JOIN query inside findUserWithAccounts. */
type UserWithAccountsRow = User & {
  oa_id: string | null
  oa_user_id: string | null
  oa_provider: OAuthProvider | null
  oa_provider_user_id: string | null
  oa_email: string | null
  oa_is_private_email: boolean | null
  oa_raw_profile: Record<string, unknown> | null
  oa_created_at: Date | string | null
}

/**
 * Type guard: verifies all required non-null oauth_account fields are present
 * when oa_id is non-null (guaranteed by the LEFT JOIN schema).
 * Hoisted to module scope so it is not re-created on every findUserWithAccounts call.
 *
 * @param r - A row from the LEFT JOIN query in findUserWithAccounts
 */
function isCompleteOAuthRow(r: UserWithAccountsRow): r is UserWithAccountsRow & {
  oa_id: string
  oa_user_id: string
  oa_provider: OAuthProvider
  oa_provider_user_id: string
  oa_is_private_email: boolean
  oa_created_at: Date | string
} {
  return (
    typeof r.oa_id === 'string' &&
    typeof r.oa_user_id === 'string' &&
    (r.oa_provider === 'apple' || r.oa_provider === 'google') &&
    typeof r.oa_provider_user_id === 'string' &&
    typeof r.oa_is_private_email === 'boolean' &&
    r.oa_created_at != null
  )
}

/**
 * Fetch a user and all their linked OAuth accounts in a single JOIN query.
 * Returns null if the user does not exist.
 *
 * @param client - Database client
 * @param userId - User UUID
 */
export async function findUserWithAccounts(
  client: QueryOnlyClient,
  userId: string,
): Promise<UserWithAccounts | null> {
  // Use a LEFT JOIN so the user row is returned even when they have no accounts yet.
  // All oauth_account columns are aliased with an "oa_" prefix to avoid collisions
  // with the user columns (both tables have id, email, created_at, etc.).
  const { rows } = await client.query<UserWithAccountsRow>(
    `SELECT
       u.id, u.email, u.email_verified, u.display_name, u.avatar_url, u.deactivated_at, u.created_at, u.updated_at,
       oa.id                 AS oa_id,
       oa.user_id            AS oa_user_id,
       oa.provider           AS oa_provider,
       oa.provider_user_id   AS oa_provider_user_id,
       oa.email              AS oa_email,
       oa.is_private_email   AS oa_is_private_email,
       oa.raw_profile        AS oa_raw_profile,
       oa.created_at         AS oa_created_at
     FROM users u
     LEFT JOIN oauth_accounts oa ON oa.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  )

  const firstRow = rows[0] ?? null
  if (!firstRow) return null
  const user: User = {
    id: firstRow.id,
    email: firstRow.email,
    email_verified: firstRow.email_verified,
    display_name: firstRow.display_name,
    avatar_url: firstRow.avatar_url,
    deactivated_at: firstRow.deactivated_at,
    created_at: firstRow.created_at,
    updated_at: firstRow.updated_at,
  }

  // Collect the accounts from all JOIN rows (each row is one oauth_account)
  const accounts = rows
    .filter(isCompleteOAuthRow)
    .map((r) => ({
      id: r.oa_id,
      user_id: r.oa_user_id,
      provider: r.oa_provider,
      provider_user_id: r.oa_provider_user_id,
      email: r.oa_email,
      is_private_email: r.oa_is_private_email,
      raw_profile: r.oa_raw_profile,
      created_at: r.oa_created_at,
    } satisfies OAuthAccount))

  return { user, accounts }
}

/**
 * Check whether a user already has a linked account for a given provider.
 * Uses SELECT EXISTS for a short-circuit boolean check.
 *
 * @param client - Database client
 * @param userId - User UUID
 * @param provider - OAuth provider name
 */
export async function userHasProvider(
  client: QueryOnlyClient,
  userId: string,
  provider: OAuthProvider,
): Promise<boolean> {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM oauth_accounts WHERE user_id = $1 AND provider = $2
     ) AS exists`,
    [userId, provider],
  )
  return rows[0]?.exists ?? false
}

// ─── Refresh Tokens ──────────────────────────────────────────────────────────

/**
 * Store a new refresh token (hashed) in the database.
 *
 * @param client - Database client (only `query` is required)
 * @param params - Token fields
 */
export async function createRefreshToken(
  client: QueryOnlyClient,
  params: {
    user_id: string
    token_hash: string
    device_info: string | null
    expires_at: Date
    client_type: ClientType
  },
): Promise<RefreshToken> {
  const { rows } = await client.query<RefreshToken>(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at, client_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, token_hash, device_info, expires_at, revoked_at, client_type, created_at`,
    [params.user_id, params.token_hash, params.device_info, params.expires_at, params.client_type],
  )
  const token = rows[0]
  if (!token) throw new Error('INSERT INTO refresh_tokens returned no rows')
  return token
}

/**
 * Find a refresh token by hash regardless of revocation status (for reuse detection).
 *
 * @param client - Database client
 * @param tokenHash - SHA-256 hex digest of the token
 */
export async function findRefreshTokenByHash(
  client: QueryOnlyClient,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const { rows } = await client.query<RefreshToken>(
    'SELECT id, user_id, token_hash, device_info, expires_at, revoked_at, client_type, created_at FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  )
  return rows[0] ?? null
}

/**
 * Acquire a row-level lock on a non-expired refresh token (SELECT ... FOR UPDATE)
 * and return it regardless of revocation status. Used during token rotation to close
 * the TOCTOU gap between existence check and revocation: both the reuse-detection
 * check and the active-token check are now done on the same locked row inside a
 * single transaction.
 *
 * Returns null when no token with this hash exists OR when the token is expired.
 * Expiry is checked in SQL (AND expires_at > NOW()) to avoid clock-skew issues
 * that arise from comparing timestamps in Node.js.
 *
 * FOR UPDATE ensures that if two concurrent /refresh requests arrive for the same token:
 * - Request A acquires the row lock, B blocks.
 * - A commits (revokes old token, inserts new one).
 * - B's SELECT returns the same row, now with revoked_at set → triggers reuse detection,
 *   which revokes the entire token family. This is the intended security behaviour.
 *
 * Security trade-off — expired-AND-revoked tokens:
 * A token that is both revoked AND expired is excluded from this query (AND expires_at > NOW()
 * filters it out before the revocation check). Callers therefore receive null and follow the
 * "Invalid refresh token" 401 path, NOT the reuse-detection path. This means family revocation
 * (revokeAllUserRefreshTokens) does NOT fire for expired-revoked tokens.
 *
 * This is an accepted design trade-off: an expired token cannot be rotated into a new valid
 * token even if it is not revoked, so the attacker gains nothing by replaying it after expiry.
 * The cost is that the reuse-detection audit trail is not triggered for the expired case.
 * Operators should treat a surge of 401 "Invalid refresh token" responses from a single IP as
 * a signal worth investigating even without a corresponding token_reuse_detected audit event.
 *
 * @param client - Database client (must be inside a transaction)
 * @param tokenHash - SHA-256 hex digest of the token
 */
export async function findRefreshTokenForRotation(
  client: QueryOnlyClient,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const { rows } = await client.query<RefreshToken>(
    'SELECT id, user_id, token_hash, device_info, expires_at, revoked_at, client_type, created_at FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW() FOR UPDATE',
    [tokenHash],
  )
  return rows[0] ?? null
}

/**
 * Delete a user row only if it has no linked oauth_accounts (orphan cleanup).
 * Used in Branch C of resolveOrCreateUser when a concurrent signup race leaves
 * a user row with no associated oauth_account.
 *
 * IMPORTANT: This function must only be called from `withTransaction` invocations
 * where `userId` is omitted (unauthenticated context, `app.user_id = ''`). If a
 * future migration adds RLS to the `users` table, this call-site must be re-evaluated
 * because an unauthenticated RLS context would silently delete nothing.
 *
 * @param client - Database client
 * @param userId - User UUID to potentially delete
 */
export async function deleteOrphanUser(
  client: QueryOnlyClient,
  userId: string,
): Promise<void> {
  await client.query(
    `DELETE FROM users WHERE id = $1 AND NOT EXISTS (
       SELECT 1 FROM oauth_accounts WHERE user_id = $1
     )`,
    [userId],
  )
}

/**
 * Mark a single refresh token as revoked.
 *
 * @param client - Database client (only `query` is required)
 * @param tokenHash - SHA-256 hex digest of the token to revoke
 * @throws {Error} if no row is updated — the token must exist in the database before calling this function.
 */
export async function revokeRefreshToken(
  client: QueryOnlyClient,
  tokenHash: string,
): Promise<void> {
  const result = await client.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
    [tokenHash],
  )
  if ((result.rowCount ?? 0) === 0) {
    throw new Error(`revokeRefreshToken: token not found (hash prefix: ${tokenHash.slice(0, 8)})`)
  }
}

/**
 * Revoke all active refresh tokens for a user (used on token reuse detection).
 *
 * @param client - Database client
 * @param userId - User UUID
 */
export async function revokeAllUserRefreshTokens(
  client: QueryOnlyClient,
  userId: string,
): Promise<void> {
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  )
}

// ─── Auth Events ─────────────────────────────────────────────────────────────

/**
 * Record an authentication event for the audit log.
 *
 * @param client - Database client
 * @param params - Event details
 */
export async function logAuthEvent(
  client: QueryOnlyClient,
  params: {
    user_id: string | null
    event_type: AuthEventType
    ip_address: string | null
    user_agent: string | null
    metadata?: Record<string, unknown> | null
  },
): Promise<void> {
  // Validate the IP string before binding to the INET column. Malformed values
  // (e.g. IPv6 zone IDs like "::1%eth0") would otherwise abort the transaction.
  // net.isIP() accepts zone IDs (e.g. "::1%eth0") even though PostgreSQL INET rejects them,
  // so we also explicitly reject any address containing a '%' character.
  const safeIp =
    params.ip_address !== null &&
    !params.ip_address.includes('%') &&
    net.isIP(params.ip_address) !== 0
      ? params.ip_address
      : null

  // Defense-in-depth: sanitize user_agent even if callers already sanitize it.
  // Strips control characters, trims whitespace, and truncates to 512 chars.
  const safeUserAgent =
    params.user_agent !== null
      ? // eslint-disable-next-line no-control-regex -- intentional: strip control chars from user input
        params.user_agent.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, MAX_AUTH_EVENT_USER_AGENT_LENGTH) || null
      : null

  await client.query(
    `INSERT INTO auth_events (user_id, event_type, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.user_id,
      params.event_type,
      safeIp,
      safeUserAgent,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Project a User row to the public API response shape.
 *
 * @param user - Full user record
 */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
  }
}
