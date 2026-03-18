/**
 * Integration tests for admin routes.
 *
 * Strategy: build a real Fastify server via buildServer() and use
 * fastify.inject() to exercise the full request/response pipeline including
 * schema validation, rate-limit plugin registration, JWT signing, and
 * role-based access control.
 *
 * External dependencies are mocked at the module boundary:
 *   - db/pool (withTransaction) — passthrough to the callback with a fake client
 *   - db/queries — individual query functions (deactivateUser, revokeAllUserRefreshTokens, logAuthEvent)
 *   - admin/queries — admin-specific query functions
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { PoolClient } from '../db/pool.js'

// ─── Generate a real EC key pair before vi.mock() hoisting ───────────────────
const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto')
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  })
  return {
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  }
})

// ─── Module mocks — must be declared before any imports ──────────────────────

vi.mock('../config.js', () => ({
  config: {
    port: 3000,
    corsOrigin: '*',
    trustProxy: false,
    secureCookies: false,
    cookieSecret: 'test-cookie-secret-32-bytes-long!!',
    logLevel: 'silent',
    nodeEnv: 'test',
    database: { url: 'postgresql://test:test@localhost/test', poolMax: 2 },
    jwt: {
      privateKey: testPrivatePem,
      publicKey: testPublicPem,
      keyId: 'test-kid',
      issuer: 'test',
      audience: 'test',
      accessTokenExpiry: '15m',
    },
    apple: { bundleId: 'com.test' },
    google: { webClientId: 'test' },
  },
}))

vi.mock('../db/pool.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}))

vi.mock('../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}))

vi.mock('../db/queries.js', () => ({
  deactivateUser: vi.fn(),
  revokeAllUserRefreshTokens: vi.fn(),
  logAuthEvent: vi.fn(),
}))

vi.mock('./queries.js', () => ({
  listAdminUsers: vi.fn(),
  findUserForAdmin: vi.fn(),
  updateUserRole: vi.fn(),
  reactivateUser: vi.fn(),
  gdprPurgeUser: vi.fn(),
  countActiveAdmins: vi.fn(),
}))

// ─── Import after mocks are registered ───────────────────────────────────────

import { buildServer } from '../server.js'
import * as pool from '../db/pool.js'
import * as dbQueries from '../db/queries.js'
import * as adminQueries from './queries.js'

// ─── Fixture data ────────────────────────────────────────────────────────────

const ADMIN_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const TARGET_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'
const USER_UUID = 'c3d4e5f6-a7b8-9012-cdef-123456789012'

const mockAdminUser = {
  id: TARGET_UUID,
  email: 'user@example.com',
  display_name: 'Test User',
  avatar_url: null,
  role: 'user' as const,
  deactivated_at: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

const mockDeactivatedUser = {
  ...mockAdminUser,
  deactivated_at: '2026-01-15T00:00:00Z',
}

const mockPurgedUser = {
  ...mockAdminUser,
  email: null,
  display_name: null,
  avatar_url: null,
  deleted_at: '2026-01-20T00:00:00Z',
  deactivated_at: '2026-01-20T00:00:00Z',
}

// ─── withTransaction passthrough helper ──────────────────────────────────────

// All admin query functions are vi.mock'd at the module boundary above, so fakeClient
// is passed through by withTransaction but its methods are never actually invoked.
// Pick<PoolClient, never> documents this intent without bypassing type safety.
const fakeClient = {} satisfies Pick<PoolClient, never>

function mockTx() {
  vi.mocked(pool.withTransaction).mockImplementation(
    // fakeClient cast is safe: all query functions are mocked, no real DB method is called
    async (fn, _userId) => fn(fakeClient as PoolClient),
  )
}

// Assert that logAuthEvent was called with the expected event_type and metadata.
// Uses direct mock.calls inspection to avoid nested expect.objectContaining
// which triggers eslint no-unsafe-assignment on the metadata property.
function expectAuditLog(eventType: string, metadata: Record<string, unknown>) {
  const logCalls = vi.mocked(dbQueries.logAuthEvent).mock.calls
  expect(logCalls.length).toBeGreaterThanOrEqual(1)
  const lastCall = logCalls[logCalls.length - 1]
  expect(lastCall).toBeDefined()
  expect(lastCall![0]).toBe(fakeClient)
  expect(lastCall![1]).toMatchObject({
    user_id: TARGET_UUID,
    event_type: eventType,
  })
  const actualMeta = lastCall![1].metadata as Record<string, unknown>
  expect(actualMeta).toMatchObject(metadata)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('admin routes', () => {
  let server: FastifyInstance

  beforeAll(async () => {
    server = await buildServer()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default mock implementations
    vi.mocked(dbQueries.logAuthEvent).mockResolvedValue(undefined)
    vi.mocked(dbQueries.deactivateUser).mockResolvedValue(undefined)
    vi.mocked(dbQueries.revokeAllUserRefreshTokens).mockResolvedValue(undefined)
    vi.mocked(adminQueries.gdprPurgeUser).mockResolvedValue(undefined)
  })

  function adminToken(sub: string = ADMIN_UUID): string {
    return server.jwt.sign({ sub, role: 'admin' })
  }

  function userToken(sub: string = USER_UUID): string {
    return server.jwt.sign({ sub, role: 'user' })
  }

  function curatorToken(sub: string = USER_UUID): string {
    return server.jwt.sign({ sub, role: 'curator' })
  }

  // ─── GET /admin/users ────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('should return 200 with paginated user list', async () => {
      vi.mocked(adminQueries.listAdminUsers).mockResolvedValue({
        rows: [mockAdminUser],
        totalCount: 1,
      })

      const res = await server.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json<{ data: unknown[]; total_count: number; limit: number; offset: number }>()
      expect(body.data).toHaveLength(1)
      expect(body.total_count).toBe(1)
      expect(body.limit).toBe(20)
      expect(body.offset).toBe(0)
    })

    it('should return 200 with role filter', async () => {
      vi.mocked(adminQueries.listAdminUsers).mockResolvedValue({
        rows: [mockAdminUser],
        totalCount: 1,
      })

      const res = await server.inject({
        method: 'GET',
        url: '/admin/users?role=user',
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(200)
      expect(vi.mocked(adminQueries.listAdminUsers)).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user' }),
      )
    })

    it('should return 200 with email search', async () => {
      vi.mocked(adminQueries.listAdminUsers).mockResolvedValue({
        rows: [mockAdminUser],
        totalCount: 1,
      })

      const res = await server.inject({
        method: 'GET',
        url: '/admin/users?email=user@example.com',
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(200)
      expect(vi.mocked(adminQueries.listAdminUsers)).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'user@example.com' }),
      )
    })

    it('should return 401 with no auth header', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/users',
      })

      expect(res.statusCode).toBe(401)
    })

    it('should return 403 when authenticated as user role', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${userToken()}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('should return 403 when authenticated as curator role', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${curatorToken()}` },
      })

      expect(res.statusCode).toBe(403)
    })
  })

  // ─── PATCH /admin/users/:id/role ─────────────────────────────────────────

  describe('PATCH /admin/users/:id/role', () => {
    it('should return 200 on successful role change', async () => {
      mockTx()
      const updatedUser = { ...mockAdminUser, role: 'curator' as const }
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockAdminUser)
      vi.mocked(adminQueries.updateUserRole).mockResolvedValue(updatedUser)

      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'curator' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json<{ role: string }>()
      expect(body.role).toBe('curator')
      // Audit log should be called
      expectAuditLog('role_changed', {
        initiated_by: ADMIN_UUID,
        old_role: 'user',
        new_role: 'curator',
      })
    })

    it('should revoke refresh tokens on demotion', async () => {
      mockTx()
      const adminTarget = { ...mockAdminUser, role: 'admin' as const }
      const demotedUser = { ...mockAdminUser, role: 'user' as const }
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(adminTarget)
      vi.mocked(adminQueries.updateUserRole).mockResolvedValue(demotedUser)
      vi.mocked(adminQueries.countActiveAdmins).mockResolvedValue(2)

      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'user' },
      })

      expect(res.statusCode).toBe(200)
      expect(vi.mocked(dbQueries.revokeAllUserRefreshTokens)).toHaveBeenCalledWith(
        fakeClient,
        TARGET_UUID,
      )
    })

    it('should not revoke refresh tokens on promotion', async () => {
      mockTx()
      const updatedUser = { ...mockAdminUser, role: 'curator' as const }
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockAdminUser)
      vi.mocked(adminQueries.updateUserRole).mockResolvedValue(updatedUser)

      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'curator' },
      })

      expect(res.statusCode).toBe(200)
      expect(vi.mocked(dbQueries.revokeAllUserRefreshTokens)).not.toHaveBeenCalled()
    })

    it('should return 403 on self-modification', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${ADMIN_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'user' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json<{ error: string }>().error).toBe('Cannot perform this action on your own account')
    })

    it('should return 403 on self-modification with uppercase UUID', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${ADMIN_UUID.toUpperCase()}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'user' },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json<{ error: string }>().error).toBe('Cannot perform this action on your own account')
    })

    it('should return 401 with no auth header', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: { 'content-type': 'application/json' },
        payload: { role: 'curator' },
      })

      expect(res.statusCode).toBe(401)
    })

    it('should return 403 with non-admin role', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${userToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'curator' },
      })

      expect(res.statusCode).toBe(403)
    })

    it('should return 404 when user not found', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(null)

      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'curator' },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json<{ error: string }>().error).toBe('User not found')
    })

    it('should return 409 for GDPR-purged user', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockPurgedUser)

      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'curator' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ error: string }>().error).toBe('User has been permanently deleted')
    })

    it('should return 409 when demoting the last admin', async () => {
      mockTx()
      const adminTarget = { ...mockAdminUser, role: 'admin' as const }
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(adminTarget)
      vi.mocked(adminQueries.countActiveAdmins).mockResolvedValue(1)

      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'user' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ error: string }>().error).toBe('Cannot demote the last admin')
    })

    it('should return 400 for invalid role value', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/admin/users/${TARGET_UUID}/role`,
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'superadmin' },
      })

      expect(res.statusCode).toBe(400)
    })

    it('should return 400 for invalid UUID format', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/admin/users/not-a-uuid/role',
        headers: {
          authorization: `Bearer ${adminToken()}`,
          'content-type': 'application/json',
        },
        payload: { role: 'curator' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  // ─── POST /admin/users/:id/deactivate ────────────────────────────────────

  describe('POST /admin/users/:id/deactivate', () => {
    it('should return 200 on successful deactivation', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin)
        .mockResolvedValueOnce(mockAdminUser) // initial lookup
        .mockResolvedValueOnce(mockDeactivatedUser) // re-fetch after deactivation

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/deactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json<{ deactivated_at: string | null }>()
      expect(body.deactivated_at).toBe('2026-01-15T00:00:00Z')
      expect(vi.mocked(dbQueries.deactivateUser)).toHaveBeenCalledWith(fakeClient, TARGET_UUID)
      expect(vi.mocked(dbQueries.revokeAllUserRefreshTokens)).toHaveBeenCalledWith(fakeClient, TARGET_UUID)
      // Audit log should be called
      expectAuditLog('account_deactivated', { initiated_by: ADMIN_UUID })
    })

    it('should return 200 when already deactivated (idempotent)', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockDeactivatedUser)

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/deactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(200)
      // Should NOT call deactivateUser again
      expect(vi.mocked(dbQueries.deactivateUser)).not.toHaveBeenCalled()
    })

    it('should return 403 on self-deactivation', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${ADMIN_UUID}/deactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json<{ error: string }>().error).toBe('Cannot perform this action on your own account')
    })

    it('should return 403 with non-admin role', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/deactivate`,
        headers: { authorization: `Bearer ${userToken()}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('should return 404 when user not found', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(null)

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/deactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json<{ error: string }>().error).toBe('User not found')
    })

    it('should return 409 for GDPR-purged user', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockPurgedUser)

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/deactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ error: string }>().error).toBe('User has been permanently deleted')
    })
  })

  // ─── POST /admin/users/:id/reactivate ────────────────────────────────────

  describe('POST /admin/users/:id/reactivate', () => {
    it('should return 200 on successful reactivation', async () => {
      mockTx()
      const reactivatedUser = { ...mockAdminUser, deactivated_at: null }
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockDeactivatedUser)
      vi.mocked(adminQueries.reactivateUser).mockResolvedValue(reactivatedUser)

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/reactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json<{ deactivated_at: string | null }>()
      expect(body.deactivated_at).toBeNull()
      // Audit log should be called
      expectAuditLog('account_reactivated', { initiated_by: ADMIN_UUID })
    })

    it('should return 200 when already active (idempotent)', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockAdminUser)

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/reactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(200)
      // Should NOT call reactivateUser
      expect(vi.mocked(adminQueries.reactivateUser)).not.toHaveBeenCalled()
    })

    it('should return 403 with non-admin role', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/reactivate`,
        headers: { authorization: `Bearer ${userToken()}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('should return 404 when user not found', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(null)

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/reactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json<{ error: string }>().error).toBe('User not found')
    })

    it('should return 409 for GDPR-purged user', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockPurgedUser)

      const res = await server.inject({
        method: 'POST',
        url: `/admin/users/${TARGET_UUID}/reactivate`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ error: string }>().error).toBe('User has been permanently deleted')
    })
  })

  // ─── DELETE /admin/users/:id ─────────────────────────────────────────────

  describe('DELETE /admin/users/:id', () => {
    it('should return 204 on successful GDPR purge', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockAdminUser)

      const res = await server.inject({
        method: 'DELETE',
        url: `/admin/users/${TARGET_UUID}`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(204)
      expect(vi.mocked(adminQueries.gdprPurgeUser)).toHaveBeenCalledWith(fakeClient, TARGET_UUID)
      // Audit log should be called
      expectAuditLog('user_purged', { initiated_by: ADMIN_UUID })
    })

    it('should return 403 on self-deletion', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/admin/users/${ADMIN_UUID}`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(403)
      expect(res.json<{ error: string }>().error).toBe('Cannot perform this action on your own account')
    })

    it('should return 403 with non-admin role', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/admin/users/${TARGET_UUID}`,
        headers: { authorization: `Bearer ${userToken()}` },
      })

      expect(res.statusCode).toBe(403)
    })

    it('should return 404 when user not found', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(null)

      const res = await server.inject({
        method: 'DELETE',
        url: `/admin/users/${TARGET_UUID}`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(404)
      expect(res.json<{ error: string }>().error).toBe('User not found')
    })

    it('should return 409 when already purged', async () => {
      mockTx()
      vi.mocked(adminQueries.findUserForAdmin).mockResolvedValue(mockPurgedUser)

      const res = await server.inject({
        method: 'DELETE',
        url: `/admin/users/${TARGET_UUID}`,
        headers: { authorization: `Bearer ${adminToken()}` },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ error: string }>().error).toBe('User has already been purged')
    })
  })
})
