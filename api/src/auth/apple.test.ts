import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  config: {
    apple: {
      bundleId: 'com.test.trackemtoys',
      servicesId: 'com.test.trackemtoys.services',
    },
  },
}));

const { mockVerifyIdToken } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
}));

vi.mock('apple-signin-auth', () => ({
  default: {
    verifyIdToken: mockVerifyIdToken,
  },
}));

import { verifyAppleToken, isPrivateRelayEmail } from './apple.js';
import { ProviderVerificationError } from './errors.js';

describe('apple auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPrivateRelayEmail', () => {
    it('should return true for Apple private relay emails', () => {
      expect(isPrivateRelayEmail('abc123@privaterelay.appleid.com')).toBe(true);
    });

    it('should return false for regular emails', () => {
      expect(isPrivateRelayEmail('user@gmail.com')).toBe(false);
    });

    it('should return false for null email', () => {
      expect(isPrivateRelayEmail(null)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPrivateRelayEmail('')).toBe(false);
    });

    it('should return false for partial domain match', () => {
      expect(isPrivateRelayEmail('user@fake-privaterelay.appleid.com')).toBe(false);
    });

    it('should return true only for exact domain suffix', () => {
      expect(isPrivateRelayEmail('anything@privaterelay.appleid.com')).toBe(true);
      expect(isPrivateRelayEmail('user@subdomain.privaterelay.appleid.com')).toBe(false);
    });
  });

  describe('verifyAppleToken', () => {
    it('should verify token and return standardized claims with clientType native (bundleId audience)', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys', // bundleId → native
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      const claims = await verifyAppleToken('fake-id-token', 'test-nonce');

      expect(claims).toEqual({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: true,
        name: null,
        picture: null,
        client_type: 'native',
      });
    });

    it('should return clientType web when audience matches servicesId', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys.services', // servicesId → web
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('fake-id-token', 'test-nonce');
      expect(claims.client_type).toBe('web');
    });

    it('should return clientType native when audience matches bundleId', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys', // bundleId → native
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('fake-id-token', 'test-nonce');
      expect(claims.client_type).toBe('native');
    });

    it('should throw when audience does not match any configured client ID', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.unknown.app', // neither bundleId nor servicesId
        exp: 0,
        iat: 0,
      });

      await expect(verifyAppleToken('fake-id-token', 'test-nonce')).rejects.toThrow('Unknown Apple audience:');
    });

    it('should handle email_verified as boolean true', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: true,
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('token', 'nonce');
      expect(claims.email_verified).toBe(true);
    });

    it('should treat email_verified string "false" as false', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'false',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('token', 'nonce');
      expect(claims.email_verified).toBe(false);
    });

    it('should handle missing email', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email_verified: 'false',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('token', 'nonce');
      expect(claims.email).toBeNull();
    });

    it('should always set name and picture to null (Apple does not provide these in id_token)', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('token', 'nonce');
      expect(claims.name).toBeNull();
      expect(claims.picture).toBeNull();
    });

    it('should pass correct audience and nonce to Apple verification', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'test',
        email_verified: 'false',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      });

      await verifyAppleToken('my-token', 'my-nonce');

      expect(mockVerifyIdToken).toHaveBeenCalledWith('my-token', {
        audience: ['com.test.trackemtoys', 'com.test.trackemtoys.services'],
        nonce: 'my-nonce',
        issuer: 'https://appleid.apple.com',
      });
    });

    it('should wrap validation errors as ProviderVerificationError', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));

      await expect(verifyAppleToken('bad-token', 'nonce')).rejects.toBeInstanceOf(ProviderVerificationError);
      await expect(verifyAppleToken('bad-token', 'nonce')).rejects.toThrow('Token expired');
    });

    it('should propagate network errors as-is without wrapping in ProviderVerificationError', async () => {
      const networkError = Object.assign(new Error('connect ECONNRESET 1.2.3.4:443'), { code: 'ECONNRESET' });
      mockVerifyIdToken.mockRejectedValue(networkError);

      const result = verifyAppleToken('bad-token', 'nonce');
      await expect(result).rejects.toThrow('connect ECONNRESET 1.2.3.4:443');
      await expect(verifyAppleToken('bad-token', 'nonce')).rejects.not.toBeInstanceOf(ProviderVerificationError);
    });

    it('should propagate ETIMEDOUT errors as-is', async () => {
      const timeoutError = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' });
      mockVerifyIdToken.mockRejectedValue(timeoutError);

      await expect(verifyAppleToken('bad-token', 'nonce')).rejects.not.toBeInstanceOf(ProviderVerificationError);
    });

    it('should propagate ENOTFOUND errors as-is', async () => {
      const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND appleid.apple.com'), { code: 'ENOTFOUND' });
      mockVerifyIdToken.mockRejectedValue(dnsError);

      await expect(verifyAppleToken('bad-token', 'nonce')).rejects.not.toBeInstanceOf(ProviderVerificationError);
    });

    it('should throw "Apple Sign-In is not configured" when both bundleId and servicesId are undefined', async () => {
      // Override config so neither Apple ID is set
      vi.resetModules();
      vi.doMock('../config.js', () => ({
        config: {
          apple: {
            bundleId: undefined,
            servicesId: undefined,
          },
        },
      }));

      const { verifyAppleToken: verifyWithNoConfig } = (await import('./apple.js')) as typeof import('./apple.js');

      await expect(verifyWithNoConfig('some-token', 'some-nonce')).rejects.toThrow('Apple Sign-In is not configured');

      vi.doUnmock('../config.js');
      vi.resetModules();
    });

    // [S1] aud claim array-valued tests
    it('should return clientType native when aud is a single-element array matching bundleId', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: ['com.test.trackemtoys'], // array aud matching bundleId
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('token', 'nonce');
      expect(claims.client_type).toBe('native');
    });

    it('should return clientType web when aud is a single-element array matching servicesId', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: ['com.test.trackemtoys.services'], // array aud matching servicesId
        exp: 0,
        iat: 0,
      });

      const claims = await verifyAppleToken('token', 'nonce');
      expect(claims.client_type).toBe('web');
    });

    it('should return clientType native when aud is a multi-element array (bundleId matched first)', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: ['com.test.trackemtoys', 'com.test.trackemtoys.services'], // multi-element array
        exp: 0,
        iat: 0,
      });

      // bundleId is checked before servicesId, so clientType should be 'native'
      const claims = await verifyAppleToken('token', 'nonce');
      expect(claims.client_type).toBe('native');
    });
  });
});
