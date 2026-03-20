/**
 * Integration tests for Apple server-to-server webhook endpoint.
 *
 * Strategy: build a real Fastify server via buildServer() and use
 * fastify.inject() to exercise the full request/response pipeline.
 *
 * Apple JWKS is mocked by intercepting the `jose` module's createRemoteJWKSet
 * to return a local key set. Test JWTs are generated using jose.SignJWT with
 * ephemeral EC keys.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { OAuthAccount } from '../types/index.js';
import type { PoolClient } from '../db/pool.js';

// ─── Generate ephemeral EC key pair for test JWT signing ──────────────────────
const { testPrivatePem, testPublicPem, testPrivateKey, testPublicKey } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    testPrivateKey: privateKey,
    testPublicKey: publicKey,
  };
});

// ─── A separate "wrong" key pair for invalid signature tests ──────────────────
const { wrongPrivateKey } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return { wrongPrivateKey: privateKey };
});

// ─── Module mocks — must be declared before any imports ──────────────────────

vi.mock('../config.js', () => ({
  config: {
    port: 3000,
    corsOrigin: 'http://localhost:5173',
    trustProxy: false,
    secureCookies: false,
    cookieSecret: 'test-cookie-secret-32-bytes-long!!',
    nodeEnv: 'test',
    database: { url: 'postgresql://test:test@localhost:5432/testdb' },
    jwt: {
      privateKey: testPrivatePem,
      publicKey: testPublicPem,
      keyId: 'webhook-test-kid',
      issuer: 'track-em-toys-test',
      audience: 'track-em-toys-api-test',
      accessTokenExpiry: '15m',
    },
    apple: {
      bundleId: 'com.example.app',
      servicesId: 'com.example.web',
      teamId: 'TEAM123',
      keyId: 'KEY123',
      privateKey: testPrivatePem,
    },
    google: { webClientId: 'google-web-client-id', iosClientId: undefined },
    photos: {
      storagePath: '/tmp/trackem-test-photos',
      baseUrl: 'http://localhost:3010/photos',
      maxSizeMb: 10,
    },
  },
}));

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
  deactivateUser: vi.fn(),
  toUserResponse: vi.fn(),
}));

vi.mock('./apple.js', () => ({
  verifyAppleToken: vi.fn(),
  isPrivateRelayEmail: vi.fn().mockReturnValue(false),
}));

vi.mock('./google.js', () => ({
  verifyGoogleToken: vi.fn(),
}));

// Mock jose's createRemoteJWKSet to return a local key set using the test public key
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    createRemoteJWKSet: vi.fn().mockReturnValue(async () => testPublicKey),
  };
});

// ─── Import after mocks are registered ───────────────────────────────────────

import { SignJWT } from 'jose';
import { buildServer } from '../server.js';
import * as pool from '../db/pool.js';
import * as queries from '../db/queries.js';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

const mockAppleOAuthAccount: OAuthAccount = {
  id: 'oauth-acc-apple-1',
  user_id: 'user-uuid-1234-5678-9abc-def012345678',
  provider: 'apple',
  provider_user_id: 'apple-sub-001',
  email: 'user@example.com',
  is_private_email: false,
  raw_profile: null,
  created_at: '2026-01-01T00:00:00Z',
};

/**
 * Make withTransaction() call the provided fn with a fake client.
 */
function mockTx() {
  const fakeClient = {} satisfies Pick<PoolClient, never>;
  vi.mocked(pool.withTransaction).mockImplementation(async (fn) => {
    return fn(fakeClient as PoolClient);
  });
}

/**
 * Sign a test JWT with the given claims using the ephemeral test private key.
 *
 * @param claims - JWT claims to include
 * @param options - Optional signing options (key override, expiry)
 */
async function signTestJWT(
  claims: {
    events?: string;
    iss?: string;
    aud?: string;
  },
  options?: {
    privateKey?: import('node:crypto').KeyObject;
    expiresIn?: string;
  }
): Promise<string> {
  const key = options?.privateKey ?? testPrivateKey;
  let builder = new SignJWT(claims.events !== undefined ? { events: claims.events } : {})
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt();

  if (claims.iss !== undefined) {
    builder = builder.setIssuer(claims.iss);
  }
  if (claims.aud !== undefined) {
    builder = builder.setAudience(claims.aud);
  }
  if (options?.expiresIn) {
    builder = builder.setExpirationTime(options.expiresIn);
  } else {
    builder = builder.setExpirationTime('5m');
  }

  return builder.sign(key);
}

/**
 * Build a valid Apple webhook JWT with a consent-revoked event.
 *
 * @param sub - Apple provider user ID (defaults to 'apple-sub-001')
 */
async function buildConsentRevokedJWT(sub = 'apple-sub-001'): Promise<string> {
  return signTestJWT({
    events: JSON.stringify({ type: 'consent-revoked', sub }),
    iss: 'https://appleid.apple.com',
    aud: 'com.example.app',
  });
}

/**
 * Build a valid Apple webhook JWT with an account-delete event.
 *
 * @param sub - Apple provider user ID (defaults to 'apple-sub-001')
 */
async function buildAccountDeleteJWT(sub = 'apple-sub-001'): Promise<string> {
  return signTestJWT({
    events: JSON.stringify({ type: 'account-delete', sub }),
    iss: 'https://appleid.apple.com',
    aud: 'com.example.app',
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Apple webhook — POST /auth/webhooks/apple', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(queries.logAuthEvent).mockResolvedValue(undefined);
    vi.mocked(queries.revokeAllUserRefreshTokens).mockResolvedValue(undefined);
    vi.mocked(queries.deactivateUser).mockResolvedValue(undefined);
  });

  // ── Happy path: consent-revoked ──────────────────────────────────────────

  it('should revoke tokens and log consent_revoked event on consent-revoked', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockAppleOAuthAccount);

    const jwt = await buildConsentRevokedJWT();

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);

    expect(queries.findOAuthAccount).toHaveBeenCalledWith(expect.anything(), 'apple', 'apple-sub-001');
    expect(queries.revokeAllUserRefreshTokens).toHaveBeenCalledWith(expect.anything(), mockAppleOAuthAccount.user_id);
    expect(queries.logAuthEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user_id: mockAppleOAuthAccount.user_id,
        event_type: 'consent_revoked',
        metadata: { provider: 'apple', apple_event_type: 'consent-revoked' },
      })
    );
    // deactivateUser should NOT be called for consent-revoked
    expect(queries.deactivateUser).not.toHaveBeenCalled();
  });

  // ── Happy path: account-delete ───────────────────────────────────────────

  it('should deactivate user, revoke tokens, and log account_deactivated on account-delete', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockAppleOAuthAccount);

    const jwt = await buildAccountDeleteJWT();

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);

    expect(queries.deactivateUser).toHaveBeenCalledWith(expect.anything(), mockAppleOAuthAccount.user_id);
    expect(queries.revokeAllUserRefreshTokens).toHaveBeenCalledWith(expect.anything(), mockAppleOAuthAccount.user_id);
    expect(queries.logAuthEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        user_id: mockAppleOAuthAccount.user_id,
        event_type: 'account_deactivated',
        metadata: { provider: 'apple', apple_event_type: 'account-delete' },
      })
    );
  });

  // ── Unknown user returns 200 (idempotent) ────────────────────────────────

  it('should return 200 when user is not found (idempotent)', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(null);

    const jwt = await buildConsentRevokedJWT('unknown-apple-sub');

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);
    expect(queries.revokeAllUserRefreshTokens).not.toHaveBeenCalled();
    expect(queries.deactivateUser).not.toHaveBeenCalled();
    expect(queries.logAuthEvent).not.toHaveBeenCalled();
  });

  // ── Invalid JWT signature ────────────────────────────────────────────────

  it('should return 401 for invalid JWT signature', async () => {
    const jwt = await signTestJWT(
      {
        events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub-001' }),
        iss: 'https://appleid.apple.com',
        aud: 'com.example.app',
      },
      { privateKey: wrongPrivateKey }
    );

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>().error).toBe('Invalid webhook token');
  });

  // ── Expired JWT ──────────────────────────────────────────────────────────

  it('should return 401 for expired JWT', async () => {
    // Build a JWT that expires in the past using a negative time
    const key = testPrivateKey;
    const jwt = await new SignJWT({
      events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub-001' }),
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 300)
      .setIssuer('https://appleid.apple.com')
      .setAudience('com.example.app')
      .sign(key);

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>().error).toBe('Invalid webhook token');
  });

  // ── Wrong issuer ─────────────────────────────────────────────────────────

  it('should return 401 for wrong issuer', async () => {
    const jwt = await signTestJWT({
      events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub-001' }),
      iss: 'https://evil.example.com',
      aud: 'com.example.app',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>().error).toBe('Invalid webhook token');
  });

  // ── Wrong audience ───────────────────────────────────────────────────────

  it('should return 401 for wrong audience', async () => {
    const jwt = await signTestJWT({
      events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub-001' }),
      iss: 'https://appleid.apple.com',
      aud: 'com.wrong.audience',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>().error).toBe('Invalid webhook token');
  });

  // ── Malformed events claim ───────────────────────────────────────────────

  it('should return 400 for malformed events JSON', async () => {
    const jwt = await signTestJWT({
      events: 'not-valid-json{{{',
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('Malformed events claim');
  });

  // ── Missing events claim ─────────────────────────────────────────────────

  it('should return 400 for missing events claim', async () => {
    const key = testPrivateKey;
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .setIssuer('https://appleid.apple.com')
      .setAudience('com.example.app')
      .sign(key);

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('Missing events claim');
  });

  // ── Invalid events structure ─────────────────────────────────────────────

  it('should return 400 for events missing type or sub', async () => {
    const jwt = await signTestJWT({
      events: JSON.stringify({ type: 'consent-revoked' }), // missing sub
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('Invalid events structure');
  });

  // ── Unknown event type → 200 (ignore gracefully) ────────────────────────

  it('should return 200 for unknown event type (ignored gracefully)', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockAppleOAuthAccount);

    const jwt = await signTestJWT({
      events: JSON.stringify({ type: 'email-disabled', sub: 'apple-sub-001' }),
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);
    expect(queries.revokeAllUserRefreshTokens).not.toHaveBeenCalled();
    expect(queries.deactivateUser).not.toHaveBeenCalled();
    expect(queries.logAuthEvent).not.toHaveBeenCalled();
  });

  // ── Non-fatal audit log failure (consent-revoked) ────────────────────────

  it('should return 200 and log.error when audit log fails for consent-revoked', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockAppleOAuthAccount);
    vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('DB audit log write failed'));

    const errorSpy = vi.spyOn(server.log, 'error');

    const jwt = await buildConsentRevokedJWT();

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);
    // Tokens should still be revoked even though audit log failed
    expect(queries.revokeAllUserRefreshTokens).toHaveBeenCalledWith(expect.anything(), mockAppleOAuthAccount.user_id);
    // Security event must use log.error, not log.warn
    expect(errorSpy).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('audit log failed for consent_revoked')
    );

    errorSpy.mockRestore();
  });

  // ── Non-fatal audit log failure (account-delete) ─────────────────────────

  it('should return 200 and log.error when audit log fails for account-delete', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockAppleOAuthAccount);
    vi.mocked(queries.logAuthEvent).mockRejectedValue(new Error('DB audit log write failed'));

    const errorSpy = vi.spyOn(server.log, 'error');

    const jwt = await buildAccountDeleteJWT();

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);
    // User should still be deactivated and tokens revoked
    expect(queries.deactivateUser).toHaveBeenCalledWith(expect.anything(), mockAppleOAuthAccount.user_id);
    expect(queries.revokeAllUserRefreshTokens).toHaveBeenCalledWith(expect.anything(), mockAppleOAuthAccount.user_id);
    // Security event must use log.error, not log.warn
    expect(errorSpy).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() returns an asymmetric matcher typed as any by vitest internals
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('audit log failed for account_deactivated')
    );

    errorSpy.mockRestore();
  });

  // ── Empty payload ────────────────────────────────────────────────────────

  it('should return 401 for empty payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: '',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<{ error: string }>().error).toBe('Missing or empty payload');
  });

  // ── Services ID audience accepted ────────────────────────────────────────

  it('should accept servicesId as valid audience', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockAppleOAuthAccount);

    const jwt = await signTestJWT({
      events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-sub-001' }),
      iss: 'https://appleid.apple.com',
      aud: 'com.example.web', // servicesId
    });

    const response = await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean }>().ok).toBe(true);
    expect(queries.revokeAllUserRefreshTokens).toHaveBeenCalled();
  });

  // ── withTransaction called without userId (unauthenticated) ──────────────

  it('should call withTransaction without userId (unauthenticated webhook)', async () => {
    mockTx();
    vi.mocked(queries.findOAuthAccount).mockResolvedValue(mockAppleOAuthAccount);

    const jwt = await buildConsentRevokedJWT();

    await server.inject({
      method: 'POST',
      url: '/auth/webhooks/apple',
      payload: jwt,
    });

    // withTransaction should be called with only the callback (no userId)
    expect(pool.withTransaction).toHaveBeenCalledWith(expect.any(Function));
  });
});
