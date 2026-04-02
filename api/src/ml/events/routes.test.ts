import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const { testPrivatePem, testPublicPem } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- required inside vi.hoisted
  const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
  const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return {
    testPrivatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    testPublicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
});

vi.mock('../../config.js', () => ({
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
      keyId: 'ml-events-test-kid',
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
      modelsPath: '/tmp/trackem-test-ml-models',
      modelsBaseUrl: 'http://localhost:3010/ml/model-files',
    },
  },
}));

vi.mock('../../db/pool.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}));

vi.mock('../../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('ml-events-test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}));

const mockInsertMlEvent = vi.fn();
const mockGetSummaryStats = vi.fn();
const mockGetDailyStats = vi.fn();
const mockGetModelStats = vi.fn();

vi.mock('./queries.js', () => ({
  insertMlEvent: (...args: unknown[]) => mockInsertMlEvent(...args),
  getSummaryStats: (...args: unknown[]) => mockGetSummaryStats(...args),
  getDailyStats: (...args: unknown[]) => mockGetDailyStats(...args),
  getModelStats: (...args: unknown[]) => mockGetModelStats(...args),
}));

vi.mock('../models/scanner.js', () => ({
  scanModels: vi.fn().mockResolvedValue([]),
}));

let server: FastifyInstance;

function userToken(): string {
  return server.jwt.sign({ sub: 'test-user-id', role: 'user' });
}

function adminToken(): string {
  return server.jwt.sign({ sub: 'test-admin-id', role: 'admin' });
}

beforeAll(async () => {
  const { buildServer } = await import('../../server.js');
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

describe('POST /ml/events', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/ml/events',
      payload: { event_type: 'scan_started' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 204 on valid event', async () => {
    mockInsertMlEvent.mockResolvedValue(undefined);

    const res = await server.inject({
      method: 'POST',
      url: '/ml/events',
      headers: { authorization: `Bearer ${userToken()}` },
      payload: {
        event_type: 'scan_started',
        model_name: 'primary-classifier',
        metadata: { model_version: 'v1' },
      },
    });

    expect(res.statusCode).toBe(204);
    expect(mockInsertMlEvent).toHaveBeenCalledWith({
      userId: 'test-user-id',
      eventType: 'scan_started',
      modelName: 'primary-classifier',
      metadata: { model_version: 'v1' },
    });
  });

  it('returns 400 on invalid event_type', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/ml/events',
      headers: { authorization: `Bearer ${userToken()}` },
      payload: { event_type: 'invalid_event' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 204 even if insert fails (non-fatal)', async () => {
    mockInsertMlEvent.mockRejectedValue(new Error('DB error'));

    const res = await server.inject({
      method: 'POST',
      url: '/ml/events',
      headers: { authorization: `Bearer ${userToken()}` },
      payload: { event_type: 'scan_completed' },
    });

    expect(res.statusCode).toBe(204);
  });
});

describe('GET /ml/stats/summary', () => {
  it('returns 403 for non-admin users', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/summary',
      headers: { authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns summary stats for admin', async () => {
    mockGetSummaryStats.mockResolvedValue({
      total_scans: 100,
      scans_completed: 80,
      scans_failed: 5,
      predictions_accepted: 40,
    });

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/summary?days=7',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total_scans).toBe(100);
    expect(body.acceptance_rate).toBeCloseTo(0.4);
    expect(body.error_rate).toBeCloseTo(0.05);
  });

  it('handles zero scans without division error', async () => {
    mockGetSummaryStats.mockResolvedValue({
      total_scans: 0,
      scans_completed: 0,
      scans_failed: 0,
      predictions_accepted: 0,
    });

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/summary',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.acceptance_rate).toBe(0);
    expect(body.error_rate).toBe(0);
  });
});

describe('GET /ml/stats/daily', () => {
  it('returns 403 for non-admin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/daily',
      headers: { authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns daily data for admin', async () => {
    mockGetDailyStats.mockResolvedValue([
      { date: '2026-03-31', event_type: 'scan_completed', count: '10' },
      { date: '2026-03-31', event_type: 'prediction_accepted', count: '5' },
    ]);

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/daily?days=7',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toBeDefined();
    expect(body.data[0].scans_completed).toBe(10);
    expect(body.data[0].predictions_accepted).toBe(5);
  });
});

describe('GET /ml/stats/models', () => {
  it('returns 403 for non-admin', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/models',
      headers: { authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns model stats for admin', async () => {
    mockGetModelStats.mockResolvedValue([
      {
        model_name: 'primary-classifier',
        total_scans: '50',
        predictions_accepted: '20',
        scans_failed: '3',
        avg_confidence: '0.72',
      },
    ]);

    const res = await server.inject({
      method: 'GET',
      url: '/ml/stats/models?days=30',
      headers: { authorization: `Bearer ${adminToken()}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toBeDefined();
    expect(body.data[0].model_name).toBe('primary-classifier');
    expect(body.data[0].total_scans).toBe(50);
    expect(body.data[0].avg_confidence).toBeCloseTo(0.72);
  });
});
