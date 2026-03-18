import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';

const { buildServer } = await setupCatalogTest();

describe('manufacturer routes', () => {
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

  const mfrRow = {
    id: 'mfr-1',
    name: 'FansToys',
    slug: 'fanstoys',
    is_official_licensee: false,
    country: 'China',
    website_url: 'https://fanstoys.com',
    aliases: ['FT'],
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  describe('GET /catalog/manufacturers', () => {
    it('should return 200 with manufacturer list', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mfrRow] });
      const res = await server.inject({ method: 'GET', url: '/catalog/manufacturers' });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
    });
  });

  describe('GET /catalog/manufacturers/:slug', () => {
    it('should return 200 with manufacturer detail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mfrRow] });
      const res = await server.inject({ method: 'GET', url: '/catalog/manufacturers/fanstoys' });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ slug: string }>().slug).toBe('fanstoys');
    });

    it('should return 404 when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({ method: 'GET', url: '/catalog/manufacturers/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });
});
