import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';

const { buildServer } = await setupCatalogTest();

// ─── Character Relationships ──────────────────────────────────────────

describe('character relationship routes', () => {
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

  const baseUrl = '/catalog/franchises/transformers/characters';

  describe('GET /:franchise/characters/:slug/relationships', () => {
    it('should return 200 with relationships array', async () => {
      // 1. characterExistsBySlug
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });
      // 2. getCharacterRelationships (UNION ALL)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            type: 'combiner-component',
            subtype: 'gestalt',
            role: 'combined_form',
            related_slug: 'devastator',
            related_name: 'Devastator',
            metadata: { group_name: 'Constructicons' },
          },
        ],
      });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/scrapper/relationships`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        relationships: Array<{
          type: string;
          subtype: string | null;
          role: string | null;
          related_character: { slug: string; name: string };
          metadata: Record<string, unknown>;
        }>;
      }>();
      expect(body.relationships).toHaveLength(1);
      expect(body.relationships[0]?.type).toBe('combiner-component');
      expect(body.relationships[0]?.subtype).toBe('gestalt');
      expect(body.relationships[0]?.role).toBe('combined_form');
      expect(body.relationships[0]?.related_character.slug).toBe('devastator');
      expect(body.relationships[0]?.related_character.name).toBe('Devastator');
      expect(body.relationships[0]?.metadata).toEqual({ group_name: 'Constructicons' });
    });

    it('should return empty array for character with no relationships', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/bumblebee/relationships`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ relationships: unknown[] }>();
      expect(body.relationships).toHaveLength(0);
    });

    it('should return 404 when character not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: false }] });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/nonexistent/relationships`,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('Character not found');
    });

    it('should return multiple relationships of different types', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            type: 'combiner-component',
            subtype: 'gestalt',
            role: 'component',
            related_slug: 'scrapper',
            related_name: 'Scrapper',
            metadata: {},
          },
          {
            type: 'combiner-component',
            subtype: 'gestalt',
            role: 'component',
            related_slug: 'hook',
            related_name: 'Hook',
            metadata: {},
          },
          {
            type: 'rival',
            subtype: null,
            role: null,
            related_slug: 'superion',
            related_name: 'Superion',
            metadata: {},
          },
        ],
      });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/devastator/relationships`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ relationships: Array<{ type: string }> }>();
      expect(body.relationships).toHaveLength(3);
      // Verify different types present
      const types = body.relationships.map((r) => r.type);
      expect(types).toContain('combiner-component');
      expect(types).toContain('rival');
    });

    it('should handle null subtype and role fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            type: 'rival',
            subtype: null,
            role: null,
            related_slug: 'megatron',
            related_name: 'Megatron',
            metadata: {},
          },
        ],
      });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/optimus-prime/relationships`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        relationships: Array<{ subtype: string | null; role: string | null }>;
      }>();
      expect(body.relationships[0]?.subtype).toBeNull();
      expect(body.relationships[0]?.role).toBeNull();
    });
  });
});

// ─── Item Relationships ───────────────────────────────────────────────

describe('item relationship routes', () => {
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

  const baseUrl = '/catalog/franchises/transformers/items';

  describe('GET /:franchise/items/:slug/relationships', () => {
    it('should return 200 with empty relationships (no data yet)', async () => {
      // 1. getItemIdBySlug
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
      // 2. getItemRelationships
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/mp-10-optimus-prime/relationships`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ relationships: unknown[] }>();
      expect(body.relationships).toHaveLength(0);
    });

    it('should return 404 when item not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/nonexistent/relationships`,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('Item not found');
    });

    it('should return relationships when data exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            type: 'mold-origin',
            subtype: null,
            role: 'retool',
            related_slug: 'mp-10b-dark-optimus',
            related_name: 'MP-10B Dark Optimus Prime',
            metadata: { notes: 'Black repaint' },
          },
        ],
      });

      const res = await server.inject({
        method: 'GET',
        url: `${baseUrl}/mp-10-optimus-prime/relationships`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        relationships: Array<{
          type: string;
          subtype: string | null;
          role: string | null;
          related_item: { slug: string; name: string };
          metadata: Record<string, unknown>;
        }>;
      }>();
      expect(body.relationships).toHaveLength(1);
      expect(body.relationships[0]?.type).toBe('mold-origin');
      expect(body.relationships[0]?.related_item.slug).toBe('mp-10b-dark-optimus');
      expect(body.relationships[0]?.related_item.name).toBe('MP-10B Dark Optimus Prime');
    });
  });
});
