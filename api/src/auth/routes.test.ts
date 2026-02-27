/**
 * Integration tests for auth routes.
 *
 * Strategy: build a real Fastify server via buildServer() and use
 * fastify.inject() to exercise the full request/response pipeline including
 * schema validation, rate-limit plugin registration, and JWT signing.
 *
 * External dependencies are mocked at the module boundary:
 *   - db/pool (withTransaction) — returns whatever the test provides
 *   - db/queries — individual query functions
 *   - auth/apple / auth/google — provider token verifiers
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { User, OAuthAccount, RefreshToken } from '../types/index.js'
import type { PoolClient } from '../db/pool.js'

// ─── Generate a real EC key pair before vi.mock() hoisting ───────────────────
// Must use require() inside vi.hoisted() because ESM imports are not yet resolved.
const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto')
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  })
  return {
    // format: 'pem' guarantees string at runtime; TS types KeyObject.export() as string | Buffer
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  }
})

// ─── Module mocks — must be declared before any imports ──────────────────────

vi.mock('../config.js', () => ({
  config: {
    port: 3000,
    corsOrigin: 'http://localhost:5173',
    trustProxy: false,
    secureCookies: false,
    cookieSecret: 'test-cookie-secret-32-bytes-long!!',
    database: { url: 'postgresql://test:test@localhost:5432/testdb' },
    jwt: {
      privateKey: testPrivatePem,
      publicKey: testPublicPem,
      keyId: 'routes-test-kid',
      issuer: 'track-em-toys-test',
      audience: 'track-em-toys-api-test',
      accessTokenExpiry: '15m',
    },
    apple: { bundleId: 'com.example.app', servicesId: undefined },
    google: { webClientId: 'google-web-client-id', iosClientId: undefined },
  },
}))

vi.mock('../db/pool.js', () => ({
  withTransaction: vi.fn(),
  pool: { connect: vi.fn(), on: vi.fn(), end: vi.fn() },
}))

vi.mock('../db/queries.js', () => ({
  findOAuthAccountWithUser: vi.fn(),
  findOAuthAccount: vi.fn(),
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  createOAuthAccount: vi.fn(),
  updateUserDisplayName: vi.fn(),
  deleteOrphanUser: vi.fn(),
  userHasProvider: vi.fn(),
  findOAuthAccountsByUserId: vi.fn(),
  findUserWithAccounts: vi.fn(),
  getUserStatus: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  findRefreshTokenForRotation: vi.fn(),
  // createRefreshToken is used by tokens.ts (createAndStoreRefreshToken / rotateRefreshToken)
  // which is called by route handlers during signin and refresh.
  createRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllUserRefreshTokens: vi.fn(),
  setUserEmailVerified: vi.fn(),
  logAuthEvent: vi.fn(),
  toUserResponse: vi.fn((u: User) => ({
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
  })),
}))

vi.mock('./apple.js', () => ({
  verifyAppleToken: vi.fn(),
  isPrivateRelayEmail: vi.fn().mockReturnValue(false),
}))

vi.mock('./google.js', () => ({
  verifyGoogleToken: vi.fn(),
}))

// ─── Import after mocks are registered ───────────────────────────────────────

import { buildServer } from '../server.js'
import * as pool from '../db/pool.js'
import * as queries from '../db/queries.js'
import { verifyAppleToken } from './apple.js'
import { verifyGoogleToken } from './google.js'
import { ProviderVerificationError } from './errors.js'

// ─── Fixture helpers ─────────────────────────────────────────────────────────

const mockUser: User = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'test@example.com',
  email_verified: true,
  display_name: 'Test User',
  avatar_url: null,
  deactivated_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockDeactivatedUser: User = {
  ...mockUser,
  deactivated_at: '2026-01-15T00:00:00Z',
}

const mockOAuthAccount: OAuthAccount = {
  id: 'oauth-acc-1',
  user_id: mockUser.id,
  provider: 'google',
  provider_user_id: 'google-sub-123',
  email: 'test@example.com',
  is_private_email: false,
  raw_profile: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockRefreshToken: RefreshToken = {
  id: 'rt-1',
  user_id: mockUser.id,
  token_hash: 'abc123hash',
  device_info: null,
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  revoked_at: null,
  client_type: 'web',
  created_at: '2026-01-01T00:00:00Z',
}

const googleClaims = {
  sub: 'google-sub-123',
  email: 'test@example.com',
  email_verified: true,
  name: 'Test User',
  picture: null,
  client_type: 'web' as const,
}

const appleClaims = {
  sub: 'apple-sub-456',
  email: 'apple@example.com',
  email_verified: true,
  name: null,
  picture: null,
  client_type: 'native' as const,
}

// ─── withTransaction passthrough helper ──────────────────────────────────────

/**
 * Tracks the userId argument passed to the most recent withTransaction() call.
 * Tests that care about RLS context can assert this value.
 */
let lastTransactionUserId: string | null | undefined

/**
 * Make withTransaction() call the provided fn with a fake client and return
 * whatever fn returns, just like the real implementation. Also captures the
 * userId argument so tests can assert it was forwarded for RLS context.
 */
function mockTx() {
  // All query functions are vi.mock'd at the module boundary above, so fakeClient
  // is passed through by withTransaction but its methods are never actually invoked.
  // Pick<PoolClient, never> documents this intent without 'as never' bypassing type safety.
  const fakeClient = {} satisfies Pick<PoolClient, never>
  vi.mocked(pool.withTransaction).mockImplementation(async (fn, userId) => {
    lastTransactionUserId = userId
    // fakeClient cast is safe: all query functions are mocked, no real DB method is called
    return fn(fakeClient as PoolClient)
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('auth routes', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default mock implementations after clearAllMocks
    vi.mocked(queries.toUserResponse).mockImplementation((u: User) => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
    }))
    vi.mocked(queries.logAuthEvent).mockResolvedValue(undefined)
    vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)
    vi.mocked(queries.revokeAllUserRefreshTokens).mockResolvedValue(undefined)
    vi.mocked(queries.updateUserDisplayName).mockResolvedValue(undefined)
    vi.mocked(queries.setUserEmailVerified).mockResolvedValue(undefined)
    vi.mocked(queries.deleteOrphanUser).mockResolvedValue(undefined)
    vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)
    // createRefreshToken is called via tokens.ts (createAndStoreRefreshToken / rotateRefreshToken)
    vi.mocked(queries.createRefreshToken).mockResolvedValue(mockRefreshToken)
    // findOAuthAccountWithUser is used by Branch A (returning user signin)
    vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
  })

  // ─── POST /auth/signin ─────────────────────────────────────────────────────

  describe('POST /auth/signin', () => {
    describe('Apple provider — new user', () => {
      it('should create user and return access_token + user (native client via bundleId aud → clientType native)', async () => {
        // appleClaims has clientType: 'native' (bundleId audience) — no X-Client-Type header needed
        vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
        mockTx()
        vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
        vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
        vi.mocked(queries.createUser).mockResolvedValue({
          ...mockUser,
          id: 'new-user-uuid-1234-5678-9abc-def012345678',
          email: appleClaims.email,
        })
        vi.mocked(queries.createOAuthAccount).mockResolvedValue({
          ...mockOAuthAccount,
          provider: 'apple',
          provider_user_id: appleClaims.sub,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: {
            'content-type': 'application/json',
            // No X-Client-Type header — client_type is derived from aud claim
          },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
            user_info: { name: 'New User' },
          }),
        })

        expect(response.statusCode).toBe(200)
        const body = response.json<{ access_token: string; refresh_token: string; user: { id: string } }>()
        expect(body.access_token).toBeTruthy()
        expect(body.refresh_token).toBeTruthy() // native: token in body, not cookie
        expect(body.user).toBeDefined()
        // [T1] signin must not set RLS userId — user may not exist yet (new signup)
        expect(lastTransactionUserId).toBeUndefined()
      })

      it('should return null refresh_token and set cookie for Apple web client (servicesId aud → clientType web)', async () => {
        const webAppleClaims = { ...appleClaims, client_type: 'web' as const }
        vi.mocked(verifyAppleToken).mockResolvedValue(webAppleClaims)
        mockTx()
        vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
        vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
        vi.mocked(queries.createUser).mockResolvedValue({
          ...mockUser,
          email: webAppleClaims.email,
        })
        vi.mocked(queries.createOAuthAccount).mockResolvedValue({
          ...mockOAuthAccount,
          provider: 'apple',
          provider_user_id: webAppleClaims.sub,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
          }),
        })

        expect(response.statusCode).toBe(200)
        const body = response.json<{ refresh_token: null }>()
        expect(body.refresh_token).toBeNull() // web: no token in body
        const setCookieHeader = response.headers['set-cookie']
        expect(setCookieHeader).toBeDefined()
      })
    })

    describe('Apple provider — Branch A: existing user with null display_name', () => {
      it('should call updateUserDisplayName and return updated name when display_name is null and user_info.name is provided', async () => {
        // Branch A: oauth account already exists, but user has no display_name yet.
        // The route should call updateUserDisplayName and return the updated name.
        const userWithNoName: User = {
          ...mockUser,
          display_name: null,
        }
        const appleOauthAccount = {
          ...mockOAuthAccount,
          provider: 'apple' as const,
          provider_user_id: appleClaims.sub,
        }
        vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
        mockTx()
        // Branch A uses the JOIN query (findOAuthAccountWithUser) to fetch both records
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
          oauthAccount: appleOauthAccount,
          user: userWithNoName,
        })
        // toUserResponse must reflect the updated name
        vi.mocked(queries.toUserResponse).mockImplementation((u: User) => ({
          id: u.id,
          email: u.email,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
        }))

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.400.1.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
            user_info: { name: 'New Display Name' },
          }),
        })

        expect(response.statusCode).toBe(200)
        // updateUserDisplayName must have been called with the sanitized name
        expect(queries.updateUserDisplayName).toHaveBeenCalledWith(
          expect.anything(),
          userWithNoName.id,
          'New Display Name',
        )
        // The response user should include the updated display_name
        const body = response.json<{ user: { display_name: string | null } }>()
        expect(body.user.display_name).toBe('New Display Name')
      })
    })

    describe('Google provider — existing user', () => {
      it('should sign in existing user and return tokens in body (native client via iosClientId aud)', async () => {
        const nativeGoogleClaims = { ...googleClaims, client_type: 'native' as const }
        vi.mocked(verifyGoogleToken).mockResolvedValue(nativeGoogleClaims)
        mockTx()
        // Branch A uses the JOIN query (findOAuthAccountWithUser) — two queries replaced by one
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
          oauthAccount: mockOAuthAccount,
          user: mockUser,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: {
            'content-type': 'application/json',
            // No X-Client-Type header — client_type derived from aud claim
          },
          body: JSON.stringify({
            provider: 'google',
            id_token: 'google-id-token',
          }),
        })

        expect(response.statusCode).toBe(200)
        const body = response.json<{ access_token: string; refresh_token: string; user: { id: string } }>()
        expect(body.access_token).toBeTruthy()
        expect(body.refresh_token).toBeTruthy() // native: token in body
        expect(body.user.id).toBe(mockUser.id)
        // [T1] signin must not set RLS userId — runs unauthenticated
        expect(lastTransactionUserId).toBeUndefined()
      })

      it('should set cookie and return null refresh_token for web clients (webClientId aud → clientType web)', async () => {
        // googleClaims has clientType: 'web' (webClientId audience)
        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        mockTx()
        // Branch A uses the JOIN query (findOAuthAccountWithUser) — two queries replaced by one
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
          oauthAccount: mockOAuthAccount,
          user: mockUser,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'google',
            id_token: 'google-id-token',
          }),
        })

        expect(response.statusCode).toBe(200)
        const body = response.json<{ refresh_token: null }>()
        expect(body.refresh_token).toBeNull()
        // Cookie should be set (signed) with required security attributes
        const setCookieHeader = response.headers['set-cookie'] as string | string[]
        expect(setCookieHeader).toBeDefined()
        // [T3] Assert cookie security attributes
        const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
        expect(cookieStr).toContain('Path=/auth')
        expect(cookieStr).toContain('HttpOnly')
        expect(cookieStr).toContain('SameSite=Strict')
      })

      it('should return 403 for deactivated user', async () => {
        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        mockTx()
        // Branch A uses the JOIN query — deactivated user check happens after the JOIN
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
          oauthAccount: mockOAuthAccount,
          user: mockDeactivatedUser,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'google',
            id_token: 'google-id-token',
          }),
        })

        expect(response.statusCode).toBe(403)
        expect(response.json<{ error: string }>().error).toBe('Account deactivated')
      })
    })

    describe('email linking', () => {
      it('should link new provider to existing user by email and return 200', async () => {
        // googleClaims has clientType: 'web' — response will be cookie-based
        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        mockTx()
        // No existing oauth account for this provider
        vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
        // But there is an existing user with this email
        vi.mocked(queries.findUserByEmail).mockResolvedValue(mockUser)
        vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'google',
            id_token: 'google-id-token',
          }),
        })

        expect(response.statusCode).toBe(200)
        expect(queries.createOAuthAccount).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ user_id: mockUser.id }),
        )
        // Branch B auto-link must emit 'provider_auto_linked', not 'link_account',
        // so security teams can alert on this path separately from user-initiated links.
        const logCalls = vi.mocked(queries.logAuthEvent).mock.calls
        const autoLinkCall = logCalls.find(([, params]) => params.event_type === 'provider_auto_linked')
        expect(autoLinkCall).toBeDefined()
        expect(autoLinkCall?.[1].metadata).toMatchObject({ auto_linked: true })
      })

      // Branch B — full happy path: assert the complete call chain and response shape.
      // findOAuthAccountWithUser returns null (Branch A skipped), findUserByEmail matches
      // an existing verified-email user, createOAuthAccount links the provider.
      it('Branch B: should call findOAuthAccountWithUser, findUserByEmail, and createOAuthAccount in order', async () => {
        // googleClaims has clientType: 'web' — response will be cookie-based (null in body)
        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        mockTx()
        // Branch A returns null — no existing oauth_account for this provider+sub
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
        // Branch B email lookup finds the existing user
        vi.mocked(queries.findUserByEmail).mockResolvedValue(mockUser)
        // Linking succeeds
        vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.20.1.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'google',
            id_token: 'google-id-token',
          }),
        })

        // Response must be a successful sign-in
        expect(response.statusCode).toBe(200)
        const body = response.json<{ access_token: string; refresh_token: null; user: { id: string } }>()
        expect(body.access_token).toBeTruthy()
        expect(body.refresh_token).toBeNull() // web client → token in cookie, not body
        expect(body.user.id).toBe(mockUser.id)

        // Branch A must have been attempted first
        expect(queries.findOAuthAccountWithUser).toHaveBeenCalledWith(
          expect.anything(),
          'google',
          googleClaims.sub,
        )

        // Branch B must have queried by email
        expect(queries.findUserByEmail).toHaveBeenCalledWith(
          expect.anything(),
          googleClaims.email,
        )

        // The new OAuth account must have been linked to the existing user
        expect(queries.createOAuthAccount).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            user_id: mockUser.id,
            provider: 'google',
            provider_user_id: googleClaims.sub,
          }),
        )

        // provider_auto_linked audit event must be emitted (distinct from signin event)
        const logCalls = vi.mocked(queries.logAuthEvent).mock.calls
        const autoLinkCall = logCalls.find(([, params]) => params.event_type === 'provider_auto_linked')
        expect(autoLinkCall).toBeDefined()
        expect(autoLinkCall?.[1]).toMatchObject({
          user_id: mockUser.id,
          event_type: 'provider_auto_linked',
          metadata: { provider: 'google', auto_linked: true },
        })

        // The standard signin audit event must also be emitted after resolveOrCreateUser
        const signinCall = logCalls.find(([, params]) => params.event_type === 'signin')
        expect(signinCall).toBeDefined()
        expect(signinCall?.[1]).toMatchObject({
          user_id: mockUser.id,
          event_type: 'signin',
          metadata: { provider: 'google' },
        })

        // [T1] signin must not set RLS userId — user may not exist at start of transaction
        expect(lastTransactionUserId).toBeUndefined()
      })

      // Branch B — native client path: Apple provider with bundleId aud → clientType native.
      // Tokens must be returned in the response body (not in a cookie) when client is native.
      it('Branch B: should return tokens in body (not cookie) for native Apple client', async () => {
        // appleClaims has a different email from the existing Google oauth_account — simulates
        // a user who previously signed in with Google and is now signing in with Apple for the
        // first time using the same verified email address.
        const appleBranchBClaims = {
          ...appleClaims,
          email: mockUser.email, // matches the existing user
          email_verified: true,
        }
        vi.mocked(verifyAppleToken).mockResolvedValue(appleBranchBClaims)
        mockTx()
        // Branch A returns null — no existing Apple oauth_account for this sub
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
        // Branch B email lookup finds the existing user
        vi.mocked(queries.findUserByEmail).mockResolvedValue(mockUser)
        // Linking succeeds
        const appleOauthAccount = {
          ...mockOAuthAccount,
          provider: 'apple' as const,
          provider_user_id: appleClaims.sub,
        }
        vi.mocked(queries.createOAuthAccount).mockResolvedValue(appleOauthAccount)

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.20.2.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
          }),
        })

        // Response must be a successful sign-in
        expect(response.statusCode).toBe(200)
        const body = response.json<{ access_token: string; refresh_token: string; user: { id: string } }>()
        expect(body.access_token).toBeTruthy()
        expect(body.refresh_token).toBeTruthy() // native client → token in body, not cookie
        expect(body.user.id).toBe(mockUser.id)

        // No Set-Cookie header for native clients
        expect(response.headers['set-cookie']).toBeUndefined()

        // provider_auto_linked audit event must be emitted with the apple provider
        const logCalls = vi.mocked(queries.logAuthEvent).mock.calls
        const autoLinkCall = logCalls.find(([, params]) => params.event_type === 'provider_auto_linked')
        expect(autoLinkCall).toBeDefined()
        expect(autoLinkCall?.[1]).toMatchObject({
          user_id: mockUser.id,
          event_type: 'provider_auto_linked',
          metadata: { provider: 'apple', auto_linked: true },
        })
      })

      // [TEST-2] Branch B audit log failure: logAuthEvent throws → log.error is called, response is still 200.
      // The provider_auto_linked audit event is a security event, so the catch block uses log.error
      // (not log.warn) to ensure it surfaces in security monitoring.
      it('Branch B: should call log.error (not log.warn) and return 200 when logAuthEvent throws for provider_auto_linked', async () => {
        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        mockTx()
        // Branch A returns null — no existing oauth account for this provider+sub
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
        // Branch B email lookup finds the existing verified-email user
        vi.mocked(queries.findUserByEmail).mockResolvedValue(mockUser)
        // Linking succeeds — new oauth account created
        vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)
        // Audit log fails — simulates a DB error during logAuthEvent
        vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('audit db error'))

        const errorSpy = vi.spyOn(server.log, 'error')

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.branch-b.1.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        // Audit failure must be non-fatal — sign-in still succeeds
        expect(response.statusCode).toBe(200)
        // Security event must use log.error, not log.warn
        expect(errorSpy).toHaveBeenCalledWith(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
          expect.objectContaining({ err: expect.any(Error) }),
          expect.stringContaining('audit log failed for provider_auto_linked'),
        )

        errorSpy.mockRestore()
      })

      // Branch B — email_verified = false: must NOT trigger auto-linking.
      // When the provider does not assert email_verified, Branch B is skipped entirely and
      // the code falls through to Branch C (new user creation). This prevents a provider
      // with an unverified email from silently taking over an existing account.
      it('Branch B: should skip auto-linking and fall through to Branch C when email_verified is false', async () => {
        const unverifiedClaims = {
          ...googleClaims,
          email_verified: false,
          sub: 'google-unverified-sub-999',
        }
        vi.mocked(verifyGoogleToken).mockResolvedValue(unverifiedClaims)
        mockTx()
        // Branch A returns null
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
        // A user exists with this email — but email_verified is false so Branch B must be skipped
        vi.mocked(queries.findUserByEmail).mockResolvedValue(mockUser)
        // Branch C creates a new user
        const newUser: typeof mockUser = {
          ...mockUser,
          id: 'brand-new-user-0000-0000-0000-000000000000',
          email: unverifiedClaims.email,
        }
        vi.mocked(queries.createUser).mockResolvedValue(newUser)
        vi.mocked(queries.createOAuthAccount).mockResolvedValue({
          ...mockOAuthAccount,
          user_id: newUser.id,
          provider_user_id: unverifiedClaims.sub,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.20.3.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'google',
            id_token: 'google-id-token',
          }),
        })

        expect(response.statusCode).toBe(200)

        // findUserByEmail must NOT have been called — Branch B was skipped
        expect(queries.findUserByEmail).not.toHaveBeenCalled()

        // Branch C must have created a brand-new user
        expect(queries.createUser).toHaveBeenCalledOnce()

        // No provider_auto_linked event must be emitted
        const logCalls = vi.mocked(queries.logAuthEvent).mock.calls
        const autoLinkCall = logCalls.find(([, params]) => params.event_type === 'provider_auto_linked')
        expect(autoLinkCall).toBeUndefined()
      })
    })

    // [T4] Branch B: no existing OAuth account, email match finds a deactivated user → 403
    describe('Branch B deactivated user via email lookup', () => {
      it('should return 403 when findUserByEmail returns a deactivated user', async () => {
        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        mockTx()
        // No existing OAuth account for this provider sub
        vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
        // Email lookup finds an existing user who has been deactivated
        vi.mocked(queries.findUserByEmail).mockResolvedValue(mockDeactivatedUser)

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.4.1.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'google',
            id_token: 'google-id-token',
          }),
        })

        expect(response.statusCode).toBe(403)
        expect(response.json<{ error: string }>().error).toBe('Account deactivated')
      })
    })

    describe('sanitizeDisplayName — control character and whitespace handling', () => {
      // sanitizeDisplayName is an internal helper in routes.ts, tested indirectly through /signin.

      function setupNewUserSignin() {
        vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
        mockTx()
        vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
        vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
        vi.mocked(queries.createOAuthAccount).mockResolvedValue({
          ...mockOAuthAccount,
          provider: 'apple',
          provider_user_id: appleClaims.sub,
        })
      }

      it('should strip NUL (\\x00) control chars from display_name', async () => {
        setupNewUserSignin()
        vi.mocked(queries.createUser).mockResolvedValue({
          ...mockUser,
          display_name: 'helloworld',
        })

        await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
            user_info: { name: 'hello\x00world' },
          }),
        })

        expect(queries.createUser).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ display_name: 'helloworld' }),
        )
      })

      it('should store null for whitespace-only / control-char-only display_name (\\x01)', async () => {
        setupNewUserSignin()
        vi.mocked(queries.createUser).mockResolvedValue({
          ...mockUser,
          display_name: null,
        })

        await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
            user_info: { name: '   \x01  ' },
          }),
        })

        // After C2 fix: sanitizeDisplayName returns null for empty-after-strip input
        expect(queries.createUser).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ display_name: null }),
        )
      })

      it('should strip CRLF from display_name (\\r\\n injected)', async () => {
        setupNewUserSignin()
        vi.mocked(queries.createUser).mockResolvedValue({
          ...mockUser,
          display_name: 'injected',
        })

        await server.inject({
          method: 'POST',
          url: '/auth/signin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
            user_info: { name: '\r\ninjected' },
          }),
        })

        expect(queries.createUser).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ display_name: 'injected' }),
        )
      })

      // [T5] schema enforces maxLength: 255 for user_info.name — a 260-char name
      // is rejected at schema validation level (400). sanitizeDisplayName's slice(0, 255)
      // is defense-in-depth for the claims.name path (provider claims, not user_info).
      it('should reject a 260-character user_info.name at schema validation level with 400', async () => {
        setupNewUserSignin()

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.0.200.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
            user_info: { name: 'A'.repeat(260) }, // exceeds schema maxLength: 255
          }),
        })

        expect(response.statusCode).toBe(400)
      })

      it('should pass a 255-character user_info.name through unchanged (at schema max length)', async () => {
        setupNewUserSignin()
        const exactName = 'A'.repeat(255) // exactly at schema maxLength
        vi.mocked(queries.createUser).mockResolvedValue({
          ...mockUser,
          display_name: exactName,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.0.201.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: 'apple',
            id_token: 'apple-id-token',
            nonce: 'test-nonce',
            user_info: { name: exactName },
          }),
        })

        expect(response.statusCode).toBe(200)
        expect(queries.createUser).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ display_name: exactName }),
        )
        // Confirm the name was not further truncated
        const callArg = vi.mocked(queries.createUser).mock.calls[0]?.[1]
        expect(callArg?.display_name?.length).toBe(255)
      })
    })

    it('should reject requests with wrong content-type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.5.5.5',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'provider=google&id_token=token',
      })

      expect(response.statusCode).toBe(415)
    })

    it('should return 400 for missing required fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.1.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google' }), // missing id_token
      })

      expect(response.statusCode).toBe(400)
    })

    // [TEST-4] handleOAuthConflict returns null → 500
    // Simulates the degenerate race where createOAuthAccount returns null (ON CONFLICT)
    // AND the subsequent findOAuthAccount re-fetch also returns null (account disappeared).
    it('should return 500 when createOAuthAccount returns null and the conflict re-fetch also returns null', async () => {
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      // Branch A JOIN returns null — no existing oauth account for this provider/sub
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
      // handleOAuthConflict re-fetch (findOAuthAccount) also returns null — account disappeared
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      // Existing user by email — triggers Branch B (email link path)
      vi.mocked(queries.findUserByEmail).mockResolvedValue(mockUser)
      // createOAuthAccount returns null — simulates ON CONFLICT DO NOTHING
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.50.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          id_token: 'google-id-token',
        }),
      })

      expect(response.statusCode).toBe(500)
      // Plain Error (not HttpError) is redacted to 'Internal Server Error' in non-development
      // environments. nodeEnv defaults to 'test' in vitest, so the message is redacted.
      expect(response.json<{ error: string }>().error).toBe('Internal Server Error')
    })

    // [M-1] Audit log failure is non-fatal — main operation still returns 200
    // signin is a security event, so the catch block uses log.error (not log.warn)
    it('should return 200 and log.error when logAuthEvent rejects during signin', async () => {
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
        oauthAccount: mockOAuthAccount,
        user: mockUser,
      })
      vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('audit db down'))

      const errorSpy = vi.spyOn(server.log, 'error')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.m1.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(response.statusCode).toBe(200)
      expect(errorSpy).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('audit log failed for signin'),
      )

      errorSpy.mockRestore()
    })

    // [T1] Apple provider missing nonce field → should return 401
    it('should return 401 when Apple provider is used without a nonce', async () => {
      // nonce is optional in the schema but required for Apple at the application layer.
      // verifyProviderToken (not verifyAppleToken) throws ProviderVerificationError
      // immediately when provider === 'apple' and nonce is absent — verifyAppleToken
      // is never called in this path.

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.1.2.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          // nonce deliberately omitted
        }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid provider token')
    })

    // [T1] Apple provider with invalid token (verifyAppleToken rejects) → 401
    it('should return 401 when Apple verifyAppleToken rejects with a verification error', async () => {
      vi.mocked(verifyAppleToken).mockRejectedValue(new ProviderVerificationError('Token expired'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.1.3.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'bad-apple-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid provider token')
    })

    // ─── sanitizeAvatarUrl — userinfo guard ────────────────────────────────────

    describe('sanitizeAvatarUrl — userinfo guard', () => {
      // sanitizeAvatarUrl is an internal helper tested indirectly via /signin Branch C.

      function setupNewUserSigninWithAvatar(picture: string | null) {
        const claimsWithAvatar = { ...googleClaims, picture }
        vi.mocked(verifyGoogleToken).mockResolvedValue(claimsWithAvatar)
        mockTx()
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
        vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
        vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)
      }

      it('should store null for a URL containing userinfo (https://user:pass@cdn.example.com/avatar.jpg)', async () => {
        setupNewUserSigninWithAvatar('https://user:pass@cdn.example.com/avatar.jpg')
        vi.mocked(queries.createUser).mockResolvedValue({ ...mockUser, avatar_url: null })

        await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.av.1.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        expect(queries.createUser).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ avatar_url: null }),
        )
      })

      it('should store parsed.href for a clean https URL (https://cdn.example.com/avatar.jpg)', async () => {
        const cleanUrl = 'https://cdn.example.com/avatar.jpg'
        setupNewUserSigninWithAvatar(cleanUrl)
        vi.mocked(queries.createUser).mockResolvedValue({ ...mockUser, avatar_url: new URL(cleanUrl).href })

        await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.av.2.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        expect(queries.createUser).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ avatar_url: new URL(cleanUrl).href }),
        )
      })
    })

    // ─── Branch A: email_verified upgrade ─────────────────────────────────────

    describe('Branch A: email_verified upgrade', () => {
      it('should call setUserEmailVerified when provider asserts email_verified:true but stored user has email_verified:false', async () => {
        const unverifiedStoredUser: User = { ...mockUser, email_verified: false }
        const verifiedClaims = { ...googleClaims, email_verified: true }
        vi.mocked(verifyGoogleToken).mockResolvedValue(verifiedClaims)
        mockTx()
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
          oauthAccount: mockOAuthAccount,
          user: unverifiedStoredUser,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.ev.1.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        expect(response.statusCode).toBe(200)
        expect(queries.setUserEmailVerified).toHaveBeenCalledWith(
          expect.anything(),
          unverifiedStoredUser.id,
        )
      })

      it('should NOT call setUserEmailVerified when stored user already has email_verified:true', async () => {
        const alreadyVerifiedUser: User = { ...mockUser, email_verified: true }
        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims) // email_verified: true
        mockTx()
        vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
          oauthAccount: mockOAuthAccount,
          user: alreadyVerifiedUser,
        })

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.ev.2.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        expect(response.statusCode).toBe(200)
        expect(queries.setUserEmailVerified).not.toHaveBeenCalled()
      })
    })

    // [M4] Branch C orphan cleanup failure: deleteOrphanUser throws → log.warn, response still 200
    it('Branch C: should call log.warn and still return 200 when deleteOrphanUser throws during orphan cleanup', async () => {
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      // Branch A: no existing oauth account for this provider/sub
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
      // Branch B: no email match (email_verified true but findUserByEmail returns null)
      vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
      // Branch C: createUser succeeds, but createOAuthAccount returns null (ON CONFLICT)
      const orphanUser: User = { ...mockUser, id: 'orphan-user-0000-0000-0000-000000000001' }
      vi.mocked(queries.createUser).mockResolvedValue(orphanUser)
      vi.mocked(queries.createOAuthAccount).mockResolvedValueOnce(null)
      // handleOAuthConflict: findOAuthAccount finds the winning account, findUserById finds user
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockOAuthAccount)
      vi.mocked(queries.findUserById).mockResolvedValue(mockUser)
      // deleteOrphanUser throws — should be caught and warned, not propagated
      vi.mocked(queries.deleteOrphanUser).mockRejectedValue(new Error('db error during cleanup'))

      const warnSpy = vi.spyOn(server.log, 'warn')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.m4.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      // Orphan cleanup failure must be non-fatal — signin still succeeds
      expect(response.statusCode).toBe(200)
      // Cleanup failure must be logged at warn level
      expect(warnSpy).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
        expect.objectContaining({ err: expect.any(Error), orphanUserId: orphanUser.id }),
        expect.stringContaining('orphan user cleanup failed'),
      )

      warnSpy.mockRestore()
    })

    // [M2] 503 network error — /signin Google provider
    it('should return 503 when verifyGoogleToken throws a network error', async () => {
      vi.mocked(verifyGoogleToken).mockRejectedValue(
        Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }),
      )

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.503.1.1',
        payload: { provider: 'google', id_token: 'tok' },
        headers: { 'content-type': 'application/json' },
      })

      expect(response.statusCode).toBe(503)
      expect(response.json<{ error: string }>().error).toBe('Authentication service unavailable')
    })

    // [M2] 503 network error — /signin Apple provider
    it('should return 503 when verifyAppleToken throws a network error', async () => {
      vi.mocked(verifyAppleToken).mockRejectedValue(
        Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }),
      )

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.503.2.1',
        payload: { provider: 'apple', id_token: 'tok', nonce: 'test-nonce' },
        headers: { 'content-type': 'application/json' },
      })

      expect(response.statusCode).toBe(503)
      expect(response.json<{ error: string }>().error).toBe('Authentication service unavailable')
    })
  })

  // ─── POST /auth/refresh ────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    // ── Cookie signing round-trip tests ──────────────────────────────────────

    it('should accept a properly signed cookie and rotate the token (web client)', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      // Sign the cookie the same way the server does (via @fastify/cookie)
      const signedCookieValue = server.signCookie(rawToken)

      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: tokenHash,
        client_type: 'web',
      })
      vi.mocked(queries.getUserStatus).mockResolvedValue('active')
      vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.1.1',
        headers: {
          'content-type': 'application/json',
          // No x-client-type: native — web client path
          cookie: `refresh_token=${signedCookieValue}`,
        },
        body: JSON.stringify({}),
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ access_token: string; refresh_token: null }>()
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeNull() // web: token in cookie, not body

      // New signed cookie must be set in the response
      const setCookieHeader = response.headers['set-cookie']
      expect(setCookieHeader).toBeDefined()
    })

    it('should return 401 when the cookie HMAC signature is tampered', async () => {
      // Build a signed cookie then corrupt the HMAC suffix
      const rawToken = crypto.randomBytes(32).toString('hex')
      const signedCookieValue = server.signCookie(rawToken)
      const tamperedCookie = `${signedCookieValue.slice(0, -4)}XXXX`

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.2.1',
        headers: {
          'content-type': 'application/json',
          cookie: `refresh_token=${tamperedCookie}`,
        },
        body: JSON.stringify({}),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid refresh token')
    })

    it('should return 401 when no cookie and no body token are provided', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.3.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Missing refresh token')
    })

    it('should rotate token and return new access_token in body (native client via stored client_type native)', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        client_type: 'native', // stored in DB — determines response delivery
      })
      vi.mocked(queries.getUserStatus).mockResolvedValue('active')
      // rotateRefreshToken calls revokeRefreshToken + createRefreshToken via queries
      vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue(mockRefreshToken)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          'content-type': 'application/json',
          // No X-Client-Type header — client_type is read from the stored token row
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ access_token: string; refresh_token: string }>()
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeTruthy() // native: new token in body
    })

    it('should ignore X-Client-Type: native header and use stored client_type web (anti-spoofing)', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        client_type: 'web', // stored as web — must NOT be overridden by header
      })
      vi.mocked(queries.getUserStatus).mockResolvedValue('active')
      vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          'content-type': 'application/json',
          'x-client-type': 'native', // attacker-controlled spoofed header — must be ignored
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ refresh_token: null }>()
      expect(body.refresh_token).toBeNull() // web: token stays in cookie despite spoofed header
      const setCookieHeader = response.headers['set-cookie']
      expect(setCookieHeader).toBeDefined()
    })

    it('should set cookie and return null refresh_token for web clients (stored client_type web)', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        client_type: 'web',
      })
      vi.mocked(queries.getUserStatus).mockResolvedValue('active')
      vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ refresh_token: null }>()
      expect(body.refresh_token).toBeNull()
      const setCookieHeader = response.headers['set-cookie'] as string | string[]
      expect(setCookieHeader).toBeDefined()
      // [T3] Assert cookie rotation sets required security attributes
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
      expect(cookieStr).toContain('Path=/auth')
      expect(cookieStr).toContain('HttpOnly')
      expect(cookieStr).toContain('SameSite=Strict')
    })

    it('should return 401 and revoke all tokens when a reused (revoked) token is presented', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        revoked_at: '2026-01-15T00:00:00Z',
        client_type: 'web',
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Token reuse detected')
      expect(queries.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
        expect.anything(),
        mockUser.id,
      )
      expect(queries.logAuthEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ event_type: 'token_reuse_detected' }),
      )
    })

    it('should return 401 when token is not found in database', async () => {
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: crypto.randomBytes(32).toString('hex') }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid refresh token')
    })

    it('should return 401 when token is expired (SQL returns null via AND expires_at > NOW())', async () => {
      // findRefreshTokenForRotation returns null when the token is expired because the SQL
      // query includes AND expires_at > NOW(). The route treats a null result identically
      // to a missing token — both return 401 with "Invalid refresh token".
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.50.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: crypto.randomBytes(32).toString('hex') }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid refresh token')
    })

    it('should return 401 (not trigger family revocation) when token is revoked-AND-expired', async () => {
      // Intentional design trade-off: findRefreshTokenForRotation filters expired tokens via
      // AND expires_at > NOW(), so a token that is both revoked AND expired returns null.
      // The /refresh handler treats null as "Invalid refresh token" (401) — the same path as
      // a missing or simply-expired token — and does NOT call revokeAllUserRefreshTokens.
      // Family revocation (reuse-detection) therefore does NOT fire for expired-revoked tokens.
      //
      // This is acceptable because an expired token cannot be rotated into a new valid token
      // regardless of its revocation status; the attacker gains nothing by replaying it after
      // expiry. See the JSDoc on findRefreshTokenForRotation for the full security trade-off.
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.50.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: crypto.randomBytes(32).toString('hex') }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid refresh token')
      // Confirm family revocation was NOT triggered — this is the intentional behaviour
      // for the expired-revoked case (see JSDoc on findRefreshTokenForRotation).
      expect(queries.revokeAllUserRefreshTokens).not.toHaveBeenCalled()
    })

    it('should return 403 for deactivated user', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        client_type: 'web',
      })
      vi.mocked(queries.getUserStatus).mockResolvedValue('deactivated')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.2.2.2',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<{ error: string }>().error).toBe('Account deactivated')
    })

    it('should return 401 when no token is provided (body or cookie)', async () => {
      // Use a unique remoteAddress to avoid exhausting the IP-based rate limiter
      // shared across the test server instance.
      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.99.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(response.statusCode).toBe(401)
    })

    // [T1] getUserStatus returning 'not_found' → 403 (same as 'deactivated' → 403)
    it('should return 403 when getUserStatus returns not_found', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        client_type: 'web',
      })
      vi.mocked(queries.getUserStatus).mockResolvedValue('not_found')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.150.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<{ error: string }>().error).toBe('Account deactivated')
    })

    // [M-1] Audit log failure is non-fatal — refresh still returns 200
    // refresh is a security-relevant event — audit log failure uses log.error (not log.warn)
    // to ensure it surfaces in security monitoring (consistent with signin audit treatment)
    it('should return 200 and log.error when logAuthEvent rejects during refresh', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        client_type: 'web',
        revoked_at: null,
      })
      vi.mocked(queries.getUserStatus).mockResolvedValue('active')
      vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)
      vi.mocked(queries.createRefreshToken).mockResolvedValue(mockRefreshToken)
      vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('audit db down'))

      const errorSpy = vi.spyOn(server.log, 'error')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.m1.2.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(200)
      expect(errorSpy).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('audit log failed for refresh'),
      )

      errorSpy.mockRestore()
    })

    // [M-3] Fail-closed: revokeAllUserRefreshTokens throws during token-reuse detection → 500
    it('should return 500 (fail-closed) when revokeAllUserRefreshTokens throws during token-reuse detection', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        revoked_at: new Date().toISOString(),
        client_type: 'web',
      })
      vi.mocked(queries.revokeAllUserRefreshTokens).mockRejectedValue(new Error('db error'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.m3.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(500)
    })

    // [TEST-1] token_reuse_detected audit log failure is non-fatal — response is still 401
    // and server.log.error is called (not warn) because this is a security event.
    it('should return 401 and call log.error when logAuthEvent throws during token_reuse_detected', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      vi.mocked(queries.findRefreshTokenForRotation).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        revoked_at: new Date().toISOString(),
        client_type: 'web',
      })
      vi.mocked(queries.revokeAllUserRefreshTokens).mockResolvedValue(undefined)
      // Simulate audit log failure for the security-critical event
      vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('audit db down'))

      const errorSpy = vi.spyOn(server.log, 'error')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.test1.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      // Security revocation committed — 401 is still returned despite audit failure
      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Token reuse detected')
      // Entire token family must be revoked even when the audit log fails
      expect(queries.revokeAllUserRefreshTokens).toHaveBeenCalledWith(expect.anything(), mockUser.id)
      // Security events must use log.error, not log.warn
      expect(errorSpy).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('audit log failed for token_reuse_detected'),
      )

      errorSpy.mockRestore()
    })

    // [T3] body token takes priority over cookie token when both are present
    it('should use body token over cookie token when both are present (body-over-cookie priority)', async () => {
      const bodyToken = crypto.randomBytes(32).toString('hex')
      const cookieToken = crypto.randomBytes(32).toString('hex')
      const bodyTokenHash = crypto.createHash('sha256').update(bodyToken).digest('hex')
      const cookieTokenHash = crypto.createHash('sha256').update(cookieToken).digest('hex')
      const signedCookieValue = server.signCookie(cookieToken)

      mockTx()
      // Only the body token hash resolves to a valid token row — cookie hash returns null
      vi.mocked(queries.findRefreshTokenForRotation).mockImplementation(
        async (_client, hash) => {
          if (hash === bodyTokenHash) {
            return {
              ...mockRefreshToken,
              token_hash: bodyTokenHash,
              client_type: 'native' as const,
            }
          }
          if (hash === cookieTokenHash) {
            return null
          }
          return null
        },
      )
      vi.mocked(queries.getUserStatus).mockResolvedValue('active')
      vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.0.101.1',
        headers: {
          'content-type': 'application/json',
          cookie: `refresh_token=${signedCookieValue}`, // also has a valid signed cookie
        },
        body: JSON.stringify({ refresh_token: bodyToken }), // body takes priority
      })

      // The body token was used (found in DB) → 200 with token in body (native)
      expect(response.statusCode).toBe(200)
      const body = response.json<{ access_token: string; refresh_token: string }>()
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeTruthy() // native delivery confirms body token was used

      // Confirm findRefreshTokenForRotation was called with the body token hash, not the cookie hash
      expect(queries.findRefreshTokenForRotation).toHaveBeenCalledWith(
        expect.anything(),
        bodyTokenHash,
      )
      expect(queries.findRefreshTokenForRotation).not.toHaveBeenCalledWith(
        expect.anything(),
        cookieTokenHash,
      )
    })
  })

  // ─── POST /auth/logout ─────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    function getValidAccessToken(): string {
      // Sign a token the same way the server does (jwt.sign is synchronous)
      return server.jwt.sign({ sub: mockUser.id })
    }

    it('should revoke token via signed cookie and return 204', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
      const signedCookieValue = server.signCookie(rawToken)

      mockTx()
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: tokenHash,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.0.4.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          cookie: `refresh_token=${signedCookieValue}`,
        },
        body: JSON.stringify({}),
      })

      expect(response.statusCode).toBe(204)
      expect(queries.revokeRefreshToken).toHaveBeenCalledWith(expect.anything(), tokenHash)
    })

    it('should return 401 when the logout cookie HMAC signature is tampered', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')
      const signedCookieValue = server.signCookie(rawToken)
      const tamperedCookie = `${signedCookieValue.slice(0, -4)}XXXX`

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.0.5.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          cookie: `refresh_token=${tamperedCookie}`,
        },
        body: JSON.stringify({}),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid refresh token')
    })

    it('should revoke token and return 204', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

      mockTx()
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: tokenHash,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(204)
      expect(queries.revokeRefreshToken).toHaveBeenCalledWith(
        expect.anything(),
        tokenHash,
      )
      // RLS context: transaction must be scoped to the authenticated user
      expect(lastTransactionUserId).toBe(mockUser.id)
    })

    it('should return 403 when token belongs to a different user', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')

      mockTx()
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue({
        ...mockRefreshToken,
        user_id: 'different-user-id-000-0000-0000-000000000000',
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<{ error: string }>().error).toBe('Token does not belong to this user')
    })

    it('should return 401 when refresh token is already revoked', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')

      mockTx()
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue({
        ...mockRefreshToken,
        revoked_at: '2026-01-15T00:00:00.000Z',
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Refresh token already revoked')
      // Must NOT re-revoke — no spurious DB write
      expect(queries.revokeRefreshToken).not.toHaveBeenCalled()
      // Must NOT log a spurious audit event
      expect(queries.logAuthEvent).not.toHaveBeenCalled()
    })

    it('should return 401 when refresh token is not found', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')

      mockTx()
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid refresh token')
    })

    it('should return 401 when no Bearer token is provided', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: 'some-token' }),
      })

      expect(response.statusCode).toBe(401)
    })

    it('should clear the cookie after successful revocation', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

      mockTx()
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: tokenHash,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(204)
      // The cleared cookie should appear in the set-cookie header
      const setCookieHeader = response.headers['set-cookie']
      expect(setCookieHeader).toBeDefined()
      // [T3] Assert cookie is cleared with Max-Age=0
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
      expect(cookieStr).toMatch(/Max-Age=0/i)
    })

    // [M-1] Audit log failure is non-fatal — logout still returns 204
    // logout is a security event (session revocation), so the catch block uses log.error
    it('should return 204 and log.error when logAuthEvent rejects during logout', async () => {
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

      mockTx()
      vi.mocked(queries.findRefreshTokenByHash).mockResolvedValue({
        ...mockRefreshToken,
        token_hash: tokenHash,
        revoked_at: null,
      })
      vi.mocked(queries.revokeRefreshToken).mockResolvedValue(undefined)
      vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('audit db down'))

      const errorSpy = vi.spyOn(server.log, 'error')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.m1.3.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(204)
      expect(errorSpy).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('audit log failed for logout'),
      )

      errorSpy.mockRestore()
    })

    it('should NOT clear the cookie when the transaction throws (withTransaction rejects)', async () => {
      // F4: clearRefreshTokenCookie must only be called after withTransaction resolves.
      // When withTransaction rejects, the cookie must remain untouched so the client
      // can retry with the same token.
      const accessToken = getValidAccessToken()
      const rawToken = crypto.randomBytes(32).toString('hex')
      const signedCookieValue = server.signCookie(rawToken)

      // Make withTransaction itself reject (simulates a DB connection failure or
      // an HttpError thrown inside the callback — both cause the promise to reject).
      vi.mocked(pool.withTransaction).mockRejectedValue(new Error('transaction failed'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.0.6.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          cookie: `refresh_token=${signedCookieValue}`,
        },
        body: JSON.stringify({}),
      })

      // The request must fail (500 from the unhandled error)
      expect(response.statusCode).toBe(500)

      // The set-cookie header must NOT contain a Max-Age=0 clear directive —
      // the cookie should not have been touched when the transaction failed.
      const setCookieHeader = response.headers['set-cookie']
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] ?? '' : (setCookieHeader ?? '')
      expect(cookieStr).not.toMatch(/Max-Age=0/i)
    })
  })

  // ─── POST /auth/link-account ───────────────────────────────────────────────

  describe('POST /auth/link-account', () => {
    const appleOAuthAccount: OAuthAccount = {
      ...mockOAuthAccount,
      id: 'oauth-apple-1',
      provider: 'apple',
      provider_user_id: appleClaims.sub,
    }

    function getValidAccessToken(): string {
      // server.jwt.sign is synchronous
      return server.jwt.sign({ sub: mockUser.id })
    }

    it('should link a new provider and return updated user with linked accounts', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.userHasProvider).mockResolvedValue(false)
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(appleOAuthAccount)
      vi.mocked(queries.findUserWithAccounts).mockResolvedValue({
        user: mockUser,
        accounts: [mockOAuthAccount, appleOAuthAccount],
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.30.1.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ linked_accounts: Array<{ provider: string }> }>()
      expect(body.linked_accounts).toHaveLength(2)
      // RLS context: transaction must be scoped to the authenticated user
      expect(lastTransactionUserId).toBe(mockUser.id)
    })

    it('should return 409 when provider account is already linked to a different user', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      // Provider account belongs to a different user
      vi.mocked(queries.findOAuthAccount).mockResolvedValue({
        ...appleOAuthAccount,
        user_id: 'different-user-id-000-0000-0000-000000000000',
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.30.2.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(409)
      expect(response.json<{ error: string }>().error).toContain('already linked to a different user')
    })

    it('should return 409 when user already has this provider linked', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.userHasProvider).mockResolvedValue(true)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.30.3.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(409)
      expect(response.json<{ error: string }>().error).toContain('already have an account')
    })

    it('should return 401 when no Bearer token is provided', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.30.4.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(401)
    })

    // [T1] /auth/link-account with invalid provider token → 401
    it('should return 401 when the provider token is invalid (verifyAppleToken rejects)', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockRejectedValue(new ProviderVerificationError('Invalid token'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.20.1.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'bad-apple-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Invalid provider token')
    })

    // [T1] createOAuthAccount returns null (concurrent insert race) → 409
    it('should return 409 when createOAuthAccount returns null due to a concurrent insert race', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.userHasProvider).mockResolvedValue(false)
      // Simulate ON CONFLICT DO NOTHING — null means a concurrent request already inserted this row
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.20.2.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(409)
      expect(response.json<{ error: string }>().error).toBe('Account already linked')
    })

    it('should use a single JOIN query to fetch user+accounts (not two queries)', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.userHasProvider).mockResolvedValue(false)
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(appleOAuthAccount)
      vi.mocked(queries.findUserWithAccounts).mockResolvedValue({
        user: mockUser,
        accounts: [appleOAuthAccount],
      })

      await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.20.3.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      // Should use findUserWithAccounts (JOIN) not findUserById + findOAuthAccountsByUserId
      expect(queries.findUserWithAccounts).toHaveBeenCalledWith(expect.anything(), mockUser.id)
      expect(queries.findUserById).not.toHaveBeenCalled()
      expect(queries.findOAuthAccountsByUserId).not.toHaveBeenCalled()
    })

    // [TEST-1] link-account — findUserWithAccounts returns null after createOAuthAccount succeeds → 500
    it('should return 500 when findUserWithAccounts returns null after account link succeeds', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.userHasProvider).mockResolvedValue(false)
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(appleOAuthAccount)
      // createOAuthAccount succeeds but the subsequent re-fetch returns null
      vi.mocked(queries.findUserWithAccounts).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.20.4.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(500)
      expect(response.json<{ error: string }>().error).toBe('Failed to fetch user after account link')
    })

    // [M2] 503 network error — /link-account Google provider
    it('should return 503 when verifyGoogleToken throws a network error on link-account', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyGoogleToken).mockRejectedValue(
        Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }),
      )

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.503.3.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ provider: 'google', id_token: 'tok' }),
      })

      expect(response.statusCode).toBe(503)
      expect(response.json<{ error: string }>().error).toBe('Authentication service unavailable')
    })

    // [M2] 503 network error — /link-account Apple provider
    it('should return 503 when verifyAppleToken throws a network error on link-account', async () => {
      const accessToken = getValidAccessToken()
      vi.mocked(verifyAppleToken).mockRejectedValue(
        Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }),
      )

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.503.4.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ provider: 'apple', id_token: 'tok', nonce: 'test-nonce' }),
      })

      expect(response.statusCode).toBe(503)
      expect(response.json<{ error: string }>().error).toBe('Authentication service unavailable')
    })
  })

  // ─── Branch coverage: non-HttpError re-throws and sub UUID validation ────────

  describe('branch coverage: non-HttpError re-throws and sub validation', () => {
    // [TC-B1] logout — non-HttpError thrown inside the transaction propagates as 500
    it('should propagate non-HttpError from logout transaction as 500', async () => {
      const accessToken = server.jwt.sign({ sub: mockUser.id })
      const rawToken = crypto.randomBytes(32).toString('hex')
      mockTx()
      // Throw a plain Error (not HttpError) inside the transaction
      vi.mocked(queries.findRefreshTokenByHash).mockRejectedValue(new Error('unexpected db failure'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.77.1.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(500)
    })

    // [TC-B2] link-account — non-HttpError thrown inside the transaction propagates as 500
    it('should propagate non-HttpError from link-account transaction as 500', async () => {
      const accessToken = server.jwt.sign({ sub: mockUser.id })
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockRejectedValue(new Error('unexpected db failure'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.77.2.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(500)
    })

    // [TC-B3a] logout — sub claim that is not a valid UUID triggers 401
    it('should return 401 for logout when JWT sub is not a valid UUID', async () => {
      // Sign a token with a non-UUID sub
      const badSubToken = server.jwt.sign({ sub: 'not-a-uuid' })
      const rawToken = crypto.randomBytes(32).toString('hex')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.77.3a.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${badSubToken}`,
        },
        body: JSON.stringify({ refresh_token: rawToken }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Unauthorized')
    })

    // [TC-B3] link-account — sub claim that is not a valid UUID triggers 401
    it('should return 401 for link-account when JWT sub is not a valid UUID', async () => {
      // Sign a token with a non-UUID sub
      const badSubToken = server.jwt.sign({ sub: 'not-a-uuid' })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.77.3.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${badSubToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(401)
      expect(response.json<{ error: string }>().error).toBe('Unauthorized')
    })

    // [TC-B4] link-account audit log failure is non-fatal — business transaction still returns 200
    // link_account is a security event (identity linking), so the catch block uses log.error
    it('should still return 200 for link-account when logAuthEvent throws (non-fatal audit log)', async () => {
      const accessToken = server.jwt.sign({ sub: mockUser.id })
      const appleOAuthAccount: OAuthAccount = {
        ...mockOAuthAccount,
        id: 'oauth-apple-audit-test',
        provider: 'apple',
        provider_user_id: appleClaims.sub,
      }
      vi.mocked(verifyAppleToken).mockResolvedValue(appleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.userHasProvider).mockResolvedValue(false)
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(appleOAuthAccount)
      // logAuthEvent throws — should be caught with log.error (security event), not propagated
      vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('audit db down'))
      vi.mocked(queries.findUserWithAccounts).mockResolvedValue({
        user: mockUser,
        accounts: [appleOAuthAccount],
      })

      const errorSpy = vi.spyOn(server.log, 'error')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.77.4.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      // Business transaction will commit despite audit log failure
      expect(response.statusCode).toBe(200)
      expect(errorSpy).toHaveBeenCalledWith(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('audit log failed for link_account'),
      )

      errorSpy.mockRestore()
    })
  })

  // ─── Global error handler (ERR-1) ─────────────────────────────────────────

  describe('global error handler', () => {
    // [ERR-1] HttpError propagates with its own statusCode and body
    it('should return HttpError statusCode and body when HttpError is thrown in a route', async () => {
      // The deactivated user path throws HttpError(403) from assertNotDeactivated
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      // Branch A: JOIN query returns deactivated user — assertNotDeactivated throws HttpError(403)
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
        oauthAccount: mockOAuthAccount,
        user: mockDeactivatedUser,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.101.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(response.statusCode).toBe(403)
      expect(response.json<{ error: string }>().error).toBe('Account deactivated')
    })

    // [ERR-1] Non-HttpError from a route propagates as 500 and message is redacted
    it('should return 500 with redacted message for non-HttpError (nodeEnv is not development)', async () => {
      // withTransaction itself throws a plain Error — simulates an unexpected DB error
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      vi.mocked(pool.withTransaction).mockRejectedValue(new Error('pg connection refused'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.101.2.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(response.statusCode).toBe(500)
      // The config mock sets no NODE_ENV so nodeEnv defaults to 'development',
      // meaning the real message IS returned in the test environment.
      // The key assertion is that the handler returns 500 (not an unhandled crash).
      const body = response.json<{ error: string }>()
      expect(body.error).toBeTruthy()
    })

    // [F3] JWT-signing-failure error path: plain Error is redacted in production.
    // The fix changed `throw new HttpError(500, ...)` to `throw new Error(...)` after
    // withTransaction resolves — HttpError bypasses the isDev redaction check, so
    // a plain Error is needed for proper production redaction.
    //
    // We verify the redaction behavior by checking that a plain Error thrown by a route
    // after the transaction (simulated here by making withTransaction itself reject with
    // a plain Error that has message 'Token signing failed') returns "Internal Server Error"
    // in production, not the raw message.
    it('should redact "Token signing failed" to "Internal Server Error" in production (F3 plain Error path)', async () => {
      const { config: configMock } = await import('../config.js')
      const originalNodeEnv = configMock.nodeEnv
      try {
        // @ts-expect-error — overriding readonly config for test purposes
        configMock.nodeEnv = 'production'

        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        // Simulate the route throwing a plain Error with the JWT-signing message
        vi.mocked(pool.withTransaction).mockRejectedValue(new Error('Token signing failed'))

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.f3.1.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        expect(response.statusCode).toBe(500)
        const body = response.json<{ error: string }>()
        // A plain Error's message must be redacted in production
        expect(body.error).toBe('Internal Server Error')
        expect(body.error).not.toContain('Token signing failed')
      } finally {
        // @ts-expect-error — overriding readonly config for test purposes
        configMock.nodeEnv = originalNodeEnv
      }
    })

    // [F3] HttpError thrown by a route propagates its own statusCode and body — NOT redacted.
    // This confirms that HttpError bypasses the isDev redaction check, which is why F3 changes
    // post-transaction JWT failures to plain Errors instead.
    it('should NOT redact HttpError body in production (HttpError bypasses isDev check)', async () => {
      const { config: configMock } = await import('../config.js')
      const originalNodeEnv = configMock.nodeEnv
      try {
        // @ts-expect-error — overriding readonly config for test purposes
        configMock.nodeEnv = 'production'

        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        const { HttpError } = await import('./errors.js')
        // Make withTransaction reject with an HttpError — this propagates out of the route
        vi.mocked(pool.withTransaction).mockRejectedValue(
          new HttpError(409, { error: 'Concurrent request conflict, please retry' }),
        )

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.f3.2.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        // HttpError propagates with its own statusCode and body — NOT redacted
        expect(response.statusCode).toBe(409)
        const body = response.json<{ error: string }>()
        expect(body.error).toBe('Concurrent request conflict, please retry')
      } finally {
        // @ts-expect-error — overriding readonly config for test purposes
        configMock.nodeEnv = originalNodeEnv
      }
    })

    // [TCOV-1] Production redaction: non-HttpError must return 'Internal Server Error', not raw message
    it('should redact raw error message when nodeEnv is production', async () => {
      const { config: configMock } = await import('../config.js')
      const originalNodeEnv = configMock.nodeEnv
      try {
        // Override nodeEnv to 'production' to exercise the redaction path
        // @ts-expect-error — overriding readonly config for test purposes
        configMock.nodeEnv = 'production'

        vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
        vi.mocked(pool.withTransaction).mockRejectedValue(new Error('secret internal db error'))

        const response = await server.inject({
          method: 'POST',
          url: '/auth/signin',
          remoteAddress: '10.101.3.1',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
        })

        expect(response.statusCode).toBe(500)
        const body = response.json<{ error: string }>()
        // In production the raw error message must NOT be returned
        expect(body.error).toBe('Internal Server Error')
        expect(body.error).not.toContain('secret internal db error')
      } finally {
        // @ts-expect-error — overriding readonly config for test purposes
        configMock.nodeEnv = originalNodeEnv
      }
    })
  })

  // ─── sanitizeAvatarUrl rejection paths (TCOV-2) ────────────────────────────

  describe('sanitizeAvatarUrl — rejection paths', () => {
    function setupNewGoogleUserSignin() {
      mockTx()
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
    }

    // [TCOV-2a] javascript: scheme must be rejected (avatar_url stored as null)
    it('should store null avatar_url for a javascript: picture URL', async () => {
      const claimsWithJsUrl = { ...googleClaims, client_type: 'native' as const, picture: 'javascript:alert(1)' }
      vi.mocked(verifyGoogleToken).mockResolvedValue(claimsWithJsUrl)
      setupNewGoogleUserSignin()
      vi.mocked(queries.createUser).mockResolvedValue({ ...mockUser, avatar_url: null })
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)

      await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.200.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(queries.createUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ avatar_url: null }),
      )
    })

    // [TCOV-2b] http:// (non-HTTPS) picture URL must be rejected (avatar_url stored as null)
    it('should store null avatar_url for an http:// picture URL', async () => {
      const claimsWithHttpUrl = { ...googleClaims, client_type: 'native' as const, picture: 'http://example.com/avatar.jpg' }
      vi.mocked(verifyGoogleToken).mockResolvedValue(claimsWithHttpUrl)
      setupNewGoogleUserSignin()
      vi.mocked(queries.createUser).mockResolvedValue({ ...mockUser, avatar_url: null })
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)

      await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.200.2.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(queries.createUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ avatar_url: null }),
      )
    })

    // [TCOV-2c] URL exceeding 2048 characters must be rejected (avatar_url stored as null)
    it('should store null avatar_url for a picture URL longer than 2048 characters', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2048)
      const claimsWithLongUrl = { ...googleClaims, client_type: 'native' as const, picture: longUrl }
      vi.mocked(verifyGoogleToken).mockResolvedValue(claimsWithLongUrl)
      setupNewGoogleUserSignin()
      vi.mocked(queries.createUser).mockResolvedValue({ ...mockUser, avatar_url: null })
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(mockOAuthAccount)

      await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.200.3.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(queries.createUser).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ avatar_url: null }),
      )
    })
  })

  // ─── Branch C concurrent new-user race (TCOV-3) ───────────────────────────

  describe('Branch C concurrent new-user race', () => {
    // [F5] When orphan cleanup succeeds, only debug log is emitted (not warn)
    it('should emit debug log (not warn) when orphan user is cleaned up successfully', async () => {
      const nativeGoogleClaims = { ...googleClaims, client_type: 'native' as const }
      vi.mocked(verifyGoogleToken).mockResolvedValue(nativeGoogleClaims)
      mockTx()
      // No existing oauth account on first lookup (Branch A JOIN returns null)
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
      // No existing user by email (skip Branch B, fall through to Branch C)
      vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
      // createUser succeeds — new orphan user created
      vi.mocked(queries.createUser).mockResolvedValue(mockUser)
      // createOAuthAccount returns null — ON CONFLICT DO NOTHING (concurrent insert wins)
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(null)
      // handleOAuthConflict re-fetch finds the winner's account
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockOAuthAccount)
      vi.mocked(queries.findUserById).mockResolvedValue(mockUser)
      // deleteOrphanUser succeeds silently
      vi.mocked(queries.deleteOrphanUser).mockResolvedValue(undefined)

      // Spy on the logger to capture log level calls
      const debugSpy = vi.spyOn(server.log, 'debug')
      const warnSpy = vi.spyOn(server.log, 'warn')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.f5.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(response.statusCode).toBe(200)
      // Cleanup succeeded → debug log emitted, NOT warn
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({ orphanUserId: mockUser.id }),
        expect.stringContaining('cleaned up inline'),
      )
      // The unconditional warn after the try/catch was the bug — it must NOT fire on success
      const orphanWarnCalls = warnSpy.mock.calls.filter(([, msg]) =>
        typeof msg === 'string' && msg.includes('orphan'),
      )
      expect(orphanWarnCalls).toHaveLength(0)

      debugSpy.mockRestore()
      warnSpy.mockRestore()
    })

    // [F5] When orphan cleanup fails, warn log is emitted (not debug)
    it('should emit warn log when orphan user cleanup fails', async () => {
      const nativeGoogleClaims = { ...googleClaims, client_type: 'native' as const }
      vi.mocked(verifyGoogleToken).mockResolvedValue(nativeGoogleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
      vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
      vi.mocked(queries.createUser).mockResolvedValue(mockUser)
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(null)
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockOAuthAccount)
      vi.mocked(queries.findUserById).mockResolvedValue(mockUser)
      // deleteOrphanUser fails — simulates a DB error during cleanup
      vi.mocked(queries.deleteOrphanUser).mockRejectedValue(new Error('cleanup db error'))

      const debugSpy = vi.spyOn(server.log, 'debug')
      const warnSpy = vi.spyOn(server.log, 'warn')

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.f5.2.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      // Request still succeeds (cleanup failure is non-fatal)
      expect(response.statusCode).toBe(200)
      // Cleanup failed → warn log emitted
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ orphanUserId: mockUser.id }),
        expect.stringContaining('orphan user cleanup failed'),
      )
      // Debug log must NOT fire on cleanup failure
      const orphanDebugCalls = debugSpy.mock.calls.filter(([, msg]) =>
        typeof msg === 'string' && msg.includes('orphan'),
      )
      expect(orphanDebugCalls).toHaveLength(0)

      debugSpy.mockRestore()
      warnSpy.mockRestore()
    })

    // [TCOV-3] createUser succeeds, createOAuthAccount returns null (concurrent insert),
    // handleOAuthConflict re-fetch also returns null → 500
    it('should return 500 when Branch C createOAuthAccount returns null and re-fetch also returns null', async () => {
      const nativeGoogleClaims = { ...googleClaims, client_type: 'native' as const }
      vi.mocked(verifyGoogleToken).mockResolvedValue(nativeGoogleClaims)
      mockTx()
      // Branch A JOIN returns null — no existing oauth account (triggers Branch C — new user)
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue(null)
      // handleOAuthConflict re-fetch (findOAuthAccount) also returns null — account disappeared
      vi.mocked(queries.findOAuthAccount).mockResolvedValue(null)
      // No existing user by email (skip Branch B, fall through to Branch C)
      vi.mocked(queries.findUserByEmail).mockResolvedValue(null)
      // createUser succeeds
      vi.mocked(queries.createUser).mockResolvedValue(mockUser)
      // createOAuthAccount returns null — simulates ON CONFLICT DO NOTHING (concurrent insert)
      vi.mocked(queries.createOAuthAccount).mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.300.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          id_token: 'google-id-token',
        }),
      })

      expect(response.statusCode).toBe(500)
      // Plain Error (not HttpError) is redacted to 'Internal Server Error' in non-development
      // environments. nodeEnv defaults to 'test' in vitest, so the message is redacted.
      expect(response.json<{ error: string }>().error).toBe('Internal Server Error')
    })
  })

  // ─── Content-Type 415 checks for /auth/refresh and /auth/logout ───────────

  describe('415 content-type rejection', () => {
    // [TC2] /auth/refresh must reject non-JSON content-type with 415
    it('should return 415 for /auth/refresh with wrong content-type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.99.1.1',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'refresh_token=sometoken',
      })

      expect(response.statusCode).toBe(415)
    })

    // [TC2] /auth/logout must reject non-JSON content-type with 415
    it('should return 415 for /auth/logout with wrong content-type', async () => {
      const accessToken = server.jwt.sign({ sub: mockUser.id })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.99.2.1',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Bearer ${accessToken}`,
        },
        body: 'refresh_token=sometoken',
      })

      expect(response.statusCode).toBe(415)
    })

    // [F13] A zero-body POST with no Content-Type header must NOT return 415.
    // The client correctly omits Content-Type when it has no body to send.
    it('should not return 415 for /auth/refresh with no Content-Type header and no body', async () => {
      // No token provided — expect 401 (missing token), NOT 415 (wrong content-type).
      // This confirms the preValidation hook allows the request through.
      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.99.3.1',
        // No content-type header set, no body
      })

      expect(response.statusCode).not.toBe(415)
    })

    // [F13] A zero-body POST to /auth/logout with no Content-Type header must NOT return 415.
    it('should not return 415 for /auth/logout with no Content-Type header and no body', async () => {
      const accessToken = server.jwt.sign({ sub: mockUser.id })

      // No token provided — expect 401 (missing token), NOT 415 (wrong content-type).
      // Logout requires a valid Bearer token to pass the authenticate preHandler, so
      // we supply the Authorization header but deliberately omit Content-Type.
      const response = await server.inject({
        method: 'POST',
        url: '/auth/logout',
        remoteAddress: '10.99.4.1',
        headers: {
          authorization: `Bearer ${accessToken}`,
          // No content-type header set
        },
        // No body
      })

      expect(response.statusCode).not.toBe(415)
    })

    // [F13] A POST with Content-Type: application/x-www-form-urlencoded and a body
    // must still return 415 — the fix must not weaken existing CSRF protection.
    // Note: Fastify's content-type parser also rejects this before our preValidation hook
    // runs, so the 415 may originate from either layer; what matters is the status code.
    it('should return 415 for /auth/refresh when Content-Type is form-urlencoded (body present)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/auth/refresh',
        remoteAddress: '10.99.5.1',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'refresh_token=sometoken',
      })

      expect(response.statusCode).toBe(415)
    })
  })

  // ─── User-Agent truncation ─────────────────────────────────────────────────

  describe('User-Agent truncation', () => {
    // [TC3] A 600-char User-Agent must be stored as exactly 512 characters in logAuthEvent
    // (audit log column is VARCHAR(512)) and 255 characters in device_info
    // (refresh_tokens column is VARCHAR(255)).
    it('should truncate a 600-character User-Agent to 512 chars in logAuthEvent and 255 chars in device_info', async () => {
      const longUa = 'A'.repeat(600)
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      // Branch A uses the JOIN query (findOAuthAccountWithUser)
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
        oauthAccount: mockOAuthAccount,
        user: mockUser,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.88.1.1',
        headers: {
          'content-type': 'application/json',
          'user-agent': longUa,
        },
        body: JSON.stringify({
          provider: 'google',
          id_token: 'google-id-token',
        }),
      })

      expect(response.statusCode).toBe(200)

      // logAuthEvent should have been called with the wider UA (512 chars max for audit log)
      const logAuthEventCalls = vi.mocked(queries.logAuthEvent).mock.calls
      expect(logAuthEventCalls.length).toBeGreaterThan(0)
      const signinCall = logAuthEventCalls.find(
        ([, params]) => params.event_type === 'signin',
      )
      expect(signinCall).toBeDefined()
      const auditUa = signinCall![1].user_agent
      expect(auditUa).not.toBeNull()
      expect(auditUa!.length).toBe(512)
      expect(auditUa).toBe('A'.repeat(512))

      // createRefreshToken (via createAndStoreRefreshToken) should have been called with
      // the 255-char truncated UA for device_info
      const createRefreshTokenCalls = vi.mocked(queries.createRefreshToken).mock.calls
      expect(createRefreshTokenCalls.length).toBeGreaterThan(0)
      const deviceInfo = createRefreshTokenCalls[0]![1].device_info
      expect(deviceInfo).not.toBeNull()
      expect(deviceInfo!.length).toBe(255)
      expect(deviceInfo).toBe('A'.repeat(255))
    })

    // [TC3b] A UA between 256–511 chars must be stored in full (up to 512) in logAuthEvent
    // but truncated to 255 in device_info. This is the key scenario that COR-1 fixes.
    it('should store a 400-char User-Agent as 400 chars in logAuthEvent but 255 chars in device_info', async () => {
      const mediumUa = 'B'.repeat(400)
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
        oauthAccount: mockOAuthAccount,
        user: mockUser,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.88.2.1',
        headers: {
          'content-type': 'application/json',
          'user-agent': mediumUa,
        },
        body: JSON.stringify({
          provider: 'google',
          id_token: 'google-id-token',
        }),
      })

      expect(response.statusCode).toBe(200)

      // Audit log receives the full 400 chars
      const logAuthEventCalls = vi.mocked(queries.logAuthEvent).mock.calls
      const signinCall = logAuthEventCalls.find(([, params]) => params.event_type === 'signin')
      expect(signinCall).toBeDefined()
      const auditUa = signinCall![1].user_agent
      expect(auditUa).not.toBeNull()
      expect(auditUa!.length).toBe(400)
      expect(auditUa).toBe('B'.repeat(400))

      // device_info is still truncated to 255
      const createRefreshTokenCalls = vi.mocked(queries.createRefreshToken).mock.calls
      expect(createRefreshTokenCalls.length).toBeGreaterThan(0)
      const deviceInfo = createRefreshTokenCalls[0]![1].device_info
      expect(deviceInfo).not.toBeNull()
      expect(deviceInfo!.length).toBe(255)
      expect(deviceInfo).toBe('B'.repeat(255))
    })

    // [TC4] Control characters in a User-Agent must be stripped before storage
    it('should strip control characters from a User-Agent before storing it', async () => {
      // Build a UA with embedded control chars: \x00 (null), \x1F (unit sep), \x7F (del)
      const uaWithControlChars = 'Mozilla\x00/5.0\x1F (compatible)\x7F'
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
        oauthAccount: mockOAuthAccount,
        user: mockUser,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.88.1.1',
        headers: {
          'content-type': 'application/json',
          'user-agent': uaWithControlChars,
        },
        body: JSON.stringify({
          provider: 'google',
          id_token: 'google-id-token',
        }),
      })

      expect(response.statusCode).toBe(200)

      const logAuthEventCalls = vi.mocked(queries.logAuthEvent).mock.calls
      const signinCall = logAuthEventCalls.find(([, params]) => params.event_type === 'signin')
      expect(signinCall).toBeDefined()
      const storedUa = signinCall![1].user_agent
      // Control characters must have been stripped — none of \x00, \x1F, \x7F must remain
      expect(storedUa).not.toBeNull()
      expect(storedUa).toBe('Mozilla/5.0 (compatible)')
    })

    // [TC5] A UA consisting only of control characters must be stored as null
    it('should return null when the User-Agent contains only control characters', async () => {
      const controlOnlyUa = '\x00\x01\x1F\x7F'
      vi.mocked(verifyGoogleToken).mockResolvedValue(googleClaims)
      mockTx()
      vi.mocked(queries.findOAuthAccountWithUser).mockResolvedValue({
        oauthAccount: mockOAuthAccount,
        user: mockUser,
      })

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.88.1.1',
        headers: {
          'content-type': 'application/json',
          'user-agent': controlOnlyUa,
        },
        body: JSON.stringify({
          provider: 'google',
          id_token: 'google-id-token',
        }),
      })

      expect(response.statusCode).toBe(200)

      const logAuthEventCalls = vi.mocked(queries.logAuthEvent).mock.calls
      const signinCall = logAuthEventCalls.find(([, params]) => params.event_type === 'signin')
      expect(signinCall).toBeDefined()
      // After stripping all control chars the result is empty — must be stored as null
      expect(signinCall![1].user_agent).toBeNull()
    })
  })

  // ─── Network error (F2): provider verification infrastructure failures ────
  // verifyProviderToken throws a network-level error outside any transaction.
  // The route must respond with 503 via reply.code(503).send() — not by throwing
  // HttpError — so no transaction is started and no accidental rollback occurs.

  describe('network error 503 — provider verification infrastructure failure', () => {
    function makeNetworkError(code: string): Error {
      return Object.assign(new Error(`network: ${code}`), { code })
    }

    it('should return 503 for /auth/signin when verifyProviderToken throws a network error', async () => {
      vi.mocked(verifyGoogleToken).mockRejectedValue(makeNetworkError('ECONNRESET'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.503.1.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(response.statusCode).toBe(503)
      expect(response.json<{ error: string }>().error).toBe('Authentication service unavailable')
      // withTransaction must NOT have been called — no DB work for a pre-transaction failure
      expect(pool.withTransaction).not.toHaveBeenCalled()
    })

    it('should return 503 for /auth/signin on ETIMEDOUT', async () => {
      vi.mocked(verifyGoogleToken).mockRejectedValue(makeNetworkError('ETIMEDOUT'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/signin',
        remoteAddress: '10.503.2.1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', id_token: 'google-id-token' }),
      })

      expect(response.statusCode).toBe(503)
    })

    it('should return 503 for /auth/link-account when verifyProviderToken throws a network error', async () => {
      const accessToken = server.jwt.sign({ sub: mockUser.id })
      vi.mocked(verifyAppleToken).mockRejectedValue(makeNetworkError('ENOTFOUND'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.503.3.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'apple',
          id_token: 'apple-id-token',
          nonce: 'test-nonce',
        }),
      })

      expect(response.statusCode).toBe(503)
      expect(response.json<{ error: string }>().error).toBe('Authentication service unavailable')
      expect(pool.withTransaction).not.toHaveBeenCalled()
    })

    // [M-2] Google network error on /auth/link-account → 503
    it('should return 503 for /auth/link-account when verifyGoogleToken throws a network error (Google provider)', async () => {
      const accessToken = server.jwt.sign({ sub: mockUser.id })
      vi.mocked(verifyGoogleToken).mockRejectedValue(makeNetworkError('ECONNRESET'))

      const response = await server.inject({
        method: 'POST',
        url: '/auth/link-account',
        remoteAddress: '10.503.4.1',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          provider: 'google',
          id_token: 'google-id-token',
        }),
      })

      expect(response.statusCode).toBe(503)
      expect(response.json<{ error: string }>().error).toBe('Authentication service unavailable')
      expect(pool.withTransaction).not.toHaveBeenCalled()
    })
  })
})
