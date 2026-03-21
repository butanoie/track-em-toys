/**
 * Unit tests for buildServer() — global error handler and server setup.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Generate a real EC key pair before vi.mock() hoisting ───────────────────
const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    // format: 'pem' guarantees string at runtime; TS types KeyObject.export() as string | Buffer
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
});

vi.mock('./config.js', () => ({
  config: {
    port: 3000,
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
      keyId: 'server-test-kid',
      issuer: 'track-em-toys-test',
      audience: 'track-em-toys-api-test',
      accessTokenExpiry: '15m',
    },
    apple: { bundleId: undefined, servicesId: undefined },
    google: { webClientId: undefined, iosClientId: undefined },
    photos: {
      storagePath: '/tmp/trackem-test-photos',
      baseUrl: 'http://localhost:3010/photos',
      maxSizeMb: 10,
    },
    ml: {
      exportPath: '/tmp/trackem-test-ml-export',
    },
  },
}));

vi.mock('./db/pool.js', () => ({
  withTransaction: vi.fn(),
  pool: { connect: vi.fn(), on: vi.fn(), end: vi.fn() },
}));

vi.mock('./db/queries.js', () => ({
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
  getUserStatusAndRole: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  findRefreshTokenForRotation: vi.fn(),
  createRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllUserRefreshTokens: vi.fn(),
  setUserEmailVerified: vi.fn(),
  logAuthEvent: vi.fn(),
}));

vi.mock('./auth/apple.js', () => ({ verifyAppleToken: vi.fn() }));
vi.mock('./auth/google.js', () => ({ verifyGoogleToken: vi.fn() }));

import { buildServer } from './server.js';
import { HttpError } from './auth/errors.js';

// ─── Register a test route that throws a controlled error ────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildServer();

  // Register a diagnostic route that throws a plain object error with a
  // configurable statusCode. This exercises the global error handler directly.
  app.get('/test-error', async () => {
    const err = Object.assign(new Error('boom'), { statusCode: 42 });
    throw err;
  });
  app.get('/test-valid-4xx', async () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404 });
    throw err;
  });
  app.get('/test-valid-5xx', async () => {
    const err = Object.assign(new Error('bad gateway'), { statusCode: 502 });
    throw err;
  });
  app.get('/test-no-status', async () => {
    throw new Error('plain error');
  });
  app.get('/test-http-error', async () => {
    throw new HttpError(422, { error: 'Unprocessable' });
  });

  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ─── Global error handler ────────────────────────────────────────────────────

describe('global error handler', () => {
  it('clamps an out-of-range statusCode (42) to 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/test-error' });
    expect(res.statusCode).toBe(500);
  });

  it('passes through a valid 4xx statusCode (404)', async () => {
    const res = await app.inject({ method: 'GET', url: '/test-valid-4xx' });
    expect(res.statusCode).toBe(404);
  });

  it('passes through a valid 5xx statusCode (502)', async () => {
    const res = await app.inject({ method: 'GET', url: '/test-valid-5xx' });
    expect(res.statusCode).toBe(502);
  });

  it('defaults to 500 when no statusCode property is present', async () => {
    const res = await app.inject({ method: 'GET', url: '/test-no-status' });
    expect(res.statusCode).toBe(500);
  });

  it('responds with { error: "Internal Server Error" } in non-development env', async () => {
    const res = await app.inject({ method: 'GET', url: '/test-no-status' });
    expect(res.json<{ error: string }>().error).toBe('Internal Server Error');
  });

  it('delegates HttpError to reply.code + body without logging as unhandled', async () => {
    const res = await app.inject({ method: 'GET', url: '/test-http-error' });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: 'Unprocessable' });
  });
});
