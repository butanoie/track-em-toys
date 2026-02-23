import appleSignin from 'apple-signin-auth'
import { config } from '../config.js'
import type { ProviderClaims } from '../types/index.js'

/**
 * Verify an Apple Sign-In id_token against Apple's JWKS and extract claims.
 *
 * @param idToken - The id_token from Apple Sign-In
 * @param nonce - Raw nonce for replay protection
 */
export async function verifyAppleToken(
  idToken: string,
  nonce: string,
): Promise<ProviderClaims> {
  const audience = [config.apple.bundleId, config.apple.servicesId].filter(
    (v): v is string => v !== undefined,
  )
  if (audience.length === 0) {
    throw new Error('Apple Sign-In is not configured — set APPLE_BUNDLE_ID and APPLE_SERVICES_ID')
  }

  const payload = await appleSignin.verifyIdToken(idToken, {
    audience,
    nonce,
    issuer: 'https://appleid.apple.com',
  })

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    email_verified: payload.email_verified === 'true' || payload.email_verified === true,
    name: null,
    picture: null,
  }
}

/**
 * Check whether an email address is an Apple private relay address.
 *
 * @param email - The email to check
 */
export function isPrivateRelayEmail(email: string | null): boolean {
  if (!email) return false
  return email.endsWith('@privaterelay.appleid.com')
}
