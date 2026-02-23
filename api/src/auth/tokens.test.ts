import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PoolClient } from '../db/pool.js'

vi.mock('../db/queries.js', () => ({
  createRefreshToken: vi.fn().mockResolvedValue({
    id: 'token-id',
    user_id: 'user-1',
    token_hash: 'stored-hash',
    device_info: null,
    expires_at: new Date().toISOString(),
    revoked_at: null,
    created_at: new Date().toISOString(),
  }),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}))

import {
  generateRefreshToken,
  hashToken,
  createAndStoreRefreshToken,
  rotateRefreshToken,
} from './tokens.js'
import * as queries from '../db/queries.js'

const mockClient = { query: vi.fn() } as unknown as PoolClient

describe('tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generateRefreshToken', () => {
    it('should return a 64-character hex string (32 bytes)', () => {
      const token = generateRefreshToken()
      expect(token).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should generate unique tokens on each call', () => {
      const tokens = new Set(Array.from({ length: 10 }, () => generateRefreshToken()))
      expect(tokens.size).toBe(10)
    })
  })

  describe('hashToken', () => {
    it('should return a 64-character hex SHA-256 digest', () => {
      const hash = hashToken('test-token')
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should be deterministic for the same input', () => {
      const hash1 = hashToken('same-token')
      const hash2 = hashToken('same-token')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashToken('token-a')
      const hash2 = hashToken('token-b')
      expect(hash1).not.toBe(hash2)
    })

    it('should not return the original token value', () => {
      const token = 'my-secret-token'
      const hash = hashToken(token)
      expect(hash).not.toBe(token)
      expect(hash).not.toContain(token)
    })
  })

  describe('createAndStoreRefreshToken', () => {
    it('should return a raw hex token', async () => {
      const rawToken = await createAndStoreRefreshToken(mockClient, 'user-1', 'Chrome/120')
      expect(rawToken).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should store a hashed version in the database', async () => {
      const rawToken = await createAndStoreRefreshToken(mockClient, 'user-1', null)
      const expectedHash = hashToken(rawToken)

      expect(queries.createRefreshToken).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({
          user_id: 'user-1',
          token_hash: expectedHash,
        }),
      )
    })

    it('should set expiry to 30 days from now', async () => {
      await createAndStoreRefreshToken(mockClient, 'user-1', null)

      const call = vi.mocked(queries.createRefreshToken).mock.calls[0]
      const expiresAt = call[1].expires_at as Date
      const now = new Date()
      const diffMs = expiresAt.getTime() - now.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)

      expect(diffDays).toBeGreaterThan(29.9)
      expect(diffDays).toBeLessThanOrEqual(30.01)
    })

    it('should pass device info to the database', async () => {
      await createAndStoreRefreshToken(mockClient, 'user-1', 'Safari/17')

      expect(queries.createRefreshToken).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ device_info: 'Safari/17' }),
      )
    })

    it('should handle null device info', async () => {
      await createAndStoreRefreshToken(mockClient, 'user-1', null)

      expect(queries.createRefreshToken).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ device_info: null }),
      )
    })
  })

  describe('rotateRefreshToken', () => {
    it('should revoke the old token and return a new one', async () => {
      const newToken = await rotateRefreshToken(mockClient, 'old-hash', 'user-1', 'Firefox')

      expect(queries.revokeRefreshToken).toHaveBeenCalledWith(mockClient, 'old-hash')
      expect(queries.createRefreshToken).toHaveBeenCalledOnce()
      expect(newToken).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should revoke before creating new token', async () => {
      const callOrder: string[] = []
      vi.mocked(queries.revokeRefreshToken).mockImplementation(async () => {
        callOrder.push('revoke')
      })
      vi.mocked(queries.createRefreshToken).mockImplementation(async () => {
        callOrder.push('create')
        return {} as ReturnType<typeof queries.createRefreshToken> extends Promise<infer T> ? T : never
      })

      await rotateRefreshToken(mockClient, 'old-hash', 'user-1', null)

      expect(callOrder).toEqual(['revoke', 'create'])
    })

    it('should pass the correct user ID when creating the new token', async () => {
      await rotateRefreshToken(mockClient, 'old-hash', 'user-42', 'device')

      expect(queries.createRefreshToken).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ user_id: 'user-42' }),
      )
    })
  })
})
