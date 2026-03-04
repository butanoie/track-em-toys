import { describe, it, expect, vi, beforeEach } from 'vitest'
import type pg from 'pg'
import type { User, OAuthAccount, RefreshToken } from '../types/index.js'

/**
 * Build a pg.QueryResult-compatible object for use in vi.fn().mockResolvedValue().
 * Includes all required fields so the cast to pg.QueryResult<T> is structurally valid.
 *
 * @param rows - Row data to return
 * @param rowCount - Number of affected rows (defaults to rows.length)
 */
function mockQueryResult<T extends pg.QueryResultRow>(rows: T[], rowCount?: number): pg.QueryResult<T> {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  }
}

import {
  findUserById,
  findUserByEmail,
  createUser,
  updateUserDisplayName,
  setUserEmailVerified,
  getUserStatus,
  findOAuthAccountWithUser,
  findOAuthAccount,
  createOAuthAccount,
  findOAuthAccountsByUserId,
  findUserWithAccounts,
  userHasProvider,
  createRefreshToken,
  findRefreshTokenByHash,
  findRefreshTokenForRotation,
  deleteOrphanUser,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  logAuthEvent,
  toUserResponse,
  type QueryOnlyClient,
} from './queries.js'

function createMockClient(): QueryOnlyClient {
  return { query: vi.fn() } satisfies QueryOnlyClient
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
  client_type: 'web',
  created_at: '2026-01-01T00:00:00Z',
}

describe('queries', () => {
  let client: QueryOnlyClient

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
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockUser], 1))

      const result = await findUserById(client, 'user-1')

      expect(result).toEqual(mockUser)
      expect(client.query).toHaveBeenCalledWith(
        'SELECT id, email, email_verified, display_name, avatar_url, deactivated_at, created_at, updated_at FROM users WHERE id = $1',
        ['user-1'],
      )
    })

    it('should return null when not found', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findUserById(client, 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('findUserByEmail', () => {
    it('should search case-insensitively for verified emails only', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockUser], 1))

      const result = await findUserByEmail(client, 'Test@Example.com')

      expect(result).toEqual(mockUser)
      expect(client.query).toHaveBeenCalledWith(
        'SELECT id, email, email_verified, display_name, avatar_url, deactivated_at, created_at, updated_at FROM users WHERE LOWER(email) = LOWER($1) AND email_verified = true',
        ['Test@Example.com'],
      )
    })

    it('should return null when no matching verified email exists', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findUserByEmail(client, 'unknown@example.com')
      expect(result).toBeNull()
    })
  })

  describe('createUser', () => {
    it('should insert user with lowercased email and return created record', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockUser], 1))

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
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([{ ...mockUser, email: null, display_name: null, avatar_url: null }], 1))

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
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

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
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await updateUserDisplayName(client, 'user-1', 'New Name')

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND display_name IS NULL'),
        ['user-1', 'New Name'],
      )
    })
  })

  describe('setUserEmailVerified', () => {
    it('should UPDATE email_verified to true only when currently false', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await setUserEmailVerified(client, 'user-1')

      expect(client.query).toHaveBeenCalledOnce()
      expect(client.query).toHaveBeenCalledWith(
        'UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1 AND email_verified = false',
        ['user-1'],
      )
    })

    it('should resolve without error when no row is updated (user already verified)', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      await expect(setUserEmailVerified(client, 'user-already-verified')).resolves.toBeUndefined()
      expect(client.query).toHaveBeenCalledOnce()
    })
  })

  describe('getUserStatus', () => {
    it('should return active for non-deactivated user', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([{ deactivated_at: null }], 1))

      const result = await getUserStatus(client, 'user-1')
      expect(result).toBe('active')
    })

    it('should return deactivated for deactivated user', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([{ deactivated_at: '2026-01-15T00:00:00Z' }], 1))

      const result = await getUserStatus(client, 'user-1')
      expect(result).toBe('deactivated')
    })

    it('should return not_found when user does not exist', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await getUserStatus(client, 'nonexistent')
      expect(result).toBe('not_found')
    })
  })

  // ─── OAuth Account Queries ──────────────────────────────────────────────

  describe('findOAuthAccountWithUser', () => {
    it('should return both oauth account and user when both exist (happy path)', async () => {
      // The JOIN query returns a flat row with aliased columns for both tables
      const joinRow = {
        oauth_account_id: 'oauth-1',
        oa_user_id: mockUser.id,
        oa_provider: 'google' as const,
        oa_provider_user_id: 'google-123',
        oa_email: 'test@gmail.com',
        oa_is_private_email: false,
        oa_raw_profile: null,
        oa_created_at: new Date('2026-01-01T00:00:00Z'),
        user_id: mockUser.id,
        user_email: mockUser.email,
        email_verified: mockUser.email_verified,
        display_name: mockUser.display_name,
        avatar_url: mockUser.avatar_url,
        deactivated_at: mockUser.deactivated_at,
        user_created_at: mockUser.created_at,
        updated_at: mockUser.updated_at,
      }
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([joinRow], 1))

      const result = await findOAuthAccountWithUser(client, 'google', 'google-123')

      expect(result).toBeDefined()
      expect(result!.oauthAccount.id).toBe('oauth-1')
      expect(result!.oauthAccount.provider).toBe('google')
      expect(result!.oauthAccount.provider_user_id).toBe('google-123')
      expect(result!.oauthAccount.email).toBe('test@gmail.com')
      expect(result!.oauthAccount.user_id).toBe(mockUser.id)
      expect(result!.user.id).toBe(mockUser.id)
      expect(result!.user.email).toBe(mockUser.email)
      expect(result!.user.display_name).toBe(mockUser.display_name)
      expect(result!.user.deactivated_at).toBeNull()
    })

    it('should return null when no oauth account is found for the provider/sub combination', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findOAuthAccountWithUser(client, 'apple', 'unknown-sub')

      expect(result).toBeNull()
    })

    it('should use an INNER JOIN so user data is always present when an oauth account is found', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      await findOAuthAccountWithUser(client, 'google', 'google-123')

      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      expect(sql).toContain('JOIN users')
      expect(sql).toContain('WHERE oa.provider = $1 AND oa.provider_user_id = $2')
    })

    it('should use explicit column aliases to avoid ambiguity between oauth and user columns', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      await findOAuthAccountWithUser(client, 'google', 'google-123')

      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      // The query must use explicit aliases, not SELECT *
      expect(sql).toContain('AS oauth_account_id')
      expect(sql).toContain('AS user_id')
    })

    it('should preserve all OAuthAccount fields from the JOIN row', async () => {
      const joinRow = {
        oauth_account_id: 'oauth-99',
        oa_user_id: mockUser.id,
        oa_provider: 'apple' as const,
        oa_provider_user_id: 'apple-sub-xyz',
        oa_email: null,
        oa_is_private_email: true,
        oa_raw_profile: { sub: 'apple-sub-xyz' },
        oa_created_at: new Date('2026-02-01T00:00:00Z'),
        user_id: mockUser.id,
        user_email: null,
        email_verified: false,
        display_name: null,
        avatar_url: null,
        deactivated_at: null,
        user_created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([joinRow], 1))

      const result = await findOAuthAccountWithUser(client, 'apple', 'apple-sub-xyz')

      expect(result).toBeDefined()
      expect(result!.oauthAccount.id).toBe('oauth-99')
      expect(result!.oauthAccount.provider).toBe('apple')
      expect(result!.oauthAccount.email).toBeNull()
      expect(result!.oauthAccount.is_private_email).toBe(true)
      expect(result!.oauthAccount.raw_profile).toEqual({ sub: 'apple-sub-xyz' })
      expect(result!.user.email).toBeNull()
      expect(result!.user.email_verified).toBe(false)
    })
  })

  describe('findOAuthAccount', () => {
    it('should find by provider and provider user ID', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockOAuthAccount], 1))

      const result = await findOAuthAccount(client, 'google', 'google-123')

      expect(result).toEqual(mockOAuthAccount)
      expect(client.query).toHaveBeenCalledWith(
        'SELECT id, user_id, provider, provider_user_id, email, is_private_email, raw_profile, created_at FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
        ['google', 'google-123'],
      )
    })

    it('should return null when not found', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findOAuthAccount(client, 'apple', 'unknown')
      expect(result).toBeNull()
    })
  })

  describe('createOAuthAccount', () => {
    it('should insert with ON CONFLICT DO NOTHING and return created record', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockOAuthAccount], 1))

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
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

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
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockOAuthAccount], 1))

      await createOAuthAccount(client, {
        user_id: 'user-1',
        provider: 'apple',
        provider_user_id: 'apple-456',
        email: null,
        is_private_email: false,
        raw_profile: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      expect(callArgs?.[5]).toBeNull()
    })
  })

  describe('findOAuthAccountsByUserId', () => {
    it('should return all accounts for a user', async () => {
      const accounts = [mockOAuthAccount, { ...mockOAuthAccount, id: 'oauth-2', provider: 'apple' as const }]
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult(accounts, 2))

      const result = await findOAuthAccountsByUserId(client, 'user-1')

      expect(result).toHaveLength(2)
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM oauth_accounts WHERE user_id = $1'),
        ['user-1'],
      )
    })

    it('should return empty array when no accounts exist', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findOAuthAccountsByUserId(client, 'user-no-accounts')
      expect(result).toEqual([])
    })
  })

  describe('findUserWithAccounts', () => {
    it('should return user and accounts from a single JOIN query', async () => {
      const joinRow = {
        ...mockUser,
        oa_id: 'oauth-1',
        oa_user_id: mockUser.id,
        oa_provider: 'google' as const,
        oa_provider_user_id: 'google-sub-123',
        oa_email: 'test@gmail.com',
        oa_is_private_email: false,
        oa_raw_profile: null,
        oa_created_at: new Date('2026-01-01T00:00:00Z'),
      }
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([joinRow], 1))

      const result = await findUserWithAccounts(client, 'user-1')

      expect(result).toBeDefined()
      expect(result!.user.id).toBe('user-1')
      expect(result!.accounts).toHaveLength(1)
      expect(result!.accounts[0]?.provider).toBe('google')
      expect(result!.accounts[0]?.email).toBe('test@gmail.com')
    })

    it('should return user with empty accounts when no oauth rows', async () => {
      const joinRow = { ...mockUser, oa_id: null, oa_provider: null, oa_email: null }
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([joinRow], 1))

      const result = await findUserWithAccounts(client, 'user-1')

      expect(result).toBeDefined()
      expect(result!.accounts).toHaveLength(0)
    })

    it('should return null when user does not exist', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findUserWithAccounts(client, 'nonexistent')
      expect(result).toBeNull()
    })

    it('should use a LEFT JOIN so both user and account data are fetched in one query', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      await findUserWithAccounts(client, 'user-1')

      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      expect(sql).toContain('LEFT JOIN oauth_accounts')
    })

    it('should aggregate multiple JOIN rows into the accounts array (multi-provider)', async () => {
      // Two JOIN rows — one Google account, one Apple account — same user
      const googleRow = {
        ...mockUser,
        oa_id: 'oauth-1',
        oa_user_id: mockUser.id,
        oa_provider: 'google' as const,
        oa_provider_user_id: 'google-sub-123',
        oa_email: 'test@gmail.com',
        oa_is_private_email: false,
        oa_raw_profile: null,
        oa_created_at: new Date('2026-01-01T00:00:00Z'),
      }
      const appleRow = {
        ...mockUser,
        oa_id: 'oauth-2',
        oa_user_id: mockUser.id,
        oa_provider: 'apple' as const,
        oa_provider_user_id: 'apple-sub-456',
        oa_email: 'test@privaterelay.appleid.com',
        oa_is_private_email: true,
        oa_raw_profile: null,
        oa_created_at: '2026-01-02T00:00:00Z',
      }
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([googleRow, appleRow], 2))

      const result = await findUserWithAccounts(client, 'user-1')

      expect(result).toBeDefined()
      expect(result!.user.id).toBe('user-1')
      expect(result!.accounts).toHaveLength(2)
      const providers = result!.accounts.map((a) => a.provider)
      expect(providers).toContain('google')
      expect(providers).toContain('apple')
      // Verify real fields are mapped — not fabricated empty strings
      const googleAccount = result!.accounts.find((a) => a.provider === 'google')
      expect(googleAccount?.provider_user_id).toBe('google-sub-123')
      expect(googleAccount?.is_private_email).toBe(false)
      const appleAccount = result!.accounts.find((a) => a.provider === 'apple')
      expect(appleAccount?.provider_user_id).toBe('apple-sub-456')
      expect(appleAccount?.is_private_email).toBe(true)
    })
  })

  describe('userHasProvider', () => {
    it('should return true when provider is linked', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([{ exists: true }], 1))

      const result = await userHasProvider(client, 'user-1', 'google')
      expect(result).toBe(true)
    })

    it('should return false when provider is not linked', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([{ exists: false }], 1))

      const result = await userHasProvider(client, 'user-1', 'apple')
      expect(result).toBe(false)
    })

    it('should use SELECT EXISTS for a short-circuit boolean check', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([{ exists: false }], 1))

      await userHasProvider(client, 'user-1', 'google')

      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      expect(sql).toContain('SELECT EXISTS')
    })
  })

  // ─── Refresh Token Queries ──────────────────────────────────────────────

  describe('createRefreshToken', () => {
    it('should insert and return the refresh token record', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockRefreshToken], 1))
      const expiresAt = new Date('2026-02-01T00:00:00Z')

      const result = await createRefreshToken(client, {
        user_id: 'user-1',
        token_hash: 'abc123hash',
        device_info: 'Chrome/120',
        expires_at: expiresAt,
        client_type: 'web',
      })

      expect(result).toEqual(mockRefreshToken)
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refresh_tokens'),
        ['user-1', 'abc123hash', 'Chrome/120', expiresAt, 'web'],
      )
    })

    it('should include client_type in the INSERT column list', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockRefreshToken], 1))

      await createRefreshToken(client, {
        user_id: 'user-1',
        token_hash: 'abc123hash',
        device_info: null,
        expires_at: new Date(),
        client_type: 'native',
      })

      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      expect(sql).toContain('client_type')
    })

    it('should throw when INSERT returns no rows', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      await expect(
        createRefreshToken(client, {
          user_id: 'user-1',
          token_hash: 'abc123hash',
          device_info: null,
          expires_at: new Date(),
          client_type: 'web',
        }),
      ).rejects.toThrow('INSERT INTO refresh_tokens returned no rows')
    })
  })

  describe('findRefreshTokenByHash', () => {
    it('should find token regardless of revocation status', async () => {
      const revokedToken = { ...mockRefreshToken, revoked_at: '2026-01-15T00:00:00Z' }
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([revokedToken], 1))

      const result = await findRefreshTokenByHash(client, 'abc123hash')

      expect(result).toEqual(revokedToken)
      // The WHERE clause must not filter on revoked_at — the token is returned regardless of
      // revocation status so that logout works even for already-expired/revoked tokens.
      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      const whereClause = sql?.substring(sql.indexOf('WHERE'))
      expect(whereClause).not.toContain('revoked_at')
    })

    it('should return null when token hash does not exist', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findRefreshTokenByHash(client, 'nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('findRefreshTokenForRotation', () => {
    it('should return token with FOR UPDATE lock and AND expires_at > NOW() filter', async () => {
      const revokedToken = { ...mockRefreshToken, revoked_at: '2026-01-15T00:00:00Z' }
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([revokedToken], 1))

      const result = await findRefreshTokenForRotation(client, 'abc123hash')

      expect(result).toEqual(revokedToken)
      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      expect(sql).toContain('FOR UPDATE')
      expect(sql).toContain('expires_at > NOW()')
    })

    it('should include client_type in the SELECT column list', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockRefreshToken], 1))

      await findRefreshTokenForRotation(client, 'abc123hash')

      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      expect(sql).toContain('client_type')
    })

    it('should return active (non-revoked) non-expired token with FOR UPDATE lock', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult([mockRefreshToken], 1))

      const result = await findRefreshTokenForRotation(client, 'abc123hash')

      expect(result).toEqual(mockRefreshToken)
      expect(result?.revoked_at).toBeNull()
      expect(result?.client_type).toBe('web')
    })

    it('should return null when token hash does not exist', async () => {
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findRefreshTokenForRotation(client, 'nonexistent')
      expect(result).toBeNull()
    })

    it('should return null when the token is expired (SQL filters via AND expires_at > NOW())', async () => {
      // The database returns no rows because expires_at <= NOW() — simulate that here.
      // safe: mockResolvedValue is typed for the query's return shape
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      const result = await findRefreshTokenForRotation(client, 'expired-hash')
      expect(result).toBeNull()
    })
  })

  describe('deleteOrphanUser', () => {
    it('should execute DELETE with NOT EXISTS guard using the correct SQL and parameter', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (DELETE returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await deleteOrphanUser(client, 'user-1')

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM users WHERE id = $1'),
        ['user-1'],
      )
      const sql = vi.mocked(client.query).mock.calls[0]?.[0] as string | undefined
      expect(sql).toBeDefined()
      expect(sql).toContain('NOT EXISTS')
      expect(sql).toContain('SELECT 1 FROM oauth_accounts WHERE user_id = $1')
    })

    it('should resolve without error when no matching row exists (0 rows affected)', async () => {
      // Simulates the case where the user already had an oauth_account and the
      // NOT EXISTS guard prevented deletion, returning rowCount 0.
      // safe: mockResolvedValue is typed for the query's return shape (DELETE returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      await expect(deleteOrphanUser(client, 'user-with-accounts')).resolves.toBeUndefined()
    })

    it('should propagate DB errors to the caller', async () => {
      const dbError = new Error('connection terminated unexpectedly')
      vi.mocked(client.query).mockRejectedValue(dbError)

      await expect(deleteOrphanUser(client, 'user-1')).rejects.toThrow(
        'connection terminated unexpectedly',
      )
    })
  })

  describe('revokeRefreshToken', () => {
    it('should set revoked_at to NOW() for the given token hash', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (UPDATE returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await revokeRefreshToken(client, 'token-hash')

      expect(client.query).toHaveBeenCalledWith(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
        ['token-hash'],
      )
    })

    it('should throw when no row was updated (rowCount = 0)', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (UPDATE returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 0))

      await expect(revokeRefreshToken(client, 'abcdef12deadbeef')).rejects.toThrow(
        'revokeRefreshToken: token not found (hash prefix: abcdef12)',
      )
    })
  })

  describe('revokeAllUserRefreshTokens', () => {
    it('should revoke all active tokens for a user', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (UPDATE returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 3))

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
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

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
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'logout',
        ip_address: null,
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      expect(callArgs?.[4]).toBeNull()
    })

    it('should handle null user_id for anonymous events', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await logAuthEvent(client, {
        user_id: null,
        event_type: 'token_reuse_detected',
        ip_address: '10.0.0.1',
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      expect(callArgs?.[0]).toBeNull()
    })

    // [T6] IPv6 address with zone ID (e.g. ::1%eth0) must be dropped to null
    it('should drop IPv6 address with zone ID to null (::1%eth0 is invalid for INET column)', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'signin',
        ip_address: '::1%eth0', // zone ID makes this invalid for PostgreSQL INET
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      // ip_address is the third parameter (index 2); must be null after validation
      expect(callArgs?.[2]).toBeNull()
    })

    it('should accept a valid IPv6 address without a zone ID', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'signin',
        ip_address: '::1',
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      expect(callArgs?.[2]).toBe('::1')
    })

    it('should accept a valid IPv4 address', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'signin',
        ip_address: '192.168.0.1',
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      expect(callArgs?.[2]).toBe('192.168.0.1')
    })

    it('should drop a malformed IP string to null', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'signin',
        ip_address: 'not-an-ip',
        user_agent: null,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      expect(callArgs?.[2]).toBeNull()
    })

    it('should sanitize user_agent: strip control chars, trim, and truncate to 512 chars', async () => {
      // safe: mockResolvedValue is typed for the query's return shape (INSERT returns no rows)
      vi.mocked(client.query).mockResolvedValue(mockQueryResult<pg.QueryResultRow>([], 1))

      // Build a user_agent with control characters and length > 512
      const uaWithControlChars = '\x00Mozilla\x1F/5.0\x7F ' + 'A'.repeat(600)

      await logAuthEvent(client, {
        user_id: 'user-1',
        event_type: 'signin',
        ip_address: null,
        user_agent: uaWithControlChars,
      })

      const callArgs = vi.mocked(client.query).mock.calls[0]?.[1] as unknown[] | undefined
      const storedUa = callArgs?.[3]
      // Control chars stripped, trimmed, then truncated to 512
      expect(typeof storedUa).toBe('string')
      expect((storedUa as string).length).toBe(512)
      // No control characters remain
      // eslint-disable-next-line no-control-regex -- intentional: asserting control chars were stripped
      expect(storedUa).not.toMatch(/[\x00-\x1F\x7F]/)
      // Must start with 'Mozilla' after stripping the leading \x00
      expect(storedUa as string).toMatch(/^Mozilla/)
    })
  })
})
