import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mockQuery, setupCatalogTest } from '../shared/test-setup.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

const { buildServer } = await setupCatalogTest();

const fsMocks = await import('node:fs/promises');
const mockMkdir = vi.mocked(fsMocks.mkdir);
const mockWriteFile = vi.mocked(fsMocks.writeFile);

describe('ml-export routes', () => {
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

  function adminToken(): string {
    return server.jwt.sign({ sub: 'admin-1', role: 'admin' });
  }

  function curatorToken(): string {
    return server.jwt.sign({ sub: 'curator-1', role: 'curator' });
  }

  function userToken(): string {
    return server.jwt.sign({ sub: 'user-1', role: 'user' });
  }

  const sampleRow = {
    item_id: 'item-1',
    item_slug: 'optimus-prime-voyager',
    item_name: 'Optimus Prime (Voyager)',
    franchise_slug: 'transformers',
    photo_id: 'photo-1',
  };

  const sampleRowPhoto2 = {
    ...sampleRow,
    photo_id: 'photo-2',
  };

  const noPhotoRow = {
    item_id: 'item-2',
    item_slug: 'megatron-leader',
    item_name: 'Megatron (Leader)',
    franchise_slug: 'transformers',
    photo_id: null,
  };

  describe('POST /catalog/ml-export', () => {
    it('should return 200 with manifest stats for admin', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow, sampleRowPhoto2] });

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        exported_at: string;
        filename: string;
        stats: { total_photos: number; items: number; franchises: number; low_photo_items: number };
        warnings: Array<{ label: string; photo_count: number; message: string }>;
      }>();
      expect(body.exported_at).toBeDefined();
      expect(body.filename).toMatch(/^\d{8}T\d{6}Z\.json$/);
      expect(body.stats.total_photos).toBe(2);
      expect(body.stats.items).toBe(1);
      expect(body.stats.franchises).toBe(1);
    });

    it('should write manifest file to ML_EXPORT_PATH', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });

      const token = adminToken();
      await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(mockMkdir).toHaveBeenCalledWith('/tmp/trackem-test-ml-export', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledOnce();

      const writeArgs = mockWriteFile.mock.calls[0];
      expect(writeArgs).toBeDefined();
      const filePath = writeArgs![0];
      expect(typeof filePath).toBe('string');
      expect(filePath as string).toMatch(/^\/tmp\/trackem-test-ml-export\/\d{8}T\d{6}Z\.json$/);

      const rawContent = writeArgs![1];
      expect(typeof rawContent).toBe('string');
      const manifest = JSON.parse(rawContent as string) as {
        version: number;
        entries: Array<{ photo_path: string; label: string }>;
      };
      expect(manifest.version).toBe(1);
      expect(manifest.entries).toHaveLength(1);
      expect(manifest.entries[0]?.label).toBe('transformers/optimus-prime-voyager');
      expect(manifest.entries[0]?.photo_path).toContain('photo-1-original.webp');
    });

    it('should include low photo count warnings', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus',
        headers: { authorization: `Bearer ${token}` },
      });

      const body = res.json<{
        stats: { low_photo_items: number };
        warnings: Array<{ label: string; photo_count: number }>;
      }>();
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0]?.label).toBe('transformers/optimus-prime-voyager');
      expect(body.warnings[0]?.photo_count).toBe(1);
      expect(body.stats.low_photo_items).toBe(1);
    });

    it('should exclude items with zero photos from manifest entries', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [noPhotoRow] });

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=megatron',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        stats: { total_photos: number; items: number; low_photo_items: number };
        warnings: Array<{ label: string; photo_count: number }>;
      }>();
      expect(body.stats.total_photos).toBe(0);
      expect(body.stats.items).toBe(1);
      expect(body.stats.low_photo_items).toBe(1);
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0]?.photo_count).toBe(0);
    });

    it('should handle empty result set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ stats: { total_photos: number; items: number } }>();
      expect(body.stats.total_photos).toBe(0);
      expect(body.stats.items).toBe(0);
    });

    it('should support franchise filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus&franchise=transformers',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const queryArgs = mockQuery.mock.calls[0];
      expect(queryArgs).toBeDefined();
      expect(queryArgs![1]).toContain('transformers');
    });

    it('should return 401 without authentication', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 403 for curator role', async () => {
      const token = curatorToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 for user role', async () => {
      const token = userToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 400 when neither q nor franchise is provided', async () => {
      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json<{ error: string }>();
      expect(body.error).toContain('At least one of q or franchise');
    });

    it('should export by franchise without search query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow, sampleRowPhoto2] });

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?franchise=transformers',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        stats: { total_photos: number; items: number };
      }>();
      expect(body.stats.total_photos).toBe(2);
      expect(body.stats.items).toBe(1);
    });

    it('should pass filter params when using franchise mode', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?franchise=transformers&manufacturer=hasbro&size_class=Voyager',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const queryArgs = mockQuery.mock.calls[0];
      expect(queryArgs).toBeDefined();
      expect(queryArgs![1]).toContain('transformers');
      expect(queryArgs![1]).toContain('hasbro');
      expect(queryArgs![1]).toContain('Voyager');
    });

    it('should return 500 when filesystem write fails', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });
      mockWriteFile.mockRejectedValueOnce(new Error('EACCES: permission denied'));

      const token = adminToken();
      const res = await server.inject({
        method: 'POST',
        url: '/catalog/ml-export?q=optimus',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(500);
      const body = res.json<{ error: string }>();
      expect(body.error).toBe('Failed to write export manifest');
    });
  });
});
