/**
 * Integration tests for admin photo approval routes.
 *
 * Mirrors the pattern in admin/routes.test.ts: real Fastify server via
 * buildServer(), fastify.inject() for the full request/response pipeline,
 * module-boundary mocks for db and query functions.
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

// ─── Module mocks — must be declared before any imports ──────────────────────

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

// The admin sub-plugin also imports these, so they need to be mocked even though
// none of our photo routes call them directly.
vi.mock('../../db/queries.js', () => ({
  deactivateUser: vi.fn(),
  revokeAllUserRefreshTokens: vi.fn(),
  logAuthEvent: vi.fn(),
}));

vi.mock('../queries.js', () => ({
  listAdminUsers: vi.fn(),
  findUserForAdmin: vi.fn(),
  updateUserRole: vi.fn(),
  reactivateUser: vi.fn(),
  gdprPurgeUser: vi.fn(),
  countActiveAdmins: vi.fn(),
}));

vi.mock('../../collection/photos/storage.js', () => ({
  deleteUserPhotoDirectory: vi.fn().mockResolvedValue(undefined),
}));

// Photo approval query functions — the primary set of mocks we'll drive per test.
vi.mock('./queries.js', () => ({
  listPendingPhotos: vi.fn(),
  getPendingPhotoCount: vi.fn(),
  loadPhotoForDecision: vi.fn(),
  getPhotoStatus: vi.fn(),
  decidePhoto: vi.fn(),
  mirrorContributionStatus: vi.fn(),
  REJECTION_REASON_CODES: ['blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other'],
}));

// ─── Import after mocks are registered ───────────────────────────────────────

import { buildServer } from '../../server.js';
import * as pool from '../../db/pool.js';
import * as photoQueries from './queries.js';

// ─── Fixture data ────────────────────────────────────────────────────────────

const CURATOR_UUID = 'c1d2e3f4-a5b6-7890-cdef-1234567890ab';
const ADMIN_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER_UUID = 'd4e5f6a7-b8c9-0123-defa-456789012345';
const PHOTO_UUID = 'e5f6a7b8-c9d0-1234-efab-567890123456';
const OTHER_PHOTO_UUID = 'f6a7b8c9-d0e1-2345-fabc-678901234567';
const CONTRIBUTOR_UUID = 'a7b8c9d0-e1f2-3456-abcd-789012345678';
const ITEM_UUID = 'b8c9d0e1-f2a3-4567-bcde-890123456789';

const mockPendingRow = {
  id: PHOTO_UUID,
  url: 'items/abc/photo-1-original.webp',
  caption: null,
  visibility: 'training_only' as const,
  created_at: '2026-04-01T10:00:00Z',
  item_id: ITEM_UUID,
  item_name: 'Optimus Prime',
  item_slug: 'optimus-prime',
  franchise_slug: 'transformers',
  item_thumbnail_url: 'items/abc/primary.webp',
  uploader_id: CONTRIBUTOR_UUID,
  uploader_display_name: 'Test Contributor',
  uploader_email: 'contrib@example.com',
  contribution_id: 'cc11cc11-cc11-cc11-cc11-cc11cc11cc11',
  contributed_by: CONTRIBUTOR_UUID,
  consent_version: 'v1.0',
  consent_granted_at: '2026-04-01T09:00:00Z',
  contribution_intent: 'training_only' as const,
  existing_photos: [{ id: 'ep1', url: 'items/abc/existing-1.webp' }],
  can_decide: true,
};

const mockDecidedRow = {
  id: PHOTO_UUID,
  item_id: ITEM_UUID,
  url: 'items/abc/photo-1-original.webp',
  status: 'approved' as const,
  visibility: 'training_only' as const,
  rejection_reason_code: null,
  rejection_reason_text: null,
  updated_at: '2026-04-01T12:00:00Z',
};

// ─── withTransaction passthrough helper ──────────────────────────────────────

const fakeClient = {} satisfies Pick<PoolClient, never>;

function mockTx() {
  vi.mocked(pool.withTransaction).mockImplementation(
    // fakeClient cast is safe: all query functions are mocked, no real DB method is called
    async (fn, _userId) => fn(fakeClient as PoolClient)
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('admin photo approval routes', () => {
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

  function curatorToken(sub: string = CURATOR_UUID): string {
    return server.jwt.sign({ sub, role: 'curator' });
  }

  function adminToken(sub: string = ADMIN_UUID): string {
    return server.jwt.sign({ sub, role: 'admin' });
  }

  function userToken(sub: string = USER_UUID): string {
    return server.jwt.sign({ sub, role: 'user' });
  }

  // ─── GET /admin/photos/pending ───────────────────────────────────────────

  describe('GET /admin/photos/pending', () => {
    it('should return 200 with pending photos list', async () => {
      vi.mocked(photoQueries.listPendingPhotos).mockResolvedValue({
        rows: [mockPendingRow],
        totalCount: 1,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
        headers: { authorization: `Bearer ${curatorToken()}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ photos: unknown[]; total_count: number }>();
      expect(body.total_count).toBe(1);
      expect(body.photos).toHaveLength(1);
    });

    it('should map the row into the expected shape', async () => {
      vi.mocked(photoQueries.listPendingPhotos).mockResolvedValue({
        rows: [mockPendingRow],
        totalCount: 1,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
        headers: { authorization: `Bearer ${curatorToken()}` },
      });

      const body = res.json<{
        photos: Array<{
          id: string;
          item: { name: string; slug: string; franchise_slug: string };
          uploader: { id: string; email: string | null } | null;
          contribution: { intent: string; contributed_by: string } | null;
          can_decide: boolean;
        }>;
      }>();
      expect(body.photos[0]).toBeDefined();
      const p = body.photos[0]!;
      expect(p.id).toBe(PHOTO_UUID);
      expect(p.item.name).toBe('Optimus Prime');
      expect(p.item.slug).toBe('optimus-prime');
      expect(p.item.franchise_slug).toBe('transformers');
      expect(p.uploader).not.toBeNull();
      expect(p.uploader!.id).toBe(CONTRIBUTOR_UUID);
      expect(p.contribution).not.toBeNull();
      expect(p.contribution!.intent).toBe('training_only');
      expect(p.can_decide).toBe(true);
    });

    it('should collapse uploader to null when uploader_id is null (tombstoned)', async () => {
      vi.mocked(photoQueries.listPendingPhotos).mockResolvedValue({
        rows: [
          {
            ...mockPendingRow,
            uploader_id: null,
            uploader_display_name: null,
            uploader_email: null,
          },
        ],
        totalCount: 1,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
        headers: { authorization: `Bearer ${curatorToken()}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ photos: Array<{ uploader: unknown }> }>();
      expect(body.photos[0]).toBeDefined();
      expect(body.photos[0]!.uploader).toBeNull();
    });

    it('should return contribution as null when contribution_id is null', async () => {
      vi.mocked(photoQueries.listPendingPhotos).mockResolvedValue({
        rows: [
          {
            ...mockPendingRow,
            contribution_id: null,
            contributed_by: null,
            consent_version: null,
            consent_granted_at: null,
            contribution_intent: null,
          },
        ],
        totalCount: 1,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
        headers: { authorization: `Bearer ${curatorToken()}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ photos: Array<{ contribution: unknown }> }>();
      expect(body.photos[0]).toBeDefined();
      expect(body.photos[0]!.contribution).toBeNull();
    });

    it('should pass the actor sub as actorId to the query', async () => {
      vi.mocked(photoQueries.listPendingPhotos).mockResolvedValue({
        rows: [],
        totalCount: 0,
      });

      await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
        headers: { authorization: `Bearer ${curatorToken()}` },
      });

      expect(vi.mocked(photoQueries.listPendingPhotos)).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: CURATOR_UUID, limit: 200 })
      );
    });

    it('should grant access to admins via role hierarchy', async () => {
      vi.mocked(photoQueries.listPendingPhotos).mockResolvedValue({
        rows: [],
        totalCount: 0,
      });

      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
        headers: { authorization: `Bearer ${adminToken()}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return 401 with no auth header', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 403 for user role', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending',
        headers: { authorization: `Bearer ${userToken()}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── GET /admin/photos/pending-count ─────────────────────────────────────

  describe('GET /admin/photos/pending-count', () => {
    it('should return 200 with the count', async () => {
      vi.mocked(photoQueries.getPendingPhotoCount).mockResolvedValue(42);

      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending-count',
        headers: { authorization: `Bearer ${curatorToken()}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json<{ count: number }>().count).toBe(42);
    });

    it('should return 401 with no auth', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending-count',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 403 for user role', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending-count',
        headers: { authorization: `Bearer ${userToken()}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should grant access to admins via role hierarchy', async () => {
      vi.mocked(photoQueries.getPendingPhotoCount).mockResolvedValue(0);

      const res = await server.inject({
        method: 'GET',
        url: '/admin/photos/pending-count',
        headers: { authorization: `Bearer ${adminToken()}` },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ─── PATCH /admin/photos/:id/status ──────────────────────────────────────

  describe('PATCH /admin/photos/:id/status', () => {
    function patchUrl(id: string = PHOTO_UUID) {
      return `/admin/photos/${id}/status`;
    }

    it('should approve a pending photo', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'catalog_and_training',
          status: 'pending',
          file_copied: true,
        },
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue({
        ...mockDecidedRow,
        visibility: 'public',
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ status: string; visibility: string }>();
      expect(body.status).toBe('approved');
      expect(body.visibility).toBe('public');

      // Verify the derived visibility made it into the UPDATE call
      expect(vi.mocked(photoQueries.decidePhoto)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({ targetVisibility: 'public', status: 'approved' })
      );

      // Verify the contribution mirror was called
      expect(vi.mocked(photoQueries.mirrorContributionStatus)).toHaveBeenCalledWith(fakeClient, PHOTO_UUID, 'approved');
    });

    it('should honor training_only intent on approve (no demote needed)', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'training_only',
          status: 'pending',
          file_copied: true,
        },
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue(mockDecidedRow);

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(photoQueries.decidePhoto)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({ targetVisibility: 'training_only' })
      );
    });

    it('should demote a public-intent contribution when visibility=training_only is passed', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'public',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'catalog_and_training',
          status: 'pending',
          file_copied: true,
        },
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue(mockDecidedRow);

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved', visibility: 'training_only' },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(photoQueries.decidePhoto)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({ targetVisibility: 'training_only' })
      );
    });

    it('should reject a pending photo with a reason code', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'training_only',
          status: 'pending',
          file_copied: true,
        },
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue({
        ...mockDecidedRow,
        status: 'rejected',
        rejection_reason_code: 'blurry',
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'rejected', rejection_reason_code: 'blurry' },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(photoQueries.decidePhoto)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({
          status: 'rejected',
          rejectionReasonCode: 'blurry',
          rejectionReasonText: null,
          targetVisibility: null, // no change on reject
        })
      );
    });

    it('should accept rejection_reason_text when code is other', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: null,
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue({
        ...mockDecidedRow,
        status: 'rejected',
        rejection_reason_code: 'other',
        rejection_reason_text: 'Something weird',
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: {
          status: 'rejected',
          rejection_reason_code: 'other',
          rejection_reason_text: 'Something weird',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(photoQueries.decidePhoto)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({
          rejectionReasonCode: 'other',
          rejectionReasonText: 'Something weird',
        })
      );
    });

    it('should return 400 when status=rejected without reason code', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'rejected' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: string }>().error).toContain('rejection_reason_code is required');
    });

    it('should return 400 when rejection_reason_text is set without code=other', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: {
          status: 'rejected',
          rejection_reason_code: 'blurry',
          rejection_reason_text: 'extra commentary',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: string }>().error).toContain('only allowed when');
    });

    it('should return 422 when visibility=public is sent (promotion attempt)', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved', visibility: 'public' },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: string }>().error).toContain('promotion requires re-consent');
    });

    it('should return 404 when the photo does not exist', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue(null);

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(OTHER_PHOTO_UUID),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json<{ error: string }>().error).toBe('Photo not found');
    });

    it('should return 403 when curator is the contributor (self-approval guard)', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        // contributor === curator
        contribution: { contributed_by: CURATOR_UUID, intent: 'training_only', status: 'pending', file_copied: true },
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: string }>().error).toContain('own contribution');
      // decidePhoto must not be called
      expect(vi.mocked(photoQueries.decidePhoto)).not.toHaveBeenCalled();
    });

    it('should apply self-approval guard case-insensitively on UUIDs', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          // Stored uppercase — should still match the lowercase JWT sub
          contributed_by: CURATOR_UUID.toUpperCase(),
          intent: 'training_only',
          status: 'pending',
          file_copied: true,
        },
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 403 for reject when curator is the contributor', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: { contributed_by: CURATOR_UUID, intent: 'training_only', status: 'pending', file_copied: true },
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'rejected', rejection_reason_code: 'blurry' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 409 when the contribution was revoked (consent withdrawn)', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'training_only',
          status: 'revoked',
          file_copied: true,
        },
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(409);
      // The decision MUST NOT proceed — neither item_photos nor photo_contributions
      // should be touched after the contributor has revoked consent.
      expect(vi.mocked(photoQueries.decidePhoto)).not.toHaveBeenCalled();
      expect(vi.mocked(photoQueries.mirrorContributionStatus)).not.toHaveBeenCalled();
    });

    it('should return 409 when the contribution file copy never finished (crash recovery)', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'training_only',
          status: 'pending',
          file_copied: false,
        },
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(409);
      expect(vi.mocked(photoQueries.decidePhoto)).not.toHaveBeenCalled();
    });

    it('should return 404 if the photo vanishes between load and decide (TOCTOU)', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'training_only',
          status: 'pending',
          file_copied: true,
        },
      });
      // 0 rows affected on UPDATE, AND the row is gone on the follow-up SELECT
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue(null);
      vi.mocked(photoQueries.getPhotoStatus).mockResolvedValue(null);

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved', expected_status: 'pending' },
      });

      // Must be 404, not 409 — sending current_status:'unknown' would violate
      // the response schema's enum constraint.
      expect(res.statusCode).toBe(404);
    });

    it('should return 409 when expected_status does not match', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'approved', // already approved
        visibility: 'public',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'catalog_and_training',
          status: 'pending',
          file_copied: true,
        },
      });
      // decidePhoto returns null (0 rows affected) because expected_status was 'pending'
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue(null);
      vi.mocked(photoQueries.getPhotoStatus).mockResolvedValue('approved');

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'rejected', rejection_reason_code: 'blurry', expected_status: 'pending' },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json<{ error: string; current_status: string }>();
      expect(body.error).toContain('state has changed');
      expect(body.current_status).toBe('approved');
    });

    it('should support undo via status=pending', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'approved',
        visibility: 'public',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'catalog_and_training',
          status: 'pending',
          file_copied: true,
        },
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue({
        ...mockDecidedRow,
        status: 'pending',
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'pending' },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(photoQueries.decidePhoto)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({
          status: 'pending',
          rejectionReasonCode: null,
          rejectionReasonText: null,
          targetVisibility: null,
        })
      );
      // Contribution mirror is called with 'pending' too — the UPDATE filters
      // != 'revoked' so re-activating an approved-and-undone contribution works.
      expect(vi.mocked(photoQueries.mirrorContributionStatus)).toHaveBeenCalledWith(fakeClient, PHOTO_UUID, 'pending');
    });

    it('should handle direct curator uploads (contribution=null) by defaulting to public on approve', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'public',
        contribution: null, // direct curator upload
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue({
        ...mockDecidedRow,
        visibility: 'public',
      });

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(photoQueries.decidePhoto)).toHaveBeenCalledWith(
        fakeClient,
        expect.objectContaining({ targetVisibility: 'public' })
      );
    });

    it('should return 400 for invalid UUID param', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: '/admin/photos/not-a-uuid/status',
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for invalid status value', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'deleted' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for invalid rejection_reason_code value', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${curatorToken()}`, 'content-type': 'application/json' },
        payload: { status: 'rejected', rejection_reason_code: 'too-ugly' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 401 with no auth', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 403 for user role', async () => {
      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${userToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should grant access to admins via role hierarchy', async () => {
      mockTx();
      vi.mocked(photoQueries.loadPhotoForDecision).mockResolvedValue({
        id: PHOTO_UUID,
        status: 'pending',
        visibility: 'training_only',
        contribution: {
          contributed_by: CONTRIBUTOR_UUID,
          intent: 'training_only',
          status: 'pending',
          file_copied: true,
        },
      });
      vi.mocked(photoQueries.decidePhoto).mockResolvedValue(mockDecidedRow);

      const res = await server.inject({
        method: 'PATCH',
        url: patchUrl(),
        headers: { authorization: `Bearer ${adminToken()}`, 'content-type': 'application/json' },
        payload: { status: 'approved' },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
