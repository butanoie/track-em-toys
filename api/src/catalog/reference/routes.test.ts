import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';

const { buildServer } = await setupCatalogTest();

describe('reference routes (franchise-scoped)', () => {
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

  const factionRow = {
    id: 'f-1',
    name: 'Autobot',
    slug: 'autobot',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
  };

  const subGroupRow = {
    id: 'sg-1',
    name: 'Dinobots',
    slug: 'dinobots',
    faction_slug: 'autobot',
    faction_name: 'Autobot',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
  };

  const cfRow = {
    id: 'cf-1',
    slug: 'g1',
    name: 'Generation 1',
    sort_order: 1,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
  };

  // ─── Factions ───────────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/factions', () => {
    it('should return 200 with faction list', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [factionRow] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/factions',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
    });

    it('should return empty array for franchise with no factions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/gi-joe/factions',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
    });
  });

  describe('GET /catalog/franchises/:franchise/factions/:slug', () => {
    it('should return 200 with faction detail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [factionRow] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/factions/autobot',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ slug: string }>().slug).toBe('autobot');
    });

    it('should return 404 when faction not found in franchise', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/gi-joe/factions/autobot',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('Faction not found');
    });
  });

  // ─── Sub-Groups ─────────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/sub-groups', () => {
    it('should return 200 with formatted sub-groups', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [subGroupRow] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/sub-groups',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: Array<{ faction: { slug: string } | null }> }>();
      expect(body.data[0]?.faction).toEqual({ slug: 'autobot', name: 'Autobot' });
    });
  });

  describe('GET /catalog/franchises/:franchise/sub-groups/:slug', () => {
    it('should return 200 with sub-group detail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [subGroupRow] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/sub-groups/dinobots',
      });
      expect(res.statusCode).toBe(200);
    });

    it('should return 404 when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/sub-groups/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return null faction when sub-group has no faction', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...subGroupRow, faction_slug: null, faction_name: null }],
      });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/sub-groups/dinobots',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ faction: null }>().faction).toBeNull();
    });
  });

  // ─── Continuity Families ────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/continuity-families', () => {
    it('should return 200 with continuity families', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [cfRow] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/continuity-families',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
    });
  });

  describe('GET /catalog/franchises/:franchise/continuity-families/:slug', () => {
    it('should return 200 with detail', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [cfRow] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/continuity-families/g1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ slug: string }>().slug).toBe('g1');
    });

    it('should return 404 when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/continuity-families/nonexistent',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
