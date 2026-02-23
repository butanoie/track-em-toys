import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../config.js', () => ({
  config: {
    apple: {
      bundleId: 'com.test.trackemtoys',
      servicesId: 'com.test.trackemtoys.services',
    },
  },
}))

const { mockVerifyIdToken } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
}))

vi.mock('apple-signin-auth', () => ({
  default: {
    verifyIdToken: mockVerifyIdToken,
  },
}))

import { verifyAppleToken, isPrivateRelayEmail } from './apple.js'

describe('apple auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isPrivateRelayEmail', () => {
    it('should return true for Apple private relay emails', () => {
      expect(isPrivateRelayEmail('abc123@privaterelay.appleid.com')).toBe(true)
    })

    it('should return false for regular emails', () => {
      expect(isPrivateRelayEmail('user@gmail.com')).toBe(false)
    })

    it('should return false for null email', () => {
      expect(isPrivateRelayEmail(null)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isPrivateRelayEmail('')).toBe(false)
    })

    it('should return false for partial domain match', () => {
      expect(isPrivateRelayEmail('user@fake-privaterelay.appleid.com')).toBe(false)
    })

    it('should return true only for exact domain suffix', () => {
      expect(isPrivateRelayEmail('anything@privaterelay.appleid.com')).toBe(true)
      expect(isPrivateRelayEmail('user@subdomain.privaterelay.appleid.com')).toBe(false)
    })
  })

  describe('verifyAppleToken', () => {
    it('should verify token and return standardized claims', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      })

      const claims = await verifyAppleToken('fake-id-token', 'test-nonce')

      expect(claims).toEqual({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: true,
        name: null,
        picture: null,
      })
    })

    it('should handle email_verified as boolean true', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: true,
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      })

      const claims = await verifyAppleToken('token', 'nonce')
      expect(claims.email_verified).toBe(true)
    })

    it('should treat email_verified string "false" as false', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'false',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      })

      const claims = await verifyAppleToken('token', 'nonce')
      expect(claims.email_verified).toBe(false)
    })

    it('should handle missing email', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email_verified: 'false',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      })

      const claims = await verifyAppleToken('token', 'nonce')
      expect(claims.email).toBeNull()
    })

    it('should always set name and picture to null (Apple does not provide these in id_token)', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'apple-user-123',
        email: 'user@example.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      })

      const claims = await verifyAppleToken('token', 'nonce')
      expect(claims.name).toBeNull()
      expect(claims.picture).toBeNull()
    })

    it('should pass correct audience and nonce to Apple verification', async () => {
      mockVerifyIdToken.mockResolvedValue({
        sub: 'test',
        email_verified: 'false',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.trackemtoys',
        exp: 0,
        iat: 0,
      })

      await verifyAppleToken('my-token', 'my-nonce')

      expect(mockVerifyIdToken).toHaveBeenCalledWith('my-token', {
        audience: ['com.test.trackemtoys', 'com.test.trackemtoys.services'],
        nonce: 'my-nonce',
        issuer: 'https://appleid.apple.com',
      })
    })

    it('should propagate verification errors', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Token expired'))

      await expect(verifyAppleToken('bad-token', 'nonce')).rejects.toThrow('Token expired')
    })
  })
})
