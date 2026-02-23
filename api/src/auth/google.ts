import { OAuth2Client } from 'google-auth-library'
import { config } from '../config.js'
import type { ProviderClaims } from '../types/index.js'

const client = new OAuth2Client()

/**
 * Verify a Google Sign-In id_token and extract standardized claims.
 *
 * @param idToken - The id_token from Google Sign-In
 */
export async function verifyGoogleToken(
  idToken: string,
): Promise<ProviderClaims> {
  const audience = [config.google.webClientId, config.google.iosClientId].filter(
    (v): v is string => v !== undefined,
  )
  if (audience.length === 0) {
    throw new Error('Google Sign-In is not configured — set GOOGLE_WEB_CLIENT_ID or GOOGLE_IOS_CLIENT_ID')
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience,
  })

  const payload = ticket.getPayload()
  if (!payload) {
    throw new Error('Google token payload is empty')
  }

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    email_verified: payload.email_verified ?? false,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  }
}
