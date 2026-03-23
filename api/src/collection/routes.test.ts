/**
 * Integration tests for collection routes.
 *
 * Strategy: build a real Fastify server via buildServer() and use
 * fastify.inject() to exercise the full request/response pipeline including
 * schema validation, JWT signing, and role-based access control.
 *
 * External dependencies are mocked at the module boundary:
 *   - db/pool (withTransaction) — passthrough to the callback with a fake client
 *   - collection/queries — all query functions
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../db/pool.js';

// ─── Generate a real EC key pair before vi.mock() hoisting ───────────────────
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

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('../config.js', () => ({
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
    ml: {
      exportPath: '/tmp/trackem-test-ml-export',
    },
  },
}));

vi.mock('../db/pool.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}));

vi.mock('../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}));

vi.mock('./queries.js', () => ({
  listCollectionItems: vi.fn(),
  getCollectionItemById: vi.fn(),
  lockCollectionItem: vi.fn(),
  itemExists: vi.fn(),
  insertCollectionItem: vi.fn(),
  getCollectionStats: vi.fn(),
  checkCollectionItems: vi.fn(),
  updateCollectionItem: vi.fn(),
  softDeleteCollectionItem: vi.fn(),
  restoreCollectionItem: vi.fn(),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { buildServer } from '../server.js';
import * as pool from '../db/pool.js';
import * as queries from './queries.js';
import type { CollectionListRow } from './queries.js';

// ─── Fixture data ────────────────────────────────────────────────────────────

const USER_A_UUID = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const USER_B_UUID = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
const ITEM_UUID = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
const COLLECTION_UUID = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4';
const COLLECTION_UUID_2 = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5';

function makeCollectionRow(overrides: Partial<CollectionListRow> = {}): CollectionListRow {
  return {
    id: COLLECTION_UUID,
    name: 'Optimus Prime',
    item_id: ITEM_UUID,
    item_name: 'Optimus Prime',
    item_slug: 'optimus-prime',
    franchise_slug: 'transformers',
    franchise_name: 'Transformers',
    manufacturer_slug: 'hasbro',
    manufacturer_name: 'Hasbro',
    toy_line_slug: 'generations',
    toy_line_name: 'Generations',
    thumbnail_url: null,
    condition: 'mint_sealed',
    notes: null,
    deleted_at: null,
    created_at: '2026-03-22T00:00:00Z',
    updated_at: '2026-03-22T00:00:00Z',
    ...overrides,
  };
}

// ─── withTransaction passthrough ─────────────────────────────────────────────

const fakeClient = {} satisfies Pick<PoolClient, never>;

function mockTx() {
  vi.mocked(pool.withTransaction).mockImplementation(async (fn, _userId) => fn(fakeClient as PoolClient));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('collection routes', () => {
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

  function userToken(sub: string = USER_A_UUID): string {
    return server.jwt.sign({ sub, role: 'user' });
  }

  function authHeaders(sub?: string) {
    return { authorization: `Bearer ${userToken(sub)}` };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /collection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /collection', () => {
    it('should return 200 with empty list', async () => {
      mockTx();
      vi.mocked(queries.listCollectionItems).mockResolvedValue({ rows: [], totalCount: 0 });

      const res = await server.inject({
        method: 'GET',
        url: '/collection',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data).toEqual([]);
      expect(json.next_cursor).toBeNull();
      expect(json.total_count).toBe(0);
    });

    it('should return 200 with formatted items', async () => {
      mockTx();
      const row = makeCollectionRow();
      vi.mocked(queries.listCollectionItems).mockResolvedValue({ rows: [row], totalCount: 1 });

      const res = await server.inject({
        method: 'GET',
        url: '/collection',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(COLLECTION_UUID);
      expect(json.data[0].franchise).toEqual({ slug: 'transformers', name: 'Transformers' });
      expect(json.data[0].manufacturer).toEqual({ slug: 'hasbro', name: 'Hasbro' });
      expect(json.data[0].condition).toBe('mint_sealed');
    });

    it('should pass franchise filter to query', async () => {
      mockTx();
      vi.mocked(queries.listCollectionItems).mockResolvedValue({ rows: [], totalCount: 0 });

      await server.inject({
        method: 'GET',
        url: '/collection?franchise=transformers',
        headers: authHeaders(),
      });

      expect(vi.mocked(queries.listCollectionItems)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({ franchise: 'transformers' })
      );
    });

    it('should pass condition filter to query', async () => {
      mockTx();
      vi.mocked(queries.listCollectionItems).mockResolvedValue({ rows: [], totalCount: 0 });

      await server.inject({
        method: 'GET',
        url: '/collection?condition=damaged',
        headers: authHeaders(),
      });

      expect(vi.mocked(queries.listCollectionItems)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({ condition: 'damaged' })
      );
    });

    it('should handle null manufacturer correctly', async () => {
      mockTx();
      const row = makeCollectionRow({ manufacturer_slug: null, manufacturer_name: null });
      vi.mocked(queries.listCollectionItems).mockResolvedValue({ rows: [row], totalCount: 1 });

      const res = await server.inject({
        method: 'GET',
        url: '/collection',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].manufacturer).toBeNull();
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({ method: 'GET', url: '/collection' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /collection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /collection', () => {
    it('should return 201 with defaults when only item_id provided', async () => {
      mockTx();
      vi.mocked(queries.itemExists).mockResolvedValue(true);
      vi.mocked(queries.insertCollectionItem).mockResolvedValue(COLLECTION_UUID);
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(makeCollectionRow({ condition: 'unknown' }));

      const res = await server.inject({
        method: 'POST',
        url: '/collection',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { item_id: ITEM_UUID },
      });

      expect(res.statusCode).toBe(201);
      expect(vi.mocked(queries.insertCollectionItem)).toHaveBeenCalledWith(
        fakeClient,
        USER_A_UUID,
        ITEM_UUID,
        'unknown',
        null
      );
    });

    it('should return 201 with condition and notes', async () => {
      mockTx();
      vi.mocked(queries.itemExists).mockResolvedValue(true);
      vi.mocked(queries.insertCollectionItem).mockResolvedValue(COLLECTION_UUID);
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(
        makeCollectionRow({ condition: 'opened_complete', notes: 'Great condition' })
      );

      const res = await server.inject({
        method: 'POST',
        url: '/collection',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { item_id: ITEM_UUID, condition: 'opened_complete', notes: 'Great condition' },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.condition).toBe('opened_complete');
      expect(json.notes).toBe('Great condition');
    });

    it('should return 404 when item does not exist', async () => {
      mockTx();
      vi.mocked(queries.itemExists).mockResolvedValue(false);

      const res = await server.inject({
        method: 'POST',
        url: '/collection',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { item_id: ITEM_UUID },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 when item_id is missing', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/collection',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for invalid condition value', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/collection',
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { item_id: ITEM_UUID, condition: 'invalid_condition' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/collection',
        headers: { 'content-type': 'application/json' },
        payload: { item_id: ITEM_UUID },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 415 for wrong content-type', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/collection',
        headers: { ...authHeaders(), 'content-type': 'text/plain' },
        payload: 'invalid',
      });

      expect(res.statusCode).toBe(415);
    });

    it('should allow multiple copies of the same item', async () => {
      mockTx();
      vi.mocked(queries.itemExists).mockResolvedValue(true);
      vi.mocked(queries.insertCollectionItem)
        .mockResolvedValueOnce(COLLECTION_UUID)
        .mockResolvedValueOnce(COLLECTION_UUID_2);
      vi.mocked(queries.getCollectionItemById)
        .mockResolvedValueOnce(makeCollectionRow())
        .mockResolvedValueOnce(makeCollectionRow({ id: COLLECTION_UUID_2 }));

      const payload = { item_id: ITEM_UUID };
      const headers = { ...authHeaders(), 'content-type': 'application/json' };

      const res1 = await server.inject({ method: 'POST', url: '/collection', headers, payload });
      const res2 = await server.inject({ method: 'POST', url: '/collection', headers, payload });

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);
      expect(res1.json().id).not.toBe(res2.json().id);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /collection/stats
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /collection/stats', () => {
    it('should return 200 with stats', async () => {
      mockTx();
      vi.mocked(queries.getCollectionStats).mockResolvedValue({
        total_copies: 5,
        unique_items: 3,
        by_franchise: [{ slug: 'transformers', name: 'Transformers', count: 5 }],
        by_condition: [
          { condition: 'mint_sealed', count: 3 },
          { condition: 'unknown', count: 2 },
        ],
      });

      const res = await server.inject({
        method: 'GET',
        url: '/collection/stats',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.total_copies).toBe(5);
      expect(json.unique_items).toBe(3);
      expect(json.by_franchise).toHaveLength(1);
      expect(json.by_condition).toHaveLength(2);
    });

    it('should return empty stats for empty collection', async () => {
      mockTx();
      vi.mocked(queries.getCollectionStats).mockResolvedValue({
        total_copies: 0,
        unique_items: 0,
        by_franchise: [],
        by_condition: [],
      });

      const res = await server.inject({
        method: 'GET',
        url: '/collection/stats',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.total_copies).toBe(0);
      expect(json.by_franchise).toEqual([]);
      expect(json.by_condition).toEqual([]);
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({ method: 'GET', url: '/collection/stats' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /collection/check
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /collection/check', () => {
    it('should return 200 with owned and not-owned items', async () => {
      mockTx();
      const notOwnedId = 'f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6';
      vi.mocked(queries.checkCollectionItems).mockResolvedValue([
        { item_id: ITEM_UUID, count: 2, collection_ids: [COLLECTION_UUID, COLLECTION_UUID_2] },
      ]);

      const res = await server.inject({
        method: 'GET',
        url: `/collection/check?itemIds=${ITEM_UUID},${notOwnedId}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.items[ITEM_UUID].count).toBe(2);
      expect(json.items[ITEM_UUID].collection_ids).toHaveLength(2);
      expect(json.items[notOwnedId].count).toBe(0);
      expect(json.items[notOwnedId].collection_ids).toEqual([]);
    });

    it('should return 400 for more than 50 item IDs', async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`).join(
        ','
      );

      const res = await server.inject({
        method: 'GET',
        url: `/collection/check?itemIds=${ids}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for invalid UUID', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/collection/check?itemIds=not-a-uuid',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for empty itemIds', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/collection/check?itemIds=',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should handle trailing comma gracefully', async () => {
      mockTx();
      vi.mocked(queries.checkCollectionItems).mockResolvedValue([]);

      const res = await server.inject({
        method: 'GET',
        url: `/collection/check?itemIds=${ITEM_UUID},`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(queries.checkCollectionItems)).toHaveBeenCalledWith(fakeClient, [ITEM_UUID]);
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/collection/check?itemIds=${ITEM_UUID}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /collection/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /collection/:id', () => {
    it('should return 200 for active item', async () => {
      mockTx();
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(makeCollectionRow());

      const res = await server.inject({
        method: 'GET',
        url: `/collection/${COLLECTION_UUID}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(COLLECTION_UUID);
    });

    it('should return 404 for non-existent item', async () => {
      mockTx();
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(null);

      const res = await server.inject({
        method: 'GET',
        url: `/collection/${COLLECTION_UUID}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for soft-deleted item', async () => {
      mockTx();
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(
        makeCollectionRow({ deleted_at: '2026-03-22T00:00:00Z' })
      );

      const res = await server.inject({
        method: 'GET',
        url: `/collection/${COLLECTION_UUID}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for non-UUID id', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/collection/not-a-uuid',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/collection/${COLLECTION_UUID}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 404 for another user (RLS isolation)', async () => {
      mockTx();
      // RLS hides other users' rows — getCollectionItemById returns null
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(null);

      const res = await server.inject({
        method: 'GET',
        url: `/collection/${COLLECTION_UUID}`,
        headers: authHeaders(USER_B_UUID),
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /collection/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('PATCH /collection/:id', () => {
    it('should return 200 when updating condition', async () => {
      mockTx();
      vi.mocked(queries.lockCollectionItem).mockResolvedValue({ id: COLLECTION_UUID, deleted_at: null });
      vi.mocked(queries.updateCollectionItem).mockResolvedValue(true);
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(makeCollectionRow({ condition: 'damaged' }));

      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { condition: 'damaged' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().condition).toBe('damaged');
    });

    it('should return 200 when updating notes', async () => {
      mockTx();
      vi.mocked(queries.lockCollectionItem).mockResolvedValue({ id: COLLECTION_UUID, deleted_at: null });
      vi.mocked(queries.updateCollectionItem).mockResolvedValue(true);
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(makeCollectionRow({ notes: 'Updated notes' }));

      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { notes: 'Updated notes' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBe('Updated notes');
    });

    it('should return 200 when clearing notes with null', async () => {
      mockTx();
      vi.mocked(queries.lockCollectionItem).mockResolvedValue({ id: COLLECTION_UUID, deleted_at: null });
      vi.mocked(queries.updateCollectionItem).mockResolvedValue(true);
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(makeCollectionRow({ notes: null }));

      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { notes: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBeNull();
    });

    it('should return 400 for empty body', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for soft-deleted item', async () => {
      mockTx();
      vi.mocked(queries.lockCollectionItem).mockResolvedValue({
        id: COLLECTION_UUID,
        deleted_at: '2026-03-22T00:00:00Z',
      });

      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { condition: 'damaged' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for non-existent item', async () => {
      mockTx();
      vi.mocked(queries.lockCollectionItem).mockResolvedValue(null);

      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { condition: 'damaged' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { 'content-type': 'application/json' },
        payload: { condition: 'damaged' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 415 for wrong content-type', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'text/plain' },
        payload: 'invalid',
      });

      expect(res.statusCode).toBe(415);
    });

    it('should return 500 if update affected 0 rows unexpectedly', async () => {
      mockTx();
      vi.mocked(queries.lockCollectionItem).mockResolvedValue({ id: COLLECTION_UUID, deleted_at: null });
      vi.mocked(queries.updateCollectionItem).mockResolvedValue(false);

      const res = await server.inject({
        method: 'PATCH',
        url: `/collection/${COLLECTION_UUID}`,
        headers: { ...authHeaders(), 'content-type': 'application/json' },
        payload: { condition: 'damaged' },
      });

      expect(res.statusCode).toBe(500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /collection/:id
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /collection/:id', () => {
    it('should return 204 on success', async () => {
      mockTx();
      vi.mocked(queries.softDeleteCollectionItem).mockResolvedValue(true);

      const res = await server.inject({
        method: 'DELETE',
        url: `/collection/${COLLECTION_UUID}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(204);
    });

    it('should return 404 for non-existent item', async () => {
      mockTx();
      vi.mocked(queries.softDeleteCollectionItem).mockResolvedValue(false);

      const res = await server.inject({
        method: 'DELETE',
        url: `/collection/${COLLECTION_UUID}`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for non-UUID id', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/collection/not-a-uuid',
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: `/collection/${COLLECTION_UUID}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /collection/:id/restore
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /collection/:id/restore', () => {
    it('should return 200 when restoring soft-deleted item', async () => {
      mockTx();
      vi.mocked(queries.restoreCollectionItem).mockResolvedValue(true);
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(makeCollectionRow());

      const res = await server.inject({
        method: 'POST',
        url: `/collection/${COLLECTION_UUID}/restore`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(COLLECTION_UUID);
    });

    it('should return 200 idempotently for already-active item', async () => {
      mockTx();
      vi.mocked(queries.restoreCollectionItem).mockResolvedValue(true);
      vi.mocked(queries.getCollectionItemById).mockResolvedValue(makeCollectionRow({ deleted_at: null }));

      const res = await server.inject({
        method: 'POST',
        url: `/collection/${COLLECTION_UUID}/restore`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return 404 for non-existent item', async () => {
      mockTx();
      vi.mocked(queries.restoreCollectionItem).mockResolvedValue(false);

      const res = await server.inject({
        method: 'POST',
        url: `/collection/${COLLECTION_UUID}/restore`,
        headers: authHeaders(),
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for another user (RLS isolation)', async () => {
      mockTx();
      vi.mocked(queries.restoreCollectionItem).mockResolvedValue(false);

      const res = await server.inject({
        method: 'POST',
        url: `/collection/${COLLECTION_UUID}/restore`,
        headers: authHeaders(USER_B_UUID),
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/collection/${COLLECTION_UUID}/restore`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 415 for wrong content-type', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/collection/${COLLECTION_UUID}/restore`,
        headers: { ...authHeaders(), 'content-type': 'text/plain' },
        payload: 'invalid',
      });

      expect(res.statusCode).toBe(415);
    });
  });
});
