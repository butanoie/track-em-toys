/**
 * Tests for the admin test-photos seed endpoint (non-production only).
 *
 * This file exercises the schema validation paths (which fail before the
 * transaction is entered, so no DB mock is needed) plus the production
 * registration guard. The happy path and 404 paths exercise withTransaction
 * and will be covered by the E2E tests in PR 2, which run against real
 * seeded data.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
});

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
    photos: { storagePath: '/tmp/trackem-test-photos', baseUrl: 'http://localhost:3010/photos', maxSizeMb: 10 },
    ml: { exportPath: '/tmp/trackem-test-ml-export' },
  },
}));

vi.mock('../db/pool.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}));

vi.mock('../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}));

import { buildServer } from '../server.js';

describe('admin test-photos seed endpoint — schema validation', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for invalid email pattern (not @e2e.test)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/admin/test-photos/seed',
      headers: { 'content-type': 'application/json' },
      payload: {
        contributor_email: 'not-an-e2e-email@example.com',
        item_slug: 'optimus-prime',
        franchise_slug: 'transformers',
        intent: 'training_only',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 for missing intent field', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/admin/test-photos/seed',
      headers: { 'content-type': 'application/json' },
      payload: {
        contributor_email: 'seed@e2e.test',
        item_slug: 'optimus-prime',
        franchise_slug: 'transformers',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 for invalid intent enum value', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/admin/test-photos/seed',
      headers: { 'content-type': 'application/json' },
      payload: {
        contributor_email: 'seed@e2e.test',
        item_slug: 'optimus-prime',
        franchise_slug: 'transformers',
        intent: 'whatever',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should require JSON content-type via parent admin plugin hook', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/admin/test-photos/seed',
      headers: { 'content-type': 'text/plain' },
      payload: 'not-json',
    });
    // Either 415 (from the admin plugin's content-type hook) or 400
    // (from Fastify's JSON parser). Both are acceptable rejections.
    expect([400, 415]).toContain(res.statusCode);
  });
});

describe('testPhotosRoutes production registration guard', () => {
  it('throws when registered in a production environment', async () => {
    vi.resetModules();
    vi.doMock('../config.js', () => ({
      config: { nodeEnv: 'production' },
    }));

    const { testPhotosRoutes } = await import('./test-photos.js');

    // The guard throws at the top of the function before any Fastify methods
    // are invoked, so an empty stub is structurally sufficient for this test.
    // @ts-expect-error — intentionally minimal stub; real FastifyInstance has
    // many required fields but none are touched before the production guard fires.
    await expect(testPhotosRoutes({}, {})).rejects.toThrow('test-photos route must never be registered in production');

    vi.doUnmock('../config.js');
    vi.resetModules();
  });
});
