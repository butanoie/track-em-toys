import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';
import * as pool from '../../db/pool.js';

// Mock sharp to avoid real image processing in route tests
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
}));

// Mock fs sync operations (used in server.ts startup validation)
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    accessSync: vi.fn(),
  };
});

// ─── Import after mocks ─────────────────────────────────────────────────────

const { buildServer } = await setupCatalogTest();

// ─── Fixture data ────────────────────────────────────────────────────────────

const CURATOR_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const ITEM_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const PHOTO_ID = 'd4e5f6a7-b8c9-0123-defa-234567890123';

const mockPhotoRow = {
  id: PHOTO_ID,
  url: `${ITEM_ID}/${PHOTO_ID}-original.webp`,
  caption: null,
  is_primary: false,
  sort_order: 1,
  status: 'approved',
};

// ─── Test helpers ─────────────────────────────────────────────────────────────

let server: FastifyInstance;

function curatorToken(): string {
  return server.jwt.sign({ sub: CURATOR_UUID, role: 'curator' });
}

function userToken(): string {
  return server.jwt.sign({ sub: USER_UUID, role: 'user' });
}

function mockItemLookup(found = true) {
  mockQuery.mockResolvedValueOnce(found ? { rows: [{ id: ITEM_ID }], rowCount: 1 } : { rows: [], rowCount: 0 });
}

function mockTx() {
  const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  // All query functions are vi.mock'd at the module boundary. withTransaction receives a
  // passthrough whose .query is only used when tests configure per-call return values
  // (e.g. setPrimary chain). The empty-satisfies + cast matches the admin routes pattern.
  const passthrough = {} satisfies Pick<pool.PoolClient, never>;
  Object.assign(passthrough, { query: clientQuery });
  vi.mocked(pool.withTransaction).mockImplementation(async (fn) => fn(passthrough as pool.PoolClient));
  return { query: clientQuery };
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

beforeAll(async () => {
  server = await buildServer();
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /catalog/franchises/:franchise/items/:slug/photos', () => {
  const url = '/catalog/franchises/transformers/items/optimus-prime/photos';

  it('returns 401 without auth token', async () => {
    const res = await server.inject({ method: 'POST', url });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-curator user', async () => {
    const res = await server.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when item not found', async () => {
    mockItemLookup(false);
    const { body, boundary } = buildMultipartBody('test.jpg', 'image/jpeg', Buffer.from('img'));
    const res = await server.inject({
      method: 'POST',
      url,
      headers: {
        authorization: `Bearer ${curatorToken()}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for unsupported MIME type', async () => {
    mockItemLookup(true);
    const { body, boundary } = buildMultipartBody('test.svg', 'image/svg+xml', Buffer.from('<svg/>'));
    const res = await server.inject({
      method: 'POST',
      url,
      headers: {
        authorization: `Bearer ${curatorToken()}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toMatch(/Unsupported image type/);
  });

  it('returns 201 with uploaded photo on success', async () => {
    mockItemLookup(true);
    // getMaxSortOrder
    mockQuery.mockResolvedValueOnce({ rows: [{ max: 0 }], rowCount: 1 });
    // insertPhoto RETURNING
    mockQuery.mockResolvedValueOnce({ rows: [mockPhotoRow], rowCount: 1 });

    const { body, boundary } = buildMultipartBody('test.jpg', 'image/jpeg', Buffer.from('fake-image'));
    const res = await server.inject({
      method: 'POST',
      url,
      headers: {
        authorization: `Bearer ${curatorToken()}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const json = res.json<{ photos: Array<{ status: string }> }>();
    expect(json.photos).toHaveLength(1);
    expect(json.photos[0]?.status).toBe('approved');
  });
});

describe('DELETE /catalog/franchises/:franchise/items/:slug/photos/:photoId', () => {
  const url = `/catalog/franchises/transformers/items/optimus-prime/photos/${PHOTO_ID}`;

  it('returns 401 without auth token', async () => {
    const res = await server.inject({ method: 'DELETE', url });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-curator user', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when item not found', async () => {
    mockItemLookup(false);
    const res = await server.inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Bearer ${curatorToken()}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when photo not found', async () => {
    mockItemLookup(true);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await server.inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Bearer ${curatorToken()}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 204 on successful delete', async () => {
    mockItemLookup(true);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await server.inject({
      method: 'DELETE',
      url,
      headers: { authorization: `Bearer ${curatorToken()}` },
    });
    expect(res.statusCode).toBe(204);
  });
});

describe('PATCH /catalog/franchises/:franchise/items/:slug/photos/:photoId/primary', () => {
  const url = `/catalog/franchises/transformers/items/optimus-prime/photos/${PHOTO_ID}/primary`;

  it('returns 401 without auth token', async () => {
    const res = await server.inject({ method: 'PATCH', url });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-curator user', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${userToken()}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when item not found', async () => {
    mockItemLookup(false);
    const res = await server.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${curatorToken()}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with updated photo on success', async () => {
    mockItemLookup(true);
    const fakeClient = mockTx();
    fakeClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // clear old primary
      .mockResolvedValueOnce({ rows: [{ ...mockPhotoRow, is_primary: true }], rowCount: 1 }); // set new

    const res = await server.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${curatorToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ photo: { is_primary: boolean } }>().photo.is_primary).toBe(true);
  });
});

describe('PATCH /catalog/franchises/:franchise/items/:slug/photos/reorder', () => {
  const url = '/catalog/franchises/transformers/items/optimus-prime/photos/reorder';

  it('returns 401 without auth token', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url,
      payload: { photos: [{ id: PHOTO_ID, sort_order: 1 }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for non-curator user', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${userToken()}` },
      payload: { photos: [{ id: PHOTO_ID, sort_order: 1 }] },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when item not found', async () => {
    mockItemLookup(false);
    const res = await server.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${curatorToken()}` },
      payload: { photos: [{ id: PHOTO_ID, sort_order: 1 }] },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 with reordered photos on success', async () => {
    mockItemLookup(true);
    const fakeClient = mockTx();
    fakeClient.query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE sort_order
      .mockResolvedValueOnce({ rows: [mockPhotoRow], rowCount: 1 }); // SELECT reordered

    const res = await server.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${curatorToken()}` },
      payload: { photos: [{ id: PHOTO_ID, sort_order: 1 }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ photos: unknown[] }>().photos).toHaveLength(1);
  });
});
