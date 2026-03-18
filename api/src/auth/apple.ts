import appleSignin from 'apple-signin-auth';
import { config } from '../config.js';
import type { ProviderClaims } from '../types/index.js';
import { isNetworkError, ProviderVerificationError } from './errors.js';

/**
 * Verify an Apple Sign-In id_token against Apple's JWKS and extract claims.
 *
 * @param idToken - The id_token from Apple Sign-In
 * @param nonce - Raw nonce for replay protection
 */
export async function verifyAppleToken(idToken: string, nonce: string): Promise<ProviderClaims> {
  const audience = [config.apple.bundleId, config.apple.servicesId].filter((v): v is string => v !== undefined);
  if (audience.length === 0) {
    // Infrastructure misconfiguration — not a client validation failure
    throw new Error('Apple Sign-In is not configured — set APPLE_BUNDLE_ID and APPLE_SERVICES_ID');
  }

  // appleSignin.verifyIdToken throws for invalid tokens (bad signature, expired, wrong nonce).
  // These are validation failures → ProviderVerificationError.
  // Network/JWKS fetch failures throw plain Error → propagated as-is for 503 handling.
  const payload = await appleSignin
    .verifyIdToken(idToken, {
      audience,
      nonce,
      issuer: 'https://appleid.apple.com',
    })
    .catch((err: unknown) => {
      // Re-throw network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, etc.) as-is
      // so the route handler can return 503 instead of misclassifying as 401.
      if (isNetworkError(err)) throw err;
      throw new ProviderVerificationError(err instanceof Error ? err.message : 'Apple token verification failed');
    });

  const audClaim = payload.aud;
  const audList = Array.isArray(audClaim) ? audClaim : [audClaim];
  let clientType: ProviderClaims['client_type'];
  if (config.apple.bundleId && audList.includes(config.apple.bundleId)) {
    clientType = 'native';
  } else if (config.apple.servicesId && audList.includes(config.apple.servicesId)) {
    clientType = 'web';
  } else {
    throw new ProviderVerificationError(`Unknown Apple audience: ${audList.join(', ')}`);
  }

  return {
    sub: payload.sub,
    email: payload.email ?? null,
    email_verified: payload.email_verified === 'true' || payload.email_verified === true,
    name: null,
    picture: null,
    client_type: clientType,
  };
}

/**
 * Check whether an email address is an Apple private relay address.
 *
 * @param email - The email to check
 */
export function isPrivateRelayEmail(email: string | null): boolean {
  if (!email) return false;
  return email.split('@').at(-1) === 'privaterelay.appleid.com';
}
