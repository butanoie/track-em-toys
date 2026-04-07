/**
 * Integration tests for collection photo routes.
 *
 * Strategy: build a real Fastify server via buildServer() and use
 * fastify.inject() to exercise the full request/response pipeline.
 *
 * Uses the collection test pattern: inline config mock, named query mocks,
 * withTransaction passthrough with _userId for RLS context.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PoolClient } from '../../db/pool.js';

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
    ml: {
      exportPath: '/tmp/trackem-test-ml-export',
    },
  },
}));

vi.mock('../../db/pool.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn(), on: vi.fn(), end: vi.fn() },
  withTransaction: vi.fn(),
}));

vi.mock('../../auth/key-store.js', () => ({
  initKeyStore: vi.fn(),
  getCurrentKid: vi.fn().mockReturnValue('test-kid'),
  getPublicKeyPem: vi.fn().mockReturnValue(testPublicPem),
}));

// Mock Sharp to avoid real image processing
vi.mock('sharp', () => {
  const mockSharp = () => ({
    clone: () => mockSharp(),
    resize: () => mockSharp(),
    webp: () => mockSharp(),
    toBuffer: () => Promise.resolve(Buffer.from('fake-webp')),
    metadata: () => Promise.resolve({ width: 1000, height: 800 }),
  });
  return { default: mockSharp };
});

// Mock fs operations
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake-file-data')),
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Mock dhash module
const mockComputeDHash = vi.fn();
const mockHammingDistance = vi.fn();
vi.mock('../../catalog/photos/dhash.js', () => ({
  computeDHash: (...args: unknown[]) => mockComputeDHash(...args),
  hammingDistance: (...args: unknown[]) => mockHammingDistance(...args),
}));

// Mock fs sync operations (used in server.ts startup validation)
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    accessSync: vi.fn(),
  };
});

// Mock parent collection queries (collection routes imports these)
vi.mock('../queries.js', () => ({
  listCollectionItems: vi.fn(),
  getCollectionItemById: vi.fn(),
  lockCollectionItem: vi.fn(),
  itemExists: vi.fn(),
  insertCollectionItem: vi.fn(),
  getCollectionStats: vi.fn(),
  exportCollectionItems: vi.fn(),
  batchGetItemIdsBySlugs: vi.fn(),
  softDeleteAllCollectionItems: vi.fn(),
  checkCollectionItems: vi.fn(),
  updateCollectionItem: vi.fn(),
  softDeleteCollectionItem: vi.fn(),
  restoreCollectionItem: vi.fn(),
}));

// Mock photo queries — named function mocks (collection pattern)
vi.mock('./queries.js', () => ({
  getCollectionItemRef: vi.fn(),
  insertCollectionPhoto: vi.fn(),
  listCollectionPhotos: vi.fn(),
  getPhotoHashesByCollectionItem: vi.fn(),
  getMaxSortOrder: vi.fn(),
  deleteCollectionPhoto: vi.fn(),
  setCollectionPhotoPrimary: vi.fn(),
  reorderCollectionPhotos: vi.fn(),
  getCollectionPhotoById: vi.fn(),
  getActiveContribution: vi.fn(),
  insertContribution: vi.fn(),
  insertPendingCatalogPhoto: vi.fn(),
  updateContributionCopied: vi.fn(),
  revokeContribution: vi.fn(),
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { buildServer } from '../../server.js';
import * as pool from '../../db/pool.js';
import * as photoQueries from './queries.js';

// ─── Fixture data ────────────────────────────────────────────────────────────

const USER_A_UUID = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const COLLECTION_ITEM_UUID = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
const CATALOG_ITEM_UUID = 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4';
const PHOTO_UUID = 'e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5';
const CONTRIBUTION_UUID = 'f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6';

const mockPhotoRow = {
  id: PHOTO_UUID,
  url: `collection/${USER_A_UUID}/${COLLECTION_ITEM_UUID}/${PHOTO_UUID}-original.webp`,
  caption: null,
  is_primary: false,
  sort_order: 1,
};

/** Extended row for list responses (includes contribution_status from LEFT JOIN). */
const mockPhotoListRow = {
  ...mockPhotoRow,
  contribution_status: null as string | null,
};

// ─── Test helpers ────────────────────────────────────────────────────────────

const fakeQuery = vi.fn();
const fakeClient = { query: fakeQuery } as pool.QueryOnlyClient;

function mockTx() {
  vi.mocked(pool.withTransaction).mockImplementation(async (fn, _userId) => fn(fakeClient as PoolClient));
}

function mockCollectionItemExists(found = true) {
  vi.mocked(photoQueries.getCollectionItemRef).mockResolvedValue(
    found ? { id: COLLECTION_ITEM_UUID, item_id: CATALOG_ITEM_UUID } : null
  );
}

function buildMultipartBody(filename: string, mimetype: string, content: Buffer): { body: Buffer; boundary: string } {
  const boundary = '----TestBoundary' + Date.now();
  const parts = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
    `Content-Type: ${mimetype}\r\n\r\n`,
  ];
  const header = Buffer.from(parts.join(''));
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([header, content, footer]), boundary };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

let server: FastifyInstance;

beforeAll(async () => {
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockComputeDHash.mockResolvedValue('abcdef0123456789');
  mockHammingDistance.mockReturnValue(64); // above threshold — no duplicate
});

function userToken(sub: string = USER_A_UUID): string {
  return server.jwt.sign({ sub, role: 'user' });
}

function authHeaders(sub?: string) {
  return { authorization: `Bearer ${userToken(sub)}` };
}

const BASE_URL = `/collection/${COLLECTION_ITEM_UUID}/photos`;

// ═══════════════════════════════════════════════════════════════════════════
// POST /collection/:id/photos — Upload
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /collection/:id/photos', () => {
  const fakeImage = Buffer.from('fake-image-data');

  it('should return 201 with uploaded photo', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.getPhotoHashesByCollectionItem).mockResolvedValue([]);
    vi.mocked(photoQueries.getMaxSortOrder).mockResolvedValue(0);
    vi.mocked(photoQueries.insertCollectionPhoto).mockResolvedValue(mockPhotoRow);

    const { body, boundary } = buildMultipartBody('photo.jpg', 'image/jpeg', fakeImage);

    const res = await server.inject({
      method: 'POST',
      url: BASE_URL,
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.payload) as { photos: unknown[] };
    expect(json.photos).toHaveLength(1);
  });

  it('should return 401 without auth', async () => {
    const { body, boundary } = buildMultipartBody('photo.jpg', 'image/jpeg', fakeImage);

    const res = await server.inject({
      method: 'POST',
      url: BASE_URL,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(401);
  });

  it('should return 404 for non-existent collection item', async () => {
    mockTx();
    mockCollectionItemExists(false);

    const { body, boundary } = buildMultipartBody('photo.jpg', 'image/jpeg', fakeImage);

    const res = await server.inject({
      method: 'POST',
      url: BASE_URL,
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(404);
  });

  it('should return 400 for unsupported mime type', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.getPhotoHashesByCollectionItem).mockResolvedValue([]);

    const { body, boundary } = buildMultipartBody('doc.pdf', 'application/pdf', fakeImage);

    const res = await server.inject({
      method: 'POST',
      url: BASE_URL,
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(400);
  });

  it('should return 409 for duplicate photo', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.getPhotoHashesByCollectionItem).mockResolvedValue([
      { id: 'existing-id', url: 'existing-url', dhash: 'abcdef0123456789' },
    ]);
    mockHammingDistance.mockReturnValue(5); // below threshold — duplicate

    const { body, boundary } = buildMultipartBody('photo.jpg', 'image/jpeg', fakeImage);

    const res = await server.inject({
      method: 'POST',
      url: BASE_URL,
      headers: {
        ...authHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(409);
    const json = JSON.parse(res.payload) as { error: string; matched: { id: string } };
    expect(json.matched.id).toBe('existing-id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /collection/:id/photos — List
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /collection/:id/photos', () => {
  it('should return 200 with photos list', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.listCollectionPhotos).mockResolvedValue([mockPhotoListRow]);

    const res = await server.inject({
      method: 'GET',
      url: BASE_URL,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload) as { photos: Array<{ contribution_status: string | null }> };
    expect(json.photos).toHaveLength(1);
    expect(json.photos[0]).toBeDefined();
    expect(json.photos[0]!.contribution_status).toBeNull();
  });

  it('should include contribution_status when photo is contributed', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.listCollectionPhotos).mockResolvedValue([
      { ...mockPhotoListRow, contribution_status: 'pending' },
    ]);

    const res = await server.inject({
      method: 'GET',
      url: BASE_URL,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload) as { photos: Array<{ contribution_status: string | null }> };
    expect(json.photos[0]).toBeDefined();
    expect(json.photos[0]!.contribution_status).toBe('pending');
  });

  it('should return 404 for non-existent collection item', async () => {
    mockTx();
    mockCollectionItemExists(false);

    const res = await server.inject({
      method: 'GET',
      url: BASE_URL,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
  });

  it('should return 401 without auth', async () => {
    const res = await server.inject({
      method: 'GET',
      url: BASE_URL,
    });

    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /collection/:id/photos/:photoId — Delete
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /collection/:id/photos/:photoId', () => {
  it('should return 204 on successful delete', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.deleteCollectionPhoto).mockResolvedValue(true);

    const res = await server.inject({
      method: 'DELETE',
      url: `${BASE_URL}/${PHOTO_UUID}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(204);
  });

  it('should return 404 for non-existent photo', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.deleteCollectionPhoto).mockResolvedValue(false);

    const res = await server.inject({
      method: 'DELETE',
      url: `${BASE_URL}/${PHOTO_UUID}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
  });

  it('should return 404 for non-existent collection item', async () => {
    mockTx();
    mockCollectionItemExists(false);

    const res = await server.inject({
      method: 'DELETE',
      url: `${BASE_URL}/${PHOTO_UUID}`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /collection/:id/photos/:photoId/primary — Set Primary
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /collection/:id/photos/:photoId/primary', () => {
  it('should return 200 with updated photo', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.setCollectionPhotoPrimary).mockResolvedValue({ ...mockPhotoRow, is_primary: true });

    const res = await server.inject({
      method: 'PATCH',
      url: `${BASE_URL}/${PHOTO_UUID}/primary`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload) as { photo: { is_primary: boolean } };
    expect(json.photo.is_primary).toBe(true);
  });

  it('should return 404 for non-existent photo', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.setCollectionPhotoPrimary).mockResolvedValue(null);

    const res = await server.inject({
      method: 'PATCH',
      url: `${BASE_URL}/${PHOTO_UUID}/primary`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
  });

  it('should return 409 on concurrent primary update', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.setCollectionPhotoPrimary).mockRejectedValue(
      new Error('duplicate key value violates unique constraint "idx_collection_item_photos_one_primary"')
    );

    const res = await server.inject({
      method: 'PATCH',
      url: `${BASE_URL}/${PHOTO_UUID}/primary`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /collection/:id/photos/reorder — Reorder
// ═══════════════════════════════════════════════════════════════════════════

describe('PATCH /collection/:id/photos/reorder', () => {
  it('should return 200 with reordered photos', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.reorderCollectionPhotos).mockResolvedValue([mockPhotoRow]);

    const res = await server.inject({
      method: 'PATCH',
      url: `${BASE_URL}/reorder`,
      headers: {
        ...authHeaders(),
        'content-type': 'application/json',
      },
      payload: {
        photos: [{ id: PHOTO_UUID, sort_order: 0 }],
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload) as { photos: unknown[] };
    expect(json.photos).toHaveLength(1);
  });

  it('should return 404 for non-existent collection item', async () => {
    mockTx();
    mockCollectionItemExists(false);

    const res = await server.inject({
      method: 'PATCH',
      url: `${BASE_URL}/reorder`,
      headers: {
        ...authHeaders(),
        'content-type': 'application/json',
      },
      payload: {
        photos: [{ id: PHOTO_UUID, sort_order: 0 }],
      },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /collection/:id/photos/:photoId/contribute — Contribute
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /collection/:id/photos/:photoId/contribute', () => {
  function setupSuccessfulMocks() {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.getCollectionPhotoById).mockResolvedValue({
      id: PHOTO_UUID,
      url: mockPhotoRow.url,
      dhash: 'abcdef0123456789',
      collection_item_id: COLLECTION_ITEM_UUID,
    });
    vi.mocked(photoQueries.getActiveContribution).mockResolvedValue(null);
    vi.mocked(photoQueries.insertContribution).mockResolvedValue({ id: CONTRIBUTION_UUID });
    vi.mocked(photoQueries.insertPendingCatalogPhoto).mockResolvedValue(undefined);
    vi.mocked(photoQueries.updateContributionCopied).mockResolvedValue(undefined);
  }

  it('should return 201 on successful training_only contribution', async () => {
    setupSuccessfulMocks();

    const res = await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: {
        ...authHeaders(),
        'content-type': 'application/json',
      },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: true,
        intent: 'training_only',
      },
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.payload) as { contribution_id: string };
    expect(json.contribution_id).toBe(CONTRIBUTION_UUID);
  });

  it('should persist intent=training_only and visibility=training_only on the new rows', async () => {
    setupSuccessfulMocks();

    await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: true,
        intent: 'training_only',
      },
    });

    const contribCall = vi.mocked(photoQueries.insertContribution).mock.calls[0];
    expect(contribCall).toBeDefined();
    expect(contribCall![1]).toMatchObject({ intent: 'training_only' });

    const photoCall = vi.mocked(photoQueries.insertPendingCatalogPhoto).mock.calls[0];
    expect(photoCall).toBeDefined();
    expect(photoCall![1]).toMatchObject({ visibility: 'training_only' });
  });

  it('should persist intent=catalog_and_training and visibility=public on the new rows', async () => {
    setupSuccessfulMocks();

    await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: true,
        intent: 'catalog_and_training',
      },
    });

    const contribCall = vi.mocked(photoQueries.insertContribution).mock.calls[0];
    expect(contribCall).toBeDefined();
    expect(contribCall![1]).toMatchObject({ intent: 'catalog_and_training' });

    const photoCall = vi.mocked(photoQueries.insertPendingCatalogPhoto).mock.calls[0];
    expect(photoCall).toBeDefined();
    expect(photoCall![1]).toMatchObject({ visibility: 'public' });
  });

  it('should return 400 when intent is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: true,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when intent is not a valid enum value', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: true,
        intent: 'public',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('should return 400 without consent', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: {
        ...authHeaders(),
        'content-type': 'application/json',
      },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: false,
        intent: 'training_only',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('should return 409 for already-contributed photo', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.getCollectionPhotoById).mockResolvedValue({
      id: PHOTO_UUID,
      url: mockPhotoRow.url,
      dhash: 'abcdef0123456789',
      collection_item_id: COLLECTION_ITEM_UUID,
    });
    vi.mocked(photoQueries.getActiveContribution).mockResolvedValue({
      id: CONTRIBUTION_UUID,
      collection_item_photo_id: PHOTO_UUID,
      item_photo_id: null,
      status: 'pending',
    });

    const res = await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: {
        ...authHeaders(),
        'content-type': 'application/json',
      },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: true,
        intent: 'training_only',
      },
    });

    expect(res.statusCode).toBe(409);
  });

  it('should return 404 for non-existent photo', async () => {
    mockTx();
    mockCollectionItemExists();
    vi.mocked(photoQueries.getCollectionPhotoById).mockResolvedValue(null);

    const res = await server.inject({
      method: 'POST',
      url: `${BASE_URL}/${PHOTO_UUID}/contribute`,
      headers: {
        ...authHeaders(),
        'content-type': 'application/json',
      },
      payload: {
        consent_version: '1.0',
        consent_acknowledged: true,
        intent: 'training_only',
      },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /collection/:id/photos/:photoId/contribution — Revoke
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /collection/:id/photos/:photoId/contribution', () => {
  it('should return 200 with revoked status', async () => {
    mockTx();
    vi.mocked(photoQueries.getCollectionPhotoById).mockResolvedValue({
      id: PHOTO_UUID,
      url: mockPhotoRow.url,
      dhash: 'abcdef0123456789',
      collection_item_id: COLLECTION_ITEM_UUID,
    });
    vi.mocked(photoQueries.revokeContribution).mockResolvedValue(true);

    const res = await server.inject({
      method: 'DELETE',
      url: `${BASE_URL}/${PHOTO_UUID}/contribution`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload) as { revoked: boolean };
    expect(json.revoked).toBe(true);
  });

  it('should return 404 for non-existent photo', async () => {
    mockTx();
    vi.mocked(photoQueries.getCollectionPhotoById).mockResolvedValue(null);

    const res = await server.inject({
      method: 'DELETE',
      url: `${BASE_URL}/${PHOTO_UUID}/contribution`,
      headers: authHeaders(),
    });

    expect(res.statusCode).toBe(404);
  });
});
