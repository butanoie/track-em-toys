import type { CredentialResponse } from '@react-oauth/google'

/**
 * Extracts the id_token string from a Google CredentialResponse.
 * Returns null if the credential is missing or malformed.
 */
export function extractGoogleCredential(response: CredentialResponse): string | null {
  if (!response.credential || typeof response.credential !== 'string') {
    return null
  }
  return response.credential
}
