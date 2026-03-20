import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
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

vi.mock('../../config.js', () => ({
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
    photos: {
      storagePath: '/tmp/trackem-test-photos',
      baseUrl: 'http://localhost:3010/photos',
      maxSizeMb: 10,
    },
  },
}));

const mockQuery = vi.fn();
vi.mock('../../db/pool.js', () => ({
  pool: { query: mockQuery, connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}));

// Mock auth dependencies so buildServer doesn't fail
vi.mock('../../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}));

const { buildServer } = await import('../../server.js');

describe('franchise routes', () => {
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

  const franchiseRow = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    slug: 'transformers',
    name: 'Transformers',
    sort_order: 1,
    notes: 'Robots in disguise',
    created_at: '2026-01-01T00:00:00Z',
  };

  describe('GET /catalog/franchises', () => {
    it('should return 200 with franchise list', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [franchiseRow] });

      const res = await server.inject({ method: 'GET', url: '/catalog/franchises' });
      expect(res.statusCode).toBe(200);

      const body = res.json<{ data: (typeof franchiseRow)[] }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.slug).toBe('transformers');
    });

    it('should return 200 with empty array when no franchises exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({ method: 'GET', url: '/catalog/franchises' });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
    });
  });

  describe('GET /catalog/franchises/:slug', () => {
    it('should return 200 with franchise detail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [franchiseRow] });

      const res = await server.inject({ method: 'GET', url: '/catalog/franchises/transformers' });
      expect(res.statusCode).toBe(200);
      expect(res.json<typeof franchiseRow>().slug).toBe('transformers');
    });

    it('should return 404 when franchise not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({ method: 'GET', url: '/catalog/franchises/nonexistent' });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('Franchise not found');
    });
  });

  describe('GET /catalog/franchises/stats', () => {
    const statsRow = {
      slug: 'transformers',
      name: 'Transformers',
      sort_order: 1,
      notes: 'Robots in disguise',
      item_count: 42,
      continuity_family_count: 3,
      manufacturer_count: 5,
    };

    it('should return 200 with franchise stats', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [statsRow] });

      const res = await server.inject({ method: 'GET', url: '/catalog/franchises/stats' });
      expect(res.statusCode).toBe(200);

      const body = res.json<{ data: (typeof statsRow)[] }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toBeDefined();
      expect(body.data[0]!.slug).toBe('transformers');
      expect(body.data[0]!.item_count).toBe(42);
      expect(body.data[0]!.continuity_family_count).toBe(3);
      expect(body.data[0]!.manufacturer_count).toBe(5);
    });

    it('should return 200 with empty array when no franchises exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({ method: 'GET', url: '/catalog/franchises/stats' });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
    });
  });
});
