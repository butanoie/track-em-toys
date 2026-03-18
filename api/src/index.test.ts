/**
 * Unit tests for main() and startup() in index.ts.
 *
 * The top-level IIFE is guarded by `process.argv[1] === fileURLToPath(import.meta.url)`
 * so it does NOT fire when this test file imports from index.ts.
 *
 * - main()    — the happy-path server startup
 * - startup() — wraps main() with structured-JSON error output + process.exit(1)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'

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

vi.mock('./config.js', () => ({
  config: {
    port: 3001,
    nodeEnv: 'test',
    logLevel: 'silent',
    corsOrigin: 'http://localhost:5173',
    trustProxy: false,
    secureCookies: false,
    cookieSecret: 'test-cookie-secret-32-bytes-long!!',
    database: { url: 'postgresql://test:test@localhost:5432/testdb' },
    jwt: {
      privateKey: testPrivatePem,
      publicKey: testPublicPem,
      keyId: 'index-test-kid',
      issuer: 'track-em-toys-test',
      audience: 'track-em-toys-api-test',
      accessTokenExpiry: '15m',
    },
    apple: { bundleId: undefined, servicesId: undefined },
    google: { webClientId: undefined, iosClientId: undefined },
  },
}))

vi.mock('./db/pool.js', () => ({
  withTransaction: vi.fn(),
  pool: { connect: vi.fn(), on: vi.fn(), end: vi.fn() },
}))

vi.mock('./db/queries.js', () => ({
  findOAuthAccountWithUser: vi.fn(),
  findOAuthAccount: vi.fn(),
  findUserById: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserWithAccounts: vi.fn(),
  getUserStatusAndRole: vi.fn(),
  createUser: vi.fn(),
  createOAuthAccount: vi.fn(),
  updateUserDisplayName: vi.fn(),
  deleteOrphanUser: vi.fn(),
  userHasProvider: vi.fn(),
  findOAuthAccountsByUserId: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  findRefreshTokenForRotation: vi.fn(),
  createRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllUserRefreshTokens: vi.fn(),
  setUserEmailVerified: vi.fn(),
  logAuthEvent: vi.fn(),
}))

vi.mock('./auth/apple.js', () => ({ verifyAppleToken: vi.fn() }))
vi.mock('./auth/google.js', () => ({ verifyGoogleToken: vi.fn() }))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { main } from './index.js'

// ─── Happy-path tests ─────────────────────────────────────────────────────────

describe('main()', () => {
  it('resolves without throwing when the server starts successfully', async () => {
    await expect(main()).resolves.toBeUndefined()
  })
})

describe('main() — secureCookies warning', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('emits a warn log when nodeEnv is "staging" and secureCookies is false', async () => {
    const warnSpy = vi.fn()

    vi.resetModules()
    // Provide a staging config with secureCookies: false
    vi.doMock('./config.js', () => ({
      config: {
        port: 3001,
        nodeEnv: 'staging',
        logLevel: 'silent',
        corsOrigin: 'http://localhost:5173',
        trustProxy: false,
        secureCookies: false,
        cookieSecret: 'test-cookie-secret-32-bytes-long!!',
        database: { url: 'postgresql://test:test@localhost:5432/testdb' },
        jwt: {
          privateKey: testPrivatePem,
          publicKey: testPublicPem,
          keyId: 'index-staging-kid',
          issuer: 'track-em-toys-test',
          audience: 'track-em-toys-api-test',
          accessTokenExpiry: '15m',
        },
        apple: { bundleId: undefined, servicesId: undefined },
        google: { webClientId: undefined, iosClientId: undefined },
      },
    }))
    // Override buildServer to return a minimal fake server with a spy logger
    vi.doMock('./server.js', () => ({
      buildServer: vi.fn().mockResolvedValue({
        log: { warn: warnSpy, info: vi.fn(), error: vi.fn() },
        listen: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }))

    const { main: stagingMain } = await import('./index.js')
    await stagingMain()

    expect(warnSpy).toHaveBeenCalledWith(
      'secureCookies is disabled in a non-development environment — set SECURE_COOKIES=true',
    )

    vi.doUnmock('./config.js')
    vi.doUnmock('./server.js')
  })
})

// ─── Failure-path tests for startup() ────────────────────────────────────────
//
// Each test uses vi.resetModules() + vi.doMock() + dynamic import to get a
// fresh copy of index.ts that sees the overridden buildServer mock.

describe('startup()', () => {
  // NodeJS.WriteStream.write has multiple overloads; the simplest one that
  // covers our usage is (buffer: string) => boolean.
  let stderrSpy: MockInstance<(buffer: string) => boolean>
  let exitSpy: MockInstance<(code?: number) => never>

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true) as MockInstance<
      (buffer: string) => boolean
    >
    // Prevent the test process from actually exiting.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null): never => {
      throw new Error('process.exit called')
    }) as MockInstance<(code?: number) => never>
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    exitSpy.mockRestore()
    vi.resetModules()
  })

  it('writes a structured JSON fatal line to stderr when main() throws', async () => {
    const buildError = new Error('buildServer exploded')

    // Clear module cache so the fresh import picks up the new server mock.
    vi.resetModules()
    vi.doMock('./server.js', () => ({
      buildServer: vi.fn().mockRejectedValue(buildError),
    }))

    const { startup: startupWithBrokenServer } = await import('./index.js')

    // startup() catches the error, writes to stderr, then calls process.exit(1).
    // Our exitSpy throws to stop execution, so startup() rejects with that throw.
    await expect(startupWithBrokenServer()).rejects.toThrow('process.exit called')

    expect(stderrSpy).toHaveBeenCalledOnce()
    const written: string = stderrSpy.mock.calls[0]![0]
    const parsed = JSON.parse(written) as Record<string, unknown>
    expect(parsed.level).toBe('fatal')
    expect(parsed.msg).toBe('Startup failed')
    const parsedErr = parsed.err as Record<string, unknown>
    expect(parsedErr.message).toBe('buildServer exploded')
    expect(typeof parsedErr.stack).toBe('string')
  })

  it('calls process.exit(1) when main() throws', async () => {
    const buildError = new Error('another startup failure')

    vi.resetModules()
    vi.doMock('./server.js', () => ({
      buildServer: vi.fn().mockRejectedValue(buildError),
    }))

    const { startup: startupWithBrokenServer } = await import('./index.js')

    await expect(startupWithBrokenServer()).rejects.toThrow('process.exit called')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('serialises a non-Error thrown value as a string in the err field', async () => {
    vi.resetModules()
    vi.doMock('./server.js', () => ({
      buildServer: vi.fn().mockRejectedValue('plain string error'),
    }))

    const { startup: startupWithBrokenServer } = await import('./index.js')

    await expect(startupWithBrokenServer()).rejects.toThrow('process.exit called')

    expect(stderrSpy).toHaveBeenCalledOnce()
    const written: string = stderrSpy.mock.calls[0]![0]
    const parsed = JSON.parse(written) as Record<string, unknown>
    expect(parsed.err).toBe('plain string error')
  })
})
