import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PoolClient } from './pool.js'
import type { User, OAuthAccount, RefreshToken } from '../types/index.js'
import {
  findUserById,
  findUserByEmail,
  createUser,
  updateUserDisplayName,
  getUserStatus,
  findOAuthAccount,
  createOAuthAccount,
  findOAuthAccountsByUserId,
  userHasProvider,
  createRefreshToken,
  findActiveRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  logAuthEvent,
  toUserResponse,
} from './queries.js'

function createMockClient(): PoolClient {
  return { query: vi.fn() } as unknown as PoolClient
}

const mockUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  email_verified: true,
  display_name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
  deactivated_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockOAuthAccount: OAuthAccount = {
  id: 'oauth-1',
  user_id: 'user-1',
  provider: 'google',
  provider_user_id: 'google-123',
  email: 'test@gmail.com',
  is_private_email: false,
  raw_profile: { sub: 'google-123' },
  created_at: '2026-01-01T00:00:00Z',
}

const mockRefreshToken: RefreshToken = {
  id: 'token-1',
  user_id: 'user-1',
  token_hash: 'abc123hash',
  device_info: 'Chrome/120',
  expires_at: '2026-02-01T00:00:00Z',
  revoked_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

describe('queries', () => {
  let client: PoolClient

  beforeEach(() => {
    client = createMockClient()
    vi.clearAllMocks()
  })

  // ─── toUserResponse ─────────────────────────────────────────────────────

  describe('toUserResponse', () => {
    it('should project user to public API response shape', () => {
      const response = toUserResponse(mockUser)

      expect(response).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      })
    })

    it('should not include internal fields', () => {
      const response = toUserResponse(mockUser)

      expect(response).not.toHaveProperty('email_verified')
      expect(response).not.toHaveProperty('deactivated_at')
      expect(response).not.toHaveProperty('created_at')
      expect(response).not.toHaveProperty('updated_at')
    })

    it('should handle null optional fields', () => {
      const userWithNulls: User = {
        ...mockUser,
        email: null,
        display_name: null,
        avatar_url: null,
      }

      const response = toUserResponse(userWithNulls)
      expect(response.email).toBeNull()
      expect(response.display_name).toBeNull()
      expect(response.avatar_url).toBeNull()
    })
  })

  // ─── User Queries ───────────────────────────────────────────────────────

  describe('findUserById', () => {
    it('should return user when found', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockUser], rowCount: 1 } as never)

      const result = await findUserById(client, 'user-1')

      expect(result).toEqual(mockUser)
      expect(client.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = $1',
        ['user-1'],
      )
    })

    it('should return null when not found', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await findUserById(client, 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('findUserByEmail', () => {
    it('should search case-insensitively for verified emails only', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockUser], rowCount: 1 } as never)

      const result = await findUserByEmail(client, 'Test@Example.com')

      expect(result).toEqual(mockUser)
      expect(client.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND email_verified = true',
        ['Test@Example.com'],
      )
    })

    it('should return null when no matching verified email exists', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await findUserByEmail(client, 'unknown@example.com')
      expect(result).toBeNull()
    })
  })

  describe('createUser', () => {
    it('should insert user with lowercased email and return created record', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockUser], rowCount: 1 } as never)

      const result = await createUser(client, {
        email: 'Test@Example.com',
        email_verified: true,
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      })

      expect(result).toEqual(mockUser)
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['Test@Example.com', true, 'Test User', 'https://example.com/avatar.jpg'],
      )
    })

    it('should handle null optional fields', async () => {
      vi.mocked(client.query).mockResolvedValue({
        rows: [{ ...mockUser, email: null, display_name: null, avatar_url: null }],
        rowCount: 1,
      } as never)

      await createUser(client, {
        email: null,
        email_verified: false,
        display_name: null,
        avatar_url: null,
      })

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        [null, false, null, null],
      )
    })

    it('should throw when INSERT returns no rows', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      await expect(
        createUser(client, {
          email: 'test@example.com',
          email_verified: true,
          display_name: null,
          avatar_url: null,
        }),
      ).rejects.toThrow('INSERT INTO users returned no rows')
    })
  })

  describe('updateUserDisplayName', () => {
    it('should update display name only when currently null', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 1 } as never)

      await updateUserDisplayName(client, 'user-1', 'New Name')

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND display_name IS NULL'),
        ['user-1', 'New Name'],
      )
    })
  })

  describe('getUserStatus', () => {
    it('should return active for non-deactivated user', async () => {
      vi.mocked(client.query).mockResolvedValue({
        rows: [{ deactivated_at: null }],
        rowCount: 1,
      } as never)

      const result = await getUserStatus(client, 'user-1')
      expect(result).toBe('active')
    })

    it('should return deactivated for deactivated user', async () => {
      vi.mocked(client.query).mockResolvedValue({
        rows: [{ deactivated_at: '2026-01-15T00:00:00Z' }],
        rowCount: 1,
      } as never)

      const result = await getUserStatus(client, 'user-1')
      expect(result).toBe('deactivated')
    })

    it('should return not_found when user does not exist', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await getUserStatus(client, 'nonexistent')
      expect(result).toBe('not_found')
    })
  })

  // ─── OAuth Account Queries ──────────────────────────────────────────────

  describe('findOAuthAccount', () => {
    it('should find by provider and provider user ID', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockOAuthAccount], rowCount: 1 } as never)

      const result = await findOAuthAccount(client, 'google', 'google-123')

      expect(result).toEqual(mockOAuthAccount)
      expect(client.query).toHaveBeenCalledWith(
        'SELECT * FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        ['google', 'google-123'],
      )
    })

    it('should return null when not found', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await findOAuthAccount(client, 'apple', 'unknown')
      expect(result).toBeNull()
    })
  })

  describe('createOAuthAccount', () => {
    it('should insert with ON CONFLICT DO NOTHING and return created record', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockOAuthAccount], rowCount: 1 } as never)

      const result = await createOAuthAccount(client, {
        user_id: 'user-1',
        provider: 'google',
        provider_user_id: 'google-123',
        email: 'test@gmail.com',
        is_private_email: false,
        raw_profile: { sub: 'google-123' },
      })

      expect(result).toEqual(mockOAuthAccount)
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (provider, provider_user_id) DO NOTHING'),
        ['user-1', 'google', 'google-123', 'test@gmail.com', false, '{"sub":"google-123"}'],
      )
    })

    it('should return null on conflict (concurrent insert)', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await createOAuthAccount(client, {
        user_id: 'user-1',
        provider: 'google',
        provider_user_id: 'google-123',
        email: 'test@gmail.com',
        is_private_email: false,
        raw_profile: null,
      })

      expect(result).toBeNull()
    })

    it('should handle null raw_profile', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockOAuthAccount], rowCount: 1 } as never)

      await createOAuthAccount(client, {
        user_id: 'user-1',
        provider: 'apple',
        provider_user_id: 'apple-456',
        email: null,
        is_private_email: false,
        raw_profile: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0][1] as unknown[]
      expect(callArgs[5]).toBeNull()
    })
  })

  describe('findOAuthAccountsByUserId', () => {
    it('should return all accounts for a user', async () => {
      const accounts = [mockOAuthAccount, { ...mockOAuthAccount, id: 'oauth-2', provider: 'apple' as const }]
      vi.mocked(client.query).mockResolvedValue({ rows: accounts, rowCount: 2 } as never)

      const result = await findOAuthAccountsByUserId(client, 'user-1')

      expect(result).toHaveLength(2)
      expect(client.query).toHaveBeenCalledWith(
        'SELECT * FROM oauth_accounts WHERE user_id = $1',
        ['user-1'],
      )
    })

    it('should return empty array when no accounts exist', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await findOAuthAccountsByUserId(client, 'user-no-accounts')
      expect(result).toEqual([])
    })
  })

  describe('userHasProvider', () => {
    it('should return true when provider is linked', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [{ count: '1' }], rowCount: 1 } as never)

      const result = await userHasProvider(client, 'user-1', 'google')
      expect(result).toBe(true)
    })

    it('should return false when provider is not linked', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [{ count: '0' }], rowCount: 1 } as never)

      const result = await userHasProvider(client, 'user-1', 'apple')
      expect(result).toBe(false)
    })
  })

  // ─── Refresh Token Queries ──────────────────────────────────────────────

  describe('createRefreshToken', () => {
    it('should insert and return the refresh token record', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockRefreshToken], rowCount: 1 } as never)
      const expiresAt = new Date('2026-02-01T00:00:00Z')

      const result = await createRefreshToken(client, {
        user_id: 'user-1',
        token_hash: 'abc123hash',
        device_info: 'Chrome/120',
        expires_at: expiresAt,
      })

      expect(result).toEqual(mockRefreshToken)
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refresh_tokens'),
        ['user-1', 'abc123hash', 'Chrome/120', expiresAt],
      )
    })

    it('should throw when INSERT returns no rows', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      await expect(
        createRefreshToken(client, {
          user_id: 'user-1',
          token_hash: 'abc123hash',
          device_info: null,
          expires_at: new Date(),
        }),
      ).rejects.toThrow('INSERT INTO refresh_tokens returned no rows')
    })
  })

  describe('findActiveRefreshToken', () => {
    it('should find non-revoked, non-expired token', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [mockRefreshToken], rowCount: 1 } as never)

      const result = await findActiveRefreshToken(client, 'abc123hash')

      expect(result).toEqual(mockRefreshToken)
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('revoked_at IS NULL AND expires_at > NOW()'),
        ['abc123hash'],
      )
    })

    it('should return null for revoked or expired tokens', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await findActiveRefreshToken(client, 'expired-hash')
      expect(result).toBeNull()
    })
  })

  describe('findRefreshTokenByHash', () => {
    it('should find token regardless of revocation status', async () => {
      const revokedToken = { ...mockRefreshToken, revoked_at: '2026-01-15T00:00:00Z' }
      vi.mocked(client.query).mockResolvedValue({ rows: [revokedToken], rowCount: 1 } as never)

      const result = await findRefreshTokenByHash(client, 'abc123hash')

      expect(result).toEqual(revokedToken)
      const sql = vi.mocked(client.query).mock.calls[0][0] as string
      expect(sql).not.toContain('revoked_at')
    })

    it('should return null when token hash does not exist', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)

      const result = await findRefreshTokenByHash(client, 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('revokeRefreshToken', () => {
    it('should set revoked_at to NOW() for the given token hash', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 1 } as never)

      await revokeRefreshToken(client, 'token-hash')

      expect(client.query).toHaveBeenCalledWith(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
        ['token-hash'],
      )
    })
  })

  describe('revokeAllUserRefreshTokens', () => {
    it('should revoke all active tokens for a user', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 3 } as never)

      await revokeAllUserRefreshTokens(client, 'user-1')

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND revoked_at IS NULL'),
        ['user-1'],
      )
    })
  })

  // ─── Auth Events ────────────────────────────────────────────────────────

  describe('logAuthEvent', () => {
    it('should insert an auth event with metadata', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 1 } as never)

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'signin',
        ip_address: '192.168.1.1',
        user_agent: 'Test Agent',
        metadata: { provider: 'google' },
      })

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO auth_events'),
        ['user-1', 'signin', '192.168.1.1', 'Test Agent', '{"provider":"google"}'],
      )
    })

    it('should handle null metadata', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 1 } as never)

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'logout',
        ip_address: null,
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0][1] as unknown[]
      expect(callArgs[4]).toBeNull()
    })

    it('should handle null user_id for anonymous events', async () => {
      vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 1 } as never)

      await logAuthEvent(client, {
        user_id: null,
        event_type: 'token_reuse_detected',
        ip_address: '10.0.0.1',
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0][1] as unknown[]
      expect(callArgs[0]).toBeNull()
    })
  })
})
