import type { PoolClient } from './pool.js'
import type {
  User,
  OAuthAccount,
  RefreshToken,
  AuthEventType,
  OAuthProvider,
  UserResponse,
} from '../types/index.js'

/** Re-export PoolClient so route helpers can accept a typed client parameter. */
export type { PoolClient as QueriesClient } from './pool.js'
/** Re-export row types for use in route helpers. */
export type { User as UserRow, OAuthAccount as OAuthAccountRow } from '../types/index.js'

// ─── Users ───────────────────────────────────────────────────────────────────

/**
 * Find a user by their primary key.
 *
 * @param client - Database client
 * @param id - User UUID
 */
export async function findUserById(
  client: PoolClient,
  id: string,
): Promise<User | null> {
  const { rows } = await client.query<User>(
    'SELECT * FROM users WHERE id = $1',
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
  client: PoolClient,
  email: string,
): Promise<User | null> {
  const { rows } = await client.query<User>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND email_verified = true',
    [email],
  )
  return rows[0] ?? null
}

/**
 * Create a new user record.
 *
 * @param client - Database client
 * @param params - User fields to insert
 */
export async function createUser(
  client: PoolClient,
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
     RETURNING *`,
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
  client: PoolClient,
  userId: string,
  displayName: string,
): Promise<void> {
  await client.query(
    `UPDATE users SET display_name = $2, updated_at = NOW()
     WHERE id = $1 AND display_name IS NULL`,
    [userId, displayName],
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
  client: PoolClient,
  userId: string,
): Promise<UserStatus> {
  const { rows } = await client.query<{ deactivated_at: string | null }>(
    'SELECT deactivated_at FROM users WHERE id = $1',
    [userId],
  )
  if (!rows[0]) return 'not_found'
  return rows[0].deactivated_at !== null ? 'deactivated' : 'active'
}

// ─── OAuth Accounts ──────────────────────────────────────────────────────────

/**
 * Find an OAuth account by provider and provider-specific user ID.
 *
 * @param client - Database client
 * @param provider - OAuth provider name
 * @param providerUserId - The user's ID at the provider
 */
export async function findOAuthAccount(
  client: PoolClient,
  provider: OAuthProvider,
  providerUserId: string,
): Promise<OAuthAccount | null> {
  const { rows } = await client.query<OAuthAccount>(
    'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
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
  client: PoolClient,
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
     RETURNING *`,
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
  client: PoolClient,
  userId: string,
): Promise<OAuthAccount[]> {
  const { rows } = await client.query<OAuthAccount>(
    'SELECT * FROM oauth_accounts WHERE user_id = $1',
    [userId],
  )
  return rows
}

/**
 * Check whether a user already has a linked account for a given provider.
 *
 * @param client - Database client
 * @param userId - User UUID
 * @param provider - OAuth provider name
 */
export async function userHasProvider(
  client: PoolClient,
  userId: string,
  provider: OAuthProvider,
): Promise<boolean> {
  const { rows } = await client.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM oauth_accounts WHERE user_id = $1 AND provider = $2',
    [userId, provider],
  )
  return parseInt(rows[0].count, 10) > 0
}

// ─── Refresh Tokens ──────────────────────────────────────────────────────────

/**
 * Store a new refresh token (hashed) in the database.
 *
 * @param client - Database client
 * @param params - Token fields
 */
export async function createRefreshToken(
  client: PoolClient,
  params: {
    user_id: string
    token_hash: string
    device_info: string | null
    expires_at: Date
  },
): Promise<RefreshToken> {
  const { rows } = await client.query<RefreshToken>(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.user_id, params.token_hash, params.device_info, params.expires_at],
  )
  const token = rows[0]
  if (!token) throw new Error('INSERT INTO refresh_tokens returned no rows')
  return token
}

/**
 * Find a non-revoked, non-expired refresh token by its hash.
 *
 * @param client - Database client
 * @param tokenHash - SHA-256 hex digest of the token
 */
export async function findActiveRefreshToken(
  client: PoolClient,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const { rows } = await client.query<RefreshToken>(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  )
  return rows[0] ?? null
}

/**
 * Find a refresh token by hash regardless of revocation status (for reuse detection).
 *
 * @param client - Database client
 * @param tokenHash - SHA-256 hex digest of the token
 */
export async function findRefreshTokenByHash(
  client: PoolClient,
  tokenHash: string,
): Promise<RefreshToken | null> {
  const { rows } = await client.query<RefreshToken>(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1',
    [tokenHash],
  )
  return rows[0] ?? null
}

/**
 * Mark a single refresh token as revoked.
 *
 * @param client - Database client
 * @param tokenHash - SHA-256 hex digest of the token to revoke
 */
export async function revokeRefreshToken(
  client: PoolClient,
  tokenHash: string,
): Promise<void> {
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
    [tokenHash],
  )
}

/**
 * Revoke all active refresh tokens for a user (used on token reuse detection).
 *
 * @param client - Database client
 * @param userId - User UUID
 */
export async function revokeAllUserRefreshTokens(
  client: PoolClient,
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
  client: PoolClient,
  params: {
    user_id: string | null
    event_type: AuthEventType
    ip_address: string | null
    user_agent: string | null
    metadata?: Record<string, unknown> | null
  },
): Promise<void> {
  await client.query(
    `INSERT INTO auth_events (user_id, event_type, ip_address, user_agent, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.user_id,
      params.event_type,
      params.ip_address,
      params.user_agent,
      params.metadata ? JSON.stringify(params.metadata) : null,
    ],
  )
}

// ─── OAuth Account Updates ──────────────────────────────────────────────────

/**
 * Update the user_id on an OAuth account row. Used during concurrent first-login
 * to link a placeholder oauth_account to the newly created user.
 *
 * @param client - Database client
 * @param oauthAccountId - OAuth account UUID to update
 * @param userId - New user UUID to set
 */
export async function updateOAuthAccountUserId(
  client: PoolClient,
  oauthAccountId: string,
  userId: string,
): Promise<void> {
  await client.query(
    'UPDATE oauth_accounts SET user_id = $2 WHERE id = $1',
    [oauthAccountId, userId],
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
