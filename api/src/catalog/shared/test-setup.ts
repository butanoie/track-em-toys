/**
 * Shared test setup for catalog integration tests.
 *
 * Provides mock config, pool, and key-store setup that all catalog route
 * test files need. Import this module at the top of each test file BEFORE
 * any other imports.
 *
 * Usage:
 *   import { mockQuery, setupCatalogTest } from '../shared/test-setup.js'
 *   const { buildServer } = await setupCatalogTest()
 */
import { vi } from 'vitest'

const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto')
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  }
})

vi.mock('../../config.js', () => ({
  config: {
    port: 3000, corsOrigin: '*', trustProxy: false, secureCookies: false,
    cookieSecret: 'test-cookie-secret-32-bytes-long!!',
    logLevel: 'silent', nodeEnv: 'test',
    database: { url: 'postgresql://test:test@localhost/test', poolMax: 2 },
    jwt: {
      privateKey: testPrivatePem, publicKey: testPublicPem,
      keyId: 'test-kid', issuer: 'test', audience: 'test', accessTokenExpiry: '15m',
    },
    apple: { bundleId: 'com.test' }, google: { webClientId: 'test' },
  },
}))

export const mockQuery = vi.fn()
vi.mock('../../db/pool.js', () => ({
  pool: { query: mockQuery, connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}))

vi.mock('../../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}))

export async function setupCatalogTest() {
  return import('../../server.js')
}
