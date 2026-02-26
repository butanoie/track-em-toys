import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Generate key pair with vi.hoisted() so it runs before vi.mock() hoisting ─
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

vi.mock('../config.js', () => ({
  config: {
    jwt: {
      keyId: 'jwks-test-kid',
      privateKey: testPrivatePem,
      publicKey: testPublicPem,
      issuer: 'track-em-toys-test',
      audience: 'track-em-toys-api-test',
      accessTokenExpiry: '15m',
    },
    secureCookies: false,
    cookieSecret: 'test-secret',
    corsOrigin: 'http://localhost:5173',
    trustProxy: false,
    port: 3000,
    database: { url: 'postgresql://test:test@localhost:5432/testdb' },
    apple: {},
    google: {},
  },
}))

import Fastify from 'fastify'
import { jwksRoute } from './jwks.js'
import { initKeyStore } from './key-store.js'

describe('jwksRoute', () => {
  beforeEach(async () => {
    await initKeyStore()
  })

  async function buildTestServer() {
    const fastify = Fastify({ logger: false })
    await fastify.register(jwksRoute)
    return fastify
  }

  it('should return 200 with a keys array', async () => {
    const fastify = await buildTestServer()

    const response = await fastify.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ keys: unknown[] }>()
    expect(body).toHaveProperty('keys')
    expect(Array.isArray(body.keys)).toBe(true)
    expect(body.keys.length).toBeGreaterThan(0)
  })

  it('should include only whitelisted JWK fields in the response', async () => {
    const fastify = await buildTestServer()

    const response = await fastify.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
    })

    const body = response.json<{ keys: Record<string, unknown>[] }>()
    const key = body.keys[0]
    expect(key).toBeDefined()

    expect(key!).toHaveProperty('kty')
    expect(key).toHaveProperty('crv')
    expect(key).toHaveProperty('x')
    expect(key).toHaveProperty('y')
    expect(key).toHaveProperty('kid', 'jwks-test-kid')
    expect(key).toHaveProperty('alg', 'ES256')
    expect(key).toHaveProperty('use', 'sig')

    // Private key field must not leak
    expect(key).not.toHaveProperty('d')

    // Fastify schema validation strips additionalProperties=false — no extra fields
    const allowedKeys = new Set(['kty', 'crv', 'x', 'y', 'kid', 'alg', 'use'])
    for (const field of Object.keys(key!)) {
      expect(allowedKeys.has(field)).toBe(true)
    }
  })

  it('should set Cache-Control: public, max-age=3600', async () => {
    const fastify = await buildTestServer()

    const response = await fastify.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
    })

    expect(response.headers['cache-control']).toBe('public, max-age=3600')
  })

  it('should return EC key type for prime256v1 keys', async () => {
    const fastify = await buildTestServer()

    const response = await fastify.inject({
      method: 'GET',
      url: '/.well-known/jwks.json',
    })

    const body = response.json<{ keys: Record<string, unknown>[] }>()
    expect(body.keys[0]?.kty).toBe('EC')
  })
})
