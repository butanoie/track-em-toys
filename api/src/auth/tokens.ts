import crypto from 'node:crypto';
import type { ClientType } from '../types/index.js';
import * as queries from '../db/queries.js';

/**
 * Minimal pool client interface required by token operations.
 * Re-exports QueryOnlyClient from queries.ts so tests can use it without
 * importing from queries directly.
 */
export type { QueryOnlyClient as TokenClient } from '../db/queries.js';

const REFRESH_TOKEN_BYTES = 32;
// NOTE: this value must stay in sync with the SQL-side expiry filter
// `AND expires_at > NOW()` in findRefreshTokenForRotation (queries.ts).
// Changing it here without updating the token-rotation query will create
// a mismatch between what the application considers valid and what the DB returns.
export const REFRESH_TOKEN_EXPIRY_DAYS = 30;

/**
 * Generate a cryptographically random refresh token as a hex string.
 * Uses 32 bytes of randomness, yielding a 64-character hex string.
 * The raw token is suitable for transmission to the client; store only
 * its SHA-256 hash (via hashToken) in the database.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
}

/**
 * Compute the SHA-256 hex digest of a token for database storage.
 *
 * @param token - The raw token string
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a refresh token, hash it, and persist to the database.
 *
 * @param client - Database client within a transaction (only `query` is required)
 * @param userId - The user to issue the token for
 * @param deviceInfo - Optional user-agent or device identifier
 * @param clientType - The client platform (native or web), derived from the provider aud claim
 * @returns The raw (unhashed) token to send to the client
 */
export async function createAndStoreRefreshToken(
  client: queries.QueryOnlyClient,
  userId: string,
  deviceInfo: string | null,
  clientType: ClientType
): Promise<string> {
  const rawToken = generateRefreshToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await queries.createRefreshToken(client, {
    user_id: userId,
    token_hash: tokenHash,
    device_info: deviceInfo,
    expires_at: expiresAt,
    client_type: clientType,
  });

  return rawToken;
}

/**
 * Revoke an existing refresh token and issue a new one (rotation).
 *
 * @param client - Database client within a transaction (only `query` is required)
 * @param oldTokenHash - Hash of the token being replaced
 * @param userId - The user who owns the token
 * @param deviceInfo - Optional device identifier for the new token
 * @param clientType - The client platform to carry over to the new token
 * @returns The new raw (unhashed) token
 */
export async function rotateRefreshToken(
  client: queries.QueryOnlyClient,
  oldTokenHash: string,
  userId: string,
  deviceInfo: string | null,
  clientType: ClientType
): Promise<string> {
  await queries.revokeRefreshToken(client, oldTokenHash);
  return createAndStoreRefreshToken(client, userId, deviceInfo, clientType);
}
