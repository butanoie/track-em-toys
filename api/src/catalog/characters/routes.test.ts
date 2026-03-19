import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';
import { encodeCursor } from '../shared/pagination.js';

const { buildServer } = await setupCatalogTest();

describe('character routes (franchise-scoped)', () => {
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

  const charListRow = {
    id: 'c-1',
    name: 'Optimus Prime',
    slug: 'optimus-prime',
    franchise_slug: 'transformers',
    franchise_name: 'Transformers',
    faction_slug: 'autobot',
    faction_name: 'Autobot',
    continuity_family_slug: 'g1',
    continuity_family_name: 'Generation 1',
    character_type: 'Transformer',
    alt_mode: 'semi-truck',
    is_combined_form: false,
  };

  const charBaseRow = {
    ...charListRow,
    combiner_role: null,
    combined_form_id: null,
    combined_form_slug: null,
    combined_form_name: null,
    metadata: { japanese_name: 'コンボイ' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  // ─── List ─────────────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/characters', () => {
    it('should return 200 with paginated characters', async () => {
      // data query + count query in Promise.all
      mockQuery.mockResolvedValueOnce({ rows: [charListRow] }).mockResolvedValueOnce({ rows: [{ total_count: 1 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters?limit=20',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; next_cursor: string | null; total_count: number }>();
      expect(body.data).toHaveLength(1);
      expect(body.next_cursor).toBeNull();
      expect(body.total_count).toBe(1);
    });

    it('should return next_cursor when more results exist', async () => {
      const rows = [
        { ...charListRow, id: 'c-1', name: 'Alpha' },
        { ...charListRow, id: 'c-2', name: 'Beta' },
        { ...charListRow, id: 'c-3', name: 'Gamma' }, // limit+1 row
      ];
      mockQuery.mockResolvedValueOnce({ rows }).mockResolvedValueOnce({ rows: [{ total_count: 10 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters?limit=2',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; next_cursor: string; total_count: number }>();
      expect(body.data).toHaveLength(2);
      expect(body.next_cursor).toBeTruthy();
      expect(body.total_count).toBe(10);
    });

    it('should accept cursor parameter', async () => {
      const cursor = encodeCursor('Alpha', 'c-1');
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total_count: 0 }] });

      const res = await server.inject({
        method: 'GET',
        url: `/catalog/franchises/transformers/characters?cursor=${cursor}`,
      });
      expect(res.statusCode).toBe(200);
    });

    it('should return 400 for invalid cursor', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters?cursor=invalid!!!',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: string }>().error).toBe('Invalid cursor');
    });

    it('should return empty data for franchise with no characters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total_count: 0 }] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/gi-joe/characters',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ data: unknown[]; total_count: number }>();
      expect(body.data).toHaveLength(0);
      expect(body.total_count).toBe(0);
    });
  });

  // ─── Detail ───────────────────────────────────────────────────────

  describe('GET /catalog/franchises/:franchise/characters/:slug', () => {
    it('should return 200 with full character detail', async () => {
      // base query, then Promise.all([sub-groups, appearances, component_characters (skipped — not combined form)])
      mockQuery
        .mockResolvedValueOnce({ rows: [charBaseRow] })
        .mockResolvedValueOnce({ rows: [{ slug: 'dinobots', name: 'Dinobots' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'a-1',
              slug: 'g1-cartoon',
              name: 'G1 Cartoon',
              source_media: 'TV',
              source_name: 'The Transformers Season 1',
              year_start: 1984,
              year_end: 1985,
              description: null,
            },
          ],
        });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters/optimus-prime',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        name: string;
        franchise: { slug: string };
        sub_groups: Array<{ slug: string }>;
        appearances: Array<{ slug: string }>;
        metadata: Record<string, unknown>;
      }>();
      expect(body.name).toBe('Optimus Prime');
      expect(body.franchise.slug).toBe('transformers');
      expect(body.sub_groups).toHaveLength(1);
      expect(body.sub_groups[0]?.slug).toBe('dinobots');
      expect(body.appearances).toHaveLength(1);
      expect(body.metadata.japanese_name).toBe('コンボイ');
      expect(res.json<{ component_characters: unknown[] }>().component_characters).toEqual([]);
    });

    it('should return 404 when character not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters/nonexistent',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('Character not found');
    });

    it('should return 404 when character exists in different franchise', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/gi-joe/characters/optimus-prime',
      });
      expect(res.statusCode).toBe(404);
    });

    it('should handle character with null faction and no sub-groups', async () => {
      const noFactionRow = {
        ...charBaseRow,
        faction_slug: null,
        faction_name: null,
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [noFactionRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters/optimus-prime',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ faction: null; sub_groups: unknown[] }>();
      expect(body.faction).toBeNull();
      expect(body.sub_groups).toHaveLength(0);
    });

    it('should include component_characters when character is a combined form', async () => {
      const gestaltRow = {
        ...charBaseRow,
        name: 'Devastator',
        slug: 'devastator',
        is_combined_form: true,
      };
      const components = [
        { slug: 'bonecrusher', name: 'Bonecrusher', combiner_role: 'left arm', alt_mode: 'bulldozer' },
        { slug: 'mixmaster', name: 'Mixmaster', combiner_role: 'left leg', alt_mode: 'cement mixer' },
        { slug: 'scrapper', name: 'Scrapper', combiner_role: 'right leg', alt_mode: 'front-end loader' },
      ];
      mockQuery
        .mockResolvedValueOnce({ rows: [gestaltRow] })
        .mockResolvedValueOnce({ rows: [] }) // sub-groups
        .mockResolvedValueOnce({ rows: [] }) // appearances
        .mockResolvedValueOnce({ rows: components }); // component characters

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters/devastator',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        is_combined_form: boolean;
        component_characters: Array<{ slug: string; name: string; combiner_role: string; alt_mode: string }>;
      }>();
      expect(body.is_combined_form).toBe(true);
      expect(body.component_characters).toHaveLength(3);
      expect(body.component_characters[0]).toEqual({
        slug: 'bonecrusher',
        name: 'Bonecrusher',
        combiner_role: 'left arm',
        alt_mode: 'bulldozer',
      });
    });

    it('should include combined_form when character is a combiner component', async () => {
      const componentRow = {
        ...charBaseRow,
        name: 'Scrapper',
        slug: 'scrapper',
        combiner_role: 'right leg',
        combined_form_slug: 'devastator',
        combined_form_name: 'Devastator',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [componentRow] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: '/catalog/franchises/transformers/characters/scrapper',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ combiner_role: string; combined_form: { slug: string } }>();
      expect(body.combiner_role).toBe('right leg');
      expect(body.combined_form).toEqual({ slug: 'devastator', name: 'Devastator' });
    });
  });
});
