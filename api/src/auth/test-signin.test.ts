/**
 * Integration tests for the test-signin endpoint.
 *
 * Uses the same vi.hoisted + vi.mock pattern as routes.test.ts.
 * The endpoint is test-only (NODE_ENV !== 'production') and bypasses OAuth.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { User } from '../types/index.js';

// ─── Generate key pair + config mock before vi.mock() hoisting ───────────────
// Must use vi.hoisted() because vi.mock() factories are hoisted above all
// other statements — top-level variables are not yet initialized when they run.
const { configMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  return {
    configMock: {
      port: 3000,
      nodeEnv: 'test' as string,
      logLevel: 'silent',
      corsOrigin: 'http://localhost:5173',
      trustProxy: false,
      secureCookies: false,
      cookieSecret: 'test-cookie-secret-32-bytes-long!!',
      database: { url: 'postgresql://test:test@localhost:5432/testdb' },
      jwt: {
        privateKey: privPem,
        publicKey: pubPem,
        keyId: 'test-signin-kid',
        issuer: 'track-em-toys-test',
        audience: 'track-em-toys-api-test',
        accessTokenExpiry: '15m',
      },
      apple: { bundleId: 'com.example.app', servicesId: undefined },
      google: { webClientId: 'google-web-client-id', iosClientId: undefined },
      photos: {
        storagePath: '/tmp/trackem-test-photos',
        baseUrl: 'http://localhost:3010/photos',
        maxSizeMb: 10,
      },
      ml: {
        exportPath: '/tmp/trackem-test-ml-export',
      },
    },
  };
});

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({ config: configMock }));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, accessSync: vi.fn() };
});

let lastTransactionUserId: string | null | undefined;
// test-signin.ts calls client.query() directly for the upsert SQL.
// Pick<PoolClient, never> from routes.test.ts won't work because the handler
// actually invokes client.query(). QueryOnlyClient is the narrowest type that
// includes query(), but vi.fn()'s Mock type doesn't satisfy pg's query overloads.
const fakeQuery = vi.fn();
const fakeClient = { query: fakeQuery } as import('../db/pool.js').QueryOnlyClient;

vi.mock('../db/pool.js', () => ({
  withTransaction: vi.fn(),
  pool: { connect: vi.fn(), on: vi.fn(), end: vi.fn() },
}));

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
  getUserStatusAndRole: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  findRefreshTokenForRotation: vi.fn(),
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
    role: u.role,
  })),
}));

vi.mock('./apple.js', () => ({
  verifyAppleToken: vi.fn(),
  isPrivateRelayEmail: vi.fn().mockReturnValue(false),
}));

vi.mock('./google.js', () => ({
  verifyGoogleToken: vi.fn(),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { buildServer } from '../server.js';
import * as pool from '../db/pool.js';
import * as queries from '../db/queries.js';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const testUser: User = {
  id: 'e2e-user-0000-0000-000000000001',
  email: 'e2e-user@e2e.test',
  email_verified: true,
  display_name: 'E2E User',
  avatar_url: null,
  role: 'user',
  deactivated_at: null,
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function mockTx(): void {
  lastTransactionUserId = undefined;
  vi.mocked(pool.withTransaction).mockImplementation(async (fn, userId) => {
    lastTransactionUserId = userId;
    // QueryOnlyClient → PoolClient: safe because the handler only uses query()
    return fn(fakeClient as unknown as import('../db/pool.js').PoolClient);
  });
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /auth/test-signin', () => {
  it('should return 200 with access_token and user for valid request', async () => {
    mockTx();
    fakeQuery.mockResolvedValueOnce({ rows: [testUser], rowCount: 1 }); // upsert
    vi.mocked(queries.createRefreshToken).mockResolvedValueOnce(undefined as never);

    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-user@e2e.test', role: 'user' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.access_token).toBeDefined();
    expect(typeof body.access_token).toBe('string');
    expect(body.refresh_token).toBeNull();
    expect(body.user).toEqual({
      id: testUser.id,
      email: testUser.email,
      display_name: testUser.display_name,
      avatar_url: null,
      role: 'user',
    });

    // Verify refresh token cookie is set
    const cookies = response.cookies;
    const refreshCookie = cookies.find((c: { name: string }) => c.name === 'refresh_token');
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.httpOnly).toBe(true);
    expect(refreshCookie!.path).toBe('/auth');
  });

  it('should return 200 with admin role', async () => {
    const adminUser = {
      ...testUser,
      id: 'e2e-admin-0000-0000-000000000001',
      email: 'e2e-admin@e2e.test',
      role: 'admin' as const,
    };
    mockTx();
    fakeQuery.mockResolvedValueOnce({ rows: [adminUser], rowCount: 1 });
    vi.mocked(queries.createRefreshToken).mockResolvedValueOnce(undefined as never);

    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-admin@e2e.test', role: 'admin' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.role).toBe('admin');
  });

  it('should return 200 with curator role', async () => {
    const curatorUser = {
      ...testUser,
      id: 'e2e-curator-0000-0000-000000000001',
      email: 'e2e-curator@e2e.test',
      role: 'curator' as const,
    };
    mockTx();
    fakeQuery.mockResolvedValueOnce({ rows: [curatorUser], rowCount: 1 });
    vi.mocked(queries.createRefreshToken).mockResolvedValueOnce(undefined as never);

    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-curator@e2e.test', role: 'curator' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.role).toBe('curator');
  });

  it('should use custom display_name when provided', async () => {
    mockTx();
    const customUser = { ...testUser, display_name: 'Custom Name' };
    fakeQuery.mockResolvedValueOnce({ rows: [customUser], rowCount: 1 });
    vi.mocked(queries.createRefreshToken).mockResolvedValueOnce(undefined as never);

    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-user@e2e.test', role: 'user', display_name: 'Custom Name' },
    });

    expect(response.statusCode).toBe(200);
    // Verify the upsert SQL received the custom display name
    expect(fakeQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), [
      'e2e-user@e2e.test',
      'Custom Name',
      'user',
    ]);
  });

  it('should return 400 for non-e2e.test email', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'real@gmail.com', role: 'user' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 for invalid role', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-user@e2e.test', role: 'superadmin' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should return 400 for missing required fields', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-user@e2e.test' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject extra properties', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-user@e2e.test', role: 'user', hacked: true },
    });

    // Fastify AJV additionalProperties error — statusCode depends on error handler
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(600);
  });

  it('should call withTransaction without userId (unauthenticated context)', async () => {
    mockTx();
    fakeQuery.mockResolvedValueOnce({ rows: [testUser], rowCount: 1 });
    vi.mocked(queries.createRefreshToken).mockResolvedValueOnce(undefined as never);

    await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-user@e2e.test', role: 'user' },
    });

    // withTransaction is called without a userId (user may not exist yet)
    expect(lastTransactionUserId).toBeUndefined();
  });

  it('should be idempotent — same email returns updated user', async () => {
    mockTx();
    const updatedUser = { ...testUser, role: 'admin' as const };
    fakeQuery.mockResolvedValueOnce({ rows: [updatedUser], rowCount: 1 });
    vi.mocked(queries.createRefreshToken).mockResolvedValueOnce(undefined as never);

    const response = await server.inject({
      method: 'POST',
      url: '/auth/test-signin',
      payload: { email: 'e2e-user@e2e.test', role: 'admin' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe('admin');
    // Verify the SQL includes ON CONFLICT for upsert
    expect(fakeQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), expect.any(Array));
  });
});

describe('POST /auth/test-signin — production guard', () => {
  it('should not be registered when nodeEnv is production', async () => {
    const originalNodeEnv = configMock.nodeEnv;
    try {
      configMock.nodeEnv = 'production';

      // Reset modules to get a fresh buildServer with production config
      vi.resetModules();

      // Re-mock with production nodeEnv
      vi.doMock('../config.js', () => ({ config: configMock }));
      vi.doMock('node:fs', async () => {
        const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
        return { ...actual, accessSync: vi.fn() };
      });
      vi.doMock('../db/pool.js', () => ({
        withTransaction: vi.fn(),
        pool: { connect: vi.fn(), on: vi.fn(), end: vi.fn() },
      }));
      vi.doMock('../db/queries.js', () => ({
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
        toUserResponse: vi.fn((u: User) => ({
          id: u.id,
          email: u.email,
          display_name: u.display_name,
          avatar_url: u.avatar_url,
          role: u.role,
        })),
      }));
      vi.doMock('./apple.js', () => ({
        verifyAppleToken: vi.fn(),
        isPrivateRelayEmail: vi.fn().mockReturnValue(false),
      }));
      vi.doMock('./google.js', () => ({
        verifyGoogleToken: vi.fn(),
      }));

      const { buildServer: buildProdServer } = await import('../server.js');
      const prodServer = await buildProdServer();
      await prodServer.ready();

      const response = await prodServer.inject({
        method: 'POST',
        url: '/auth/test-signin',
        payload: { email: 'e2e-user@e2e.test', role: 'user' },
      });

      // Route should not exist in production — 404 (or 415 if caught by content-type hook)
      expect(response.statusCode).toBe(404);

      await prodServer.close();
    } finally {
      configMock.nodeEnv = originalNodeEnv;
      vi.doUnmock('../config.js');
      vi.doUnmock('node:fs');
      vi.doUnmock('../db/pool.js');
      vi.doUnmock('../db/queries.js');
      vi.doUnmock('./apple.js');
      vi.doUnmock('./google.js');
      vi.resetModules();
    }
  });
});
