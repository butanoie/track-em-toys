import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';

const { buildServer } = await setupCatalogTest();

describe('search routes', () => {
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

  const searchResult = {
    entity_type: 'character',
    id: 'c-1',
    name: 'Optimus Prime',
    slug: 'optimus-prime',
    franchise_slug: 'transformers',
    franchise_name: 'Transformers',
    rank: 0.0607927,
    character_slug: null,
    character_name: null,
    manufacturer_slug: null,
    manufacturer_name: null,
    toy_line_slug: null,
    toy_line_name: null,
    size_class: null,
    year_released: null,
    is_third_party: null,
    data_quality: null,
  };

  const itemSearchResult = {
    entity_type: 'item',
    id: 'i-1',
    name: 'MP-44 Optimus Prime',
    slug: 'mp-44-optimus-prime',
    franchise_slug: 'transformers',
    franchise_name: 'Transformers',
    rank: 0.0607927,
    character_slug: 'optimus-prime',
    character_name: 'Optimus Prime',
    manufacturer_slug: 'takara-tomy',
    manufacturer_name: 'Takara Tomy',
    toy_line_slug: 'masterpiece',
    toy_line_name: 'Masterpiece',
    size_class: 'Leader',
    year_released: 2019,
    is_third_party: false,
    data_quality: 'verified',
  };

  describe('GET /catalog/search', () => {
    it('should return 200 with search results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [searchResult] }).mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search?q=optimus',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        data: Array<{ entity_type: string; franchise: { slug: string } }>;
        page: number;
        limit: number;
        total_count: number;
      }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.entity_type).toBe('character');
      expect(body.data[0]?.franchise.slug).toBe('transformers');
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.total_count).toBe(1);
    });

    it('should support franchise filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total_count: 0 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search?q=optimus&franchise=transformers',
      });
      expect(res.statusCode).toBe(200);

      // Verify franchise slug was passed to the query
      const firstCallArgs = mockQuery.mock.calls[0];
      expect(firstCallArgs).toBeDefined();
      expect(firstCallArgs![1]).toContain('transformers');
    });

    it('should support pagination params', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total_count: 0 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search?q=test&page=3&limit=5',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ page: number; limit: number }>();
      expect(body.page).toBe(3);
      expect(body.limit).toBe(5);
    });

    it('should return 400 when q is missing', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search',
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return empty results for no matches', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total_count: 0 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search?q=zzzznonexistent',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; total_count: number }>();
      expect(body.data).toHaveLength(0);
      expect(body.total_count).toBe(0);
    });

    it('should return enriched fields for item results', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [itemSearchResult] })
        .mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search?q=mp-44',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        data: Array<{
          entity_type: string;
          manufacturer: { slug: string; name: string } | null;
          toy_line: { slug: string; name: string } | null;
          character: { slug: string; name: string } | null;
          size_class: string | null;
          year_released: number | null;
          is_third_party: boolean | null;
          data_quality: string | null;
        }>;
      }>();
      expect(body.data).toHaveLength(1);
      const item = body.data[0];
      expect(item).toBeDefined();
      expect(item!.entity_type).toBe('item');
      expect(item!.manufacturer).toEqual({ slug: 'takara-tomy', name: 'Takara Tomy' });
      expect(item!.toy_line).toEqual({ slug: 'masterpiece', name: 'Masterpiece' });
      expect(item!.character).toEqual({ slug: 'optimus-prime', name: 'Optimus Prime' });
      expect(item!.size_class).toBe('Leader');
      expect(item!.year_released).toBe(2019);
      expect(item!.is_third_party).toBe(false);
      expect(item!.data_quality).toBe('verified');
    });

    it('should return null enrichment fields for character results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [searchResult] }).mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search?q=optimus',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        data: Array<{
          entity_type: string;
          manufacturer: { slug: string; name: string } | null;
          toy_line: { slug: string; name: string } | null;
          character: { slug: string; name: string } | null;
        }>;
      }>();
      expect(body.data).toHaveLength(1);
      const char = body.data[0];
      expect(char).toBeDefined();
      expect(char!.entity_type).toBe('character');
      expect(char!.manufacturer).toBeNull();
      expect(char!.toy_line).toBeNull();
      expect(char!.character).toBeNull();
    });

    it('should return empty results for punctuation-only query', async () => {
      // buildSearchTsquery returns null for '!!!' → empty results without hitting DB
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/search?q=!!!',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; total_count: number }>();
      expect(body.data).toHaveLength(0);
      expect(body.total_count).toBe(0);
      // Should NOT have called pool.query at all
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
