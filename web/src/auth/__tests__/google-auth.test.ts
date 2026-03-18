import { describe, it, expect } from 'vitest';
import { extractGoogleCredential } from '../google-auth';
import type { CredentialResponse } from '@react-oauth/google';

describe('extractGoogleCredential', () => {
  it('returns credential string when present', () => {
    const response: CredentialResponse = {
      credential: 'eyJhbGciOiJSUzI1NiJ9.payload.sig',
    };
    expect(extractGoogleCredential(response)).toBe(response.credential);
  });

  it('returns null when credential is undefined', () => {
    const response: CredentialResponse = {};
    expect(extractGoogleCredential(response)).toBeNull();
  });

  it('returns null when credential is empty string', () => {
    const response: CredentialResponse = { credential: '' };
    // Empty string is falsy — should return null
    expect(extractGoogleCredential(response)).toBeNull();
  });
});
