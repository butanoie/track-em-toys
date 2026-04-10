/**
 * Unit tests for admin photo approval query functions.
 *
 * These tests verify the SQL shapes and parameter passing via a mocked pg pool.
 * Actual database behavior is exercised by the integration tests, which run
 * the real query strings through Postgres in CI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryOnlyClient } from '../../db/queries.js';

vi.mock('../../db/pool.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../../db/pool.js';
import {
  listPendingPhotos,
  getPendingPhotoCount,
  loadPhotoForDecision,
  getPhotoStatus,
  decidePhoto,
  mirrorContributionStatus,
  REJECTION_REASON_CODES,
} from './queries.js';

const ACTOR_UUID = 'c1d2e3f4-a5b6-7890-cdef-1234567890ab';
const PHOTO_UUID = 'e5f6a7b8-c9d0-1234-efab-567890123456';

/**
 * Mock helper that queues pg.Pool.query resolutions.
 *
 * Why ts-expect-error: pg.Pool.query has a callback-based overload that returns
 * void, which causes Awaited<ReturnType<typeof pool.query>> to include void.
 * That makes mockResolvedValueOnce reject our plain object resolution at the
 * type level. The runtime behavior is correct — vitest Mock queues the value
 * regardless of TS's narrowing. Casting via "as unknown as" is banned by
 * api-testing.md rule 7, so we use ts-expect-error which is not.
 *
 * @param dataRows - Rows to return for the data query call.
 * @param countRows - Optional rows for the second (count) query call when
 *   testing functions that fire two queries via Promise.all (FIFO order).
 */
function mockPoolQuery(dataRows: unknown[], countRows?: unknown[]) {
  const poolQuery = vi.mocked(pool.query);
  poolQuery.mockReset();
  // @ts-expect-error - pg.Pool.query void callback overload breaks mockResolvedValueOnce type inference
  poolQuery.mockResolvedValueOnce({ rows: dataRows, rowCount: dataRows.length });
  if (countRows !== undefined) {
    // @ts-expect-error - same void callback overload issue; resolution queue is FIFO so count follows data
    poolQuery.mockResolvedValueOnce({ rows: countRows, rowCount: countRows.length });
  }
}

describe('REJECTION_REASON_CODES', () => {
  it('matches the migration 038 allowed values exactly', () => {
    expect(REJECTION_REASON_CODES).toEqual(['blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other']);
  });
});

describe('listPendingPhotos', () => {
  beforeEach(() => vi.clearAllMocks());

  /** Find the data query call (the one that isn't the COUNT(*) query). */
  function findDataCall(): [string, unknown[]] {
    const call = vi.mocked(pool.query).mock.calls.find(([sql]) => typeof sql === 'string' && !sql.includes('COUNT(*)'));
    expect(call).toBeDefined();
    return [call![0] as string, call![1] as unknown[]];
  }

  it('passes the actor sub and limit into the data query', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'curator', limit: 200 });

    const [sql, params] = findDataCall();
    expect(sql).toContain('item_photos');
    expect(params).toEqual([ACTOR_UUID, 200, 'curator']);
  });

  it('passes actorRole as the third parameter for the admin-bypass branch', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'admin', limit: 200 });

    const [sql, params] = findDataCall();
    expect(sql).toContain("$3 = 'admin'");
    expect(params).toEqual([ACTOR_UUID, 200, 'admin']);
  });

  it('filters the data query to pending status and orders ASC', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'curator', limit: 200 });

    const [sql] = findDataCall();
    expect(sql).toContain("WHERE ip.status = 'pending'");
    expect(sql).toContain('ORDER BY ip.created_at ASC');
  });

  it('includes the can_decide computation in the SELECT', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'curator', limit: 200 });

    const [sql] = findDataCall();
    expect(sql).toContain('can_decide');
    expect(sql).toContain('pc.contributed_by');
    expect(sql).toContain('LOWER(pc.contributed_by::text)');
    expect(sql).toContain('LOWER($1::text)');
  });

  it('computes Hamming distance via bit_count and orders existing_photos by similarity', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'curator', limit: 200 });

    const [sql] = findDataCall();
    // The existing_photos LATERAL must use bit_count for Hamming distance
    // and order by distance ASC NULLS LAST so the closest approved photos
    // surface first.
    expect(sql).toContain('bit_count');
    expect(sql).toContain('distance NULLS LAST');
    expect(sql).toMatch(/length\(ip\.dhash\)\s*=\s*16/);
  });

  it('filters the existing_photos subquery by visibility=public AND status=approved', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'curator', limit: 200 });

    const [sql] = findDataCall();
    // The existing_photos LATERAL subquery must include the visibility filter
    // so the sidebar only shows what the public catalog would show.
    const existingPhotosSection = sql.slice(sql.indexOf('json_agg'));
    expect(existingPhotosSection).toContain("status = 'approved'");
    expect(existingPhotosSection).toContain("visibility = 'public'");
  });

  it('tombstone-filters the uploader JOIN', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'curator', limit: 200 });

    const [sql] = findDataCall();
    expect(sql).toContain('LEFT JOIN users u ON u.id = ip.uploaded_by AND u.deleted_at IS NULL');
  });

  it('uses LATERAL with LIMIT 1 for the contribution JOIN', async () => {
    mockPoolQuery([], [{ count: 0 }]);

    await listPendingPhotos({ actorId: ACTOR_UUID, actorRole: 'curator', limit: 200 });

    const [sql] = findDataCall();
    // The contribution LATERAL defends against a rare race where two
    // non-revoked contributions could point to the same photo.
    const contribSection = sql.slice(sql.indexOf('photo_contributions'));
    expect(contribSection).toContain("status != 'revoked'");
    expect(contribSection).toContain('file_copied = true');
    expect(contribSection).toContain('LIMIT 1');
  });
});

describe('getPendingPhotoCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the count value', async () => {
    mockPoolQuery([{ count: 42 }]);

    const count = await getPendingPhotoCount();

    expect(count).toBe(42);
    expect(vi.mocked(pool.query).mock.calls[0]![0]).toContain("status = 'pending'");
  });

  it('returns 0 when no rows come back', async () => {
    mockPoolQuery([]);

    const count = await getPendingPhotoCount();
    expect(count).toBe(0);
  });
});

describe('loadPhotoForDecision', () => {
  it('returns null when the photo does not exist', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } satisfies QueryOnlyClient;

    const result = await loadPhotoForDecision(mockClient, PHOTO_UUID);
    expect(result).toBeNull();
  });

  it('returns a null contribution when the joined fields are null', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: PHOTO_UUID,
            status: 'pending',
            visibility: 'public',
            contributed_by: null,
            intent: null,
            contribution_status: null,
            file_copied: null,
          },
        ],
        rowCount: 1,
      }),
    } satisfies QueryOnlyClient;

    const result = await loadPhotoForDecision(mockClient, PHOTO_UUID);
    expect(result).not.toBeNull();
    expect(result!.contribution).toBeNull();
  });

  it('returns a populated contribution including status and file_copied', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: PHOTO_UUID,
            status: 'pending',
            visibility: 'training_only',
            contributed_by: ACTOR_UUID,
            intent: 'training_only',
            contribution_status: 'pending',
            file_copied: true,
          },
        ],
        rowCount: 1,
      }),
    } satisfies QueryOnlyClient;

    const result = await loadPhotoForDecision(mockClient, PHOTO_UUID);
    expect(result).not.toBeNull();
    expect(result!.contribution).toEqual({
      contributed_by: ACTOR_UUID,
      intent: 'training_only',
      status: 'pending',
      file_copied: true,
    });
  });

  it('returns a contribution with status=revoked so the handler can guard on it', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: PHOTO_UUID,
            status: 'pending',
            visibility: 'training_only',
            contributed_by: ACTOR_UUID,
            intent: 'training_only',
            contribution_status: 'revoked',
            file_copied: true,
          },
        ],
        rowCount: 1,
      }),
    } satisfies QueryOnlyClient;

    const result = await loadPhotoForDecision(mockClient, PHOTO_UUID);
    expect(result).not.toBeNull();
    expect(result!.contribution).not.toBeNull();
    expect(result!.contribution!.status).toBe('revoked');
  });

  it('uses FOR UPDATE to lock the contribution row against concurrent revokes', async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const mockClient = { query: queryFn } satisfies QueryOnlyClient;

    await loadPhotoForDecision(mockClient, PHOTO_UUID);

    const sql = queryFn.mock.calls[0]![0] as string;
    expect(sql).toContain('FOR UPDATE');
  });
});

describe('getPhotoStatus', () => {
  it('returns the status value', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ status: 'approved' }], rowCount: 1 }),
    } satisfies QueryOnlyClient;

    const status = await getPhotoStatus(mockClient, PHOTO_UUID);
    expect(status).toBe('approved');
  });

  it('returns null when no row', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } satisfies QueryOnlyClient;

    const status = await getPhotoStatus(mockClient, PHOTO_UUID);
    expect(status).toBeNull();
  });
});

describe('decidePhoto', () => {
  it('passes all parameters into the UPDATE', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: PHOTO_UUID,
            item_id: 'item-1',
            url: 'u',
            status: 'approved',
            visibility: 'public',
            rejection_reason_code: null,
            rejection_reason_text: null,
            updated_at: '2026-04-01T12:00:00Z',
          },
        ],
        rowCount: 1,
      }),
    } satisfies QueryOnlyClient;

    await decidePhoto(mockClient, {
      id: PHOTO_UUID,
      status: 'approved',
      expectedStatus: 'pending',
      rejectionReasonCode: null,
      rejectionReasonText: null,
      targetVisibility: 'public',
    });

    const callArgs = mockClient.query.mock.calls[0]!;
    const sql = callArgs[0] as string;
    const params = callArgs[1] as unknown[];

    expect(sql).toContain('UPDATE item_photos');
    expect(sql).toContain('rejection_reason_code = $2');
    expect(sql).toContain('rejection_reason_text = $3');
    expect(sql).toContain('COALESCE($6, visibility)');
    expect(sql).toContain('($5::text IS NULL OR status = $5::text)');
    expect(params).toEqual(['approved', null, null, PHOTO_UUID, 'pending', 'public']);
  });

  it('returns null when 0 rows are affected', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } satisfies QueryOnlyClient;

    const result = await decidePhoto(mockClient, {
      id: PHOTO_UUID,
      status: 'approved',
      expectedStatus: 'pending',
      rejectionReasonCode: null,
      rejectionReasonText: null,
      targetVisibility: null,
    });

    expect(result).toBeNull();
  });
});

describe('mirrorContributionStatus', () => {
  it('filters != revoked, not = pending, to support undo-and-redo', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } satisfies QueryOnlyClient;

    await mirrorContributionStatus(mockClient, PHOTO_UUID, 'approved');

    const sql = mockClient.query.mock.calls[0]![0] as string;
    expect(sql).toContain("status != 'revoked'");
    expect(sql).not.toContain("status = 'pending'");
    expect(mockClient.query.mock.calls[0]![1]).toEqual(['approved', PHOTO_UUID]);
  });
});
