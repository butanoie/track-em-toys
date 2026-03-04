import { OAuth2Client } from 'google-auth-library'
import { config } from '../config.js'
import type { ProviderClaims } from '../types/index.js'
import { isNetworkError, ProviderVerificationError } from './errors.js'

const client = new OAuth2Client()

/**
 * Verify a Google Sign-In id_token and extract standardized claims.
 *
 * @param idToken - The id_token from Google Sign-In
 */
export async function verifyGoogleToken(
  idToken: string,
): Promise<ProviderClaims> {
  const audience = [config.google.webClientId, config.google.iosClientId, config.google.desktopClientId].filter(
    (v): v is string => v !== undefined,
  )
  if (audience.length === 0) {
    // Infrastructure misconfiguration — not a client validation failure
    throw new Error('Google Sign-In is not configured — set GOOGLE_WEB_CLIENT_ID or GOOGLE_IOS_CLIENT_ID')
  }

  // client.verifyIdToken throws for invalid tokens (bad signature, expired, wrong audience).
  // These are validation failures → ProviderVerificationError.
  // Network/JWKS fetch failures throw plain Error → propagated as-is for 503 handling.
  const ticket = await client.verifyIdToken({ idToken, audience }).catch((err: unknown) => {
    // Re-throw network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, etc.) as-is
    // so the route handler can return 503 instead of misclassifying as 401.
    if (isNetworkError(err)) throw err
    throw new ProviderVerificationError(err instanceof Error ? err.message : 'Google token verification failed')
  })

  const payload = ticket.getPayload()
  if (!payload) {
    throw new ProviderVerificationError('Google token payload is empty')
  }

  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  let clientType: ProviderClaims['client_type']
  if (audList.includes(config.google.iosClientId)
    || (config.google.desktopClientId && audList.includes(config.google.desktopClientId))) {
    clientType = 'native'
  } else if (audList.includes(config.google.webClientId)) {
    clientType = 'web'
  } else {
    throw new ProviderVerificationError(`Google id_token audience "${audList.join(', ')}" does not match any configured client ID`)
  }

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    email_verified: payload.email_verified ?? false,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    client_type: clientType,
  }
}
