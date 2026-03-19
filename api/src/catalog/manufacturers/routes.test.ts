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

  describe('GET /catalog/manufacturers/stats', () => {
    it('should return 200 with manufacturer stats', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            slug: 'hasbro',
            name: 'Hasbro',
            is_official_licensee: true,
            country: 'United States',
            item_count: 42,
            toy_line_count: 5,
            franchise_count: 2,
          },
        ],
      });
      const res = await server.inject({ method: 'GET', url: '/catalog/manufacturers/stats' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ slug: string; item_count: number }> }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.slug).toBe('hasbro');
      expect(body.data[0]?.item_count).toBe(42);
    });
  });

  describe('GET /catalog/manufacturers/:slug/items', () => {
    const itemRow = {
      id: 'item-1',
      name: 'MP-44 Optimus Prime',
      slug: 'mp-44-optimus-prime',
      franchise_slug: 'transformers',
      franchise_name: 'Transformers',
      character_slug: 'optimus-prime',
      character_name: 'Optimus Prime',
      manufacturer_slug: 'fanstoys',
      manufacturer_name: 'FansToys',
      toy_line_slug: 'masterpiece',
      toy_line_name: 'Masterpiece',
      size_class: 'Leader',
      year_released: 2019,
      is_third_party: false,
      data_quality: 'verified',
    };

    it('should return 200 with paginated items', async () => {
      // First call: manufacturer exists check
      mockQuery.mockResolvedValueOnce({ rows: [mfrRow] });
      // Second call: data query
      mockQuery.mockResolvedValueOnce({ rows: [itemRow] });
      // Third call: count query
      mockQuery.mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/manufacturers/fanstoys/items',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; total_count: number; next_cursor: string | null }>();
      expect(body.data).toHaveLength(1);
      expect(body.total_count).toBe(1);
      expect(body.next_cursor).toBeNull();
    });

    it('should return 404 when manufacturer not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/manufacturers/nonexistent/items',
      });
      expect(res.statusCode).toBe(404);
    });

    it('should apply franchise filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mfrRow] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total_count: 0 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/manufacturers/fanstoys/items?franchise=transformers',
      });
      expect(res.statusCode).toBe(200);
      // Verify the franchise filter was passed (second call includes fr.slug in WHERE)
      const dataCallArgs = mockQuery.mock.calls[1];
      expect(dataCallArgs).toBeDefined();
      expect(dataCallArgs![0]).toContain('fr.slug');
    });
  });

  describe('GET /catalog/manufacturers/:slug/items/facets', () => {
    it('should return 200 with facet counts', async () => {
      // First call: manufacturer exists check
      mockQuery.mockResolvedValueOnce({ rows: [mfrRow] });
      // 5 parallel facet queries
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'transformers', label: 'Transformers', count: 10 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'Leader', label: 'Leader', count: 5 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'masterpiece', label: 'Masterpiece', count: 8 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'g1', label: 'Generation 1', count: 7 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ value: 'false', label: 'Official', count: 10 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/manufacturers/fanstoys/items/facets',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        franchises: unknown[];
        size_classes: unknown[];
        toy_lines: unknown[];
        continuity_families: unknown[];
        is_third_party: unknown[];
      }>();
      expect(body.franchises).toHaveLength(1);
      expect(body.size_classes).toHaveLength(1);
      expect(body.toy_lines).toHaveLength(1);
      expect(body.continuity_families).toHaveLength(1);
      expect(body.is_third_party).toHaveLength(1);
    });

    it('should return 404 when manufacturer not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/manufacturers/nonexistent/items/facets',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
