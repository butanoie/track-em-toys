/**
 * Unit tests for the docs plugin — OpenAPI spec and Scalar reference UI.
 *
 * Uses vi.doMock() + vi.resetModules() to swap config.nodeEnv between
 * describe blocks, giving each suite a fresh buildServer() import that
 * sees the correct environment.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ─── Generate a real EC key pair before vi.mock() hoisting ───────────────────
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

/** Base config shared by both development and production suites. */
const baseConfig = {
  port: 3000,
  logLevel: 'silent',
  corsOrigin: 'http://localhost:5173',
  trustProxy: false,
  secureCookies: false,
  cookieSecret: 'test-cookie-secret-32-bytes-long!!',
  database: { url: 'postgresql://test:test@localhost:5432/testdb' },
  jwt: {
    privateKey: testPrivatePem,
    publicKey: testPublicPem,
    keyId: 'docs-test-kid',
    issuer: 'track-em-toys-test',
    audience: 'track-em-toys-api-test',
    accessTokenExpiry: '15m',
  },
  apple: { bundleId: undefined, servicesId: undefined },
  google: { webClientId: undefined, iosClientId: undefined },
}

// Shared DB / query mocks — these modules are not exercised by docs tests
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
  createRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllUserRefreshTokens: vi.fn(),
  setUserEmailVerified: vi.fn(),
  logAuthEvent: vi.fn(),
}))
vi.mock('../auth/apple.js', () => ({ verifyAppleToken: vi.fn() }))
vi.mock('../auth/google.js', () => ({ verifyGoogleToken: vi.fn() }))

// ─── Development environment (docs enabled) ─────────────────────────────────

describe('docs plugin (development)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    vi.resetModules()
    vi.doMock('../config.js', () => ({
      config: { ...baseConfig, nodeEnv: 'development' },
    }))

    const { buildServer } = await import('../server.js')
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    vi.doUnmock('../config.js')
    vi.resetModules()
  })

  it('serves the OpenAPI JSON spec at /reference/openapi.json', async () => {
    const res = await app.inject({ method: 'GET', url: '/reference/openapi.json' })
    expect(res.statusCode).toBe(200)

    const spec = res.json<{ openapi: string; info: { title: string }; paths: Record<string, unknown> }>()
    expect(spec.openapi).toMatch(/^3\.0/)
    expect(spec.info.title).toBe("Track'em Toys API")
  })

  it('includes all 6 routes in the spec paths', async () => {
    const res = await app.inject({ method: 'GET', url: '/reference/openapi.json' })
    const spec = res.json<{ paths: Record<string, unknown> }>()
    const paths = Object.keys(spec.paths)

    expect(paths).toContain('/health')
    expect(paths).toContain('/.well-known/jwks.json')
    expect(paths).toContain('/auth/signin')
    expect(paths).toContain('/auth/refresh')
    expect(paths).toContain('/auth/logout')
    expect(paths).toContain('/auth/link-account')
  })

  it('serves the Scalar reference UI at /reference/', async () => {
    const res = await app.inject({ method: 'GET', url: '/reference/' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
  })
})

// ─── Production environment (docs disabled) ──────────────────────────────────

describe('docs plugin (production)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    vi.resetModules()
    vi.doMock('../config.js', () => ({
      config: { ...baseConfig, nodeEnv: 'production' },
    }))

    const { buildServer } = await import('../server.js')
    app = await buildServer()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    vi.doUnmock('../config.js')
    vi.resetModules()
  })

  it('returns 404 for /reference/openapi.json in production', async () => {
    const res = await app.inject({ method: 'GET', url: '/reference/openapi.json' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for /reference/ in production', async () => {
    const res = await app.inject({ method: 'GET', url: '/reference/' })
    expect(res.statusCode).toBe(404)
  })
})
