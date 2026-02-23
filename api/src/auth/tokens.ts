import crypto from 'node:crypto'
import type { PoolClient } from '../db/pool.js'
import * as queries from '../db/queries.js'

const REFRESH_TOKEN_BYTES = 32
const REFRESH_TOKEN_EXPIRY_DAYS = 30

/** Generate a cryptographically random refresh token as a hex string. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
}

/**
 * Compute the SHA-256 hex digest of a token for database storage.
 *
 * @param token - The raw token string
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Generate a refresh token, hash it, and persist to the database.
 *
 * @param client - Database client within a transaction
 * @param userId - The user to issue the token for
 * @param deviceInfo - Optional user-agent or device identifier
 * @returns The raw (unhashed) token to send to the client
 */
export async function createAndStoreRefreshToken(
  client: PoolClient,
  userId: string,
  deviceInfo: string | null,
): Promise<string> {
  const rawToken = generateRefreshToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS)

  await queries.createRefreshToken(client, {
    user_id: userId,
    token_hash: tokenHash,
    device_info: deviceInfo,
    expires_at: expiresAt,
  })

  return rawToken
}

/**
 * Revoke an existing refresh token and issue a new one (rotation).
 *
 * @param client - Database client within a transaction
 * @param oldTokenHash - Hash of the token being replaced
 * @param userId - The user who owns the token
 * @param deviceInfo - Optional device identifier for the new token
 * @returns The new raw (unhashed) token
 */
export async function rotateRefreshToken(
  client: PoolClient,
  oldTokenHash: string,
  userId: string,
  deviceInfo: string | null,
): Promise<string> {
  await queries.revokeRefreshToken(client, oldTokenHash)
  return createAndStoreRefreshToken(client, userId, deviceInfo)
}
