import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';

const { buildServer } = await setupCatalogTest();

describe('item routes (franchise-scoped)', () => {
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

  const itemListRow = {
    id: 'i-1',
    name: 'FT-44 Thomas',
    slug: 'ft-44-thomas',
    franchise_slug: 'transformers',
    franchise_name: 'Transformers',
    character_slug: 'optimus-prime',
    character_name: 'Optimus Prime',
    manufacturer_slug: 'fanstoys',
    manufacturer_name: 'FansToys',
    toy_line_slug: 'fans-toys-masterpiece',
    toy_line_name: 'FansToys Masterpiece',
    size_class: 'Leader',
    year_released: 2023,
    is_third_party: true,
    data_quality: 'verified',
  };

  const itemBaseRow = {
    ...itemListRow,
    appearance_slug: 'g1-cartoon',
    appearance_name: 'G1 Cartoon',
    appearance_source_media: 'TV',
    appearance_source_name: 'The Transformers',
    description: 'Third-party Optimus Prime',
    barcode: null,
    sku: null,
    product_code: 'FT-44',
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  // ─── List ─────────────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/items', () => {
    it('should return 200 with paginated items', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [itemListRow] }).mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ character: { slug: string } }>; total_count: number }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.character.slug).toBe('optimus-prime');
      expect(body.total_count).toBe(1);
    });

    it('should return next_cursor when more results exist', async () => {
      const rows = [
        { ...itemListRow, id: 'i-1', name: 'Alpha' },
        { ...itemListRow, id: 'i-2', name: 'Beta' },
        { ...itemListRow, id: 'i-3', name: 'Gamma' },
      ];
      mockQuery.mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [{ total_count: 50 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items?limit=2',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; next_cursor: string }>();
      expect(body.data).toHaveLength(2);
      expect(body.next_cursor).toBeTruthy();
    });

    it('should return 400 for invalid cursor', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items?cursor=bad',
      });
      expect(res.statusCode).toBe(400);
    });

    it('should handle null manufacturer', async () => {
      const noMfr = { ...itemListRow, manufacturer_slug: null, manufacturer_name: null };
      mockQuery.mockResolvedValueOnce({ rows: [noMfr] }).mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ manufacturer: null }> }>();
      expect(body.data[0]?.manufacturer).toBeNull();
    });
  });

  // ─── Detail ───────────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/items/:slug', () => {
    it('should return 200 with full item detail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [itemBaseRow] }).mockResolvedValueOnce({
        rows: [
          { id: 'p-1', url: 'https://img.example.com/ft44.jpg', caption: 'Box art', is_primary: true, sort_order: 1 },
        ],
      });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items/ft-44-thomas',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        name: string;
        product_code: string;
        appearance: { slug: string };
        photos: Array<{ is_primary: boolean }>;
      }>();
      expect(body.name).toBe('FT-44 Thomas');
      expect(body.product_code).toBe('FT-44');
      expect(body.appearance?.slug).toBe('g1-cartoon');
      expect(body.photos).toHaveLength(1);
      expect(body.photos[0]?.is_primary).toBe(true);
    });

    it('should return 404 when item not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });

    it('should handle null appearance', async () => {
      const noAppearance = {
        ...itemBaseRow,
        appearance_slug: null,
        appearance_name: null,
        appearance_source_media: null,
        appearance_source_name: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [noAppearance] }).mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items/ft-44-thomas',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ appearance: null }>().appearance).toBeNull();
    });
  });

  // ─── Filtered List ──────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/items (with filters)', () => {
    it('should return filtered items by manufacturer', async () => {
      const filteredRow = { ...itemListRow, manufacturer_slug: 'hasbro', manufacturer_name: 'Hasbro' };
      mockQuery.mockResolvedValueOnce({ rows: [filteredRow] }).mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items?manufacturer=hasbro',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ manufacturer: { slug: string } }>; total_count: number }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toBeDefined();
      expect(body.data[0]!.manufacturer).toBeDefined();
      expect(body.data[0]!.manufacturer!.slug).toBe('hasbro');
      expect(body.total_count).toBe(1);
    });

    it('should return filtered items by is_third_party', async () => {
      const officialRow = { ...itemListRow, is_third_party: false };
      mockQuery.mockResolvedValueOnce({ rows: [officialRow] }).mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items?is_third_party=false',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ is_third_party: boolean }>; total_count: number }>();
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toBeDefined();
      expect(body.data[0]!.is_third_party).toBe(false);
    });
  });

  // ─── Facets ─────────────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/items/facets', () => {
    it('should return 200 with facet counts', async () => {
      // 5 parallel queries: manufacturers, size_classes, toy_lines, continuity_families, is_third_party
      mockQuery
        .mockResolvedValueOnce({ rows: [{ value: 'hasbro', label: 'Hasbro', count: 10 }] })
        .mockResolvedValueOnce({ rows: [{ value: 'Leader', label: 'Leader', count: 5 }] })
        .mockResolvedValueOnce({ rows: [{ value: 'generations', label: 'Generations', count: 8 }] })
        .mockResolvedValueOnce({ rows: [{ value: 'g1', label: 'Generation 1', count: 12 }] })
        .mockResolvedValueOnce({
          rows: [
            { value: 'false', label: 'Official', count: 7 },
            { value: 'true', label: 'Third Party', count: 3 },
          ],
        });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/items/facets',
      });
      expect(res.statusCode).toBe(200);

      const body = res.json<{
        manufacturers: Array<{ value: string; label: string; count: number }>;
        size_classes: Array<{ value: string; label: string; count: number }>;
        toy_lines: Array<{ value: string; label: string; count: number }>;
        continuity_families: Array<{ value: string; label: string; count: number }>;
        is_third_party: Array<{ value: string; label: string; count: number }>;
      }>();

      expect(body.manufacturers).toHaveLength(1);
      expect(body.manufacturers[0]).toBeDefined();
      expect(body.manufacturers[0]!.value).toBe('hasbro');
      expect(body.manufacturers[0]!.count).toBe(10);

      expect(body.size_classes).toHaveLength(1);
      expect(body.size_classes[0]).toBeDefined();
      expect(body.size_classes[0]!.value).toBe('Leader');

      expect(body.toy_lines).toHaveLength(1);
      expect(body.toy_lines[0]).toBeDefined();
      expect(body.toy_lines[0]!.value).toBe('generations');

      expect(body.continuity_families).toHaveLength(1);
      expect(body.continuity_families[0]).toBeDefined();
      expect(body.continuity_families[0]!.value).toBe('g1');

      expect(body.is_third_party).toHaveLength(2);
    });

    it('should return 200 with empty arrays for franchise with no items', async () => {
      // 5 parallel queries all returning empty
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/empty-franchise/items/facets',
      });
      expect(res.statusCode).toBe(200);

      const body = res.json<{
        manufacturers: unknown[];
        size_classes: unknown[];
        toy_lines: unknown[];
        continuity_families: unknown[];
        is_third_party: unknown[];
      }>();

      expect(body.manufacturers).toHaveLength(0);
      expect(body.size_classes).toHaveLength(0);
      expect(body.toy_lines).toHaveLength(0);
      expect(body.continuity_families).toHaveLength(0);
      expect(body.is_third_party).toHaveLength(0);
    });
  });
});
