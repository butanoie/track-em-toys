import { pool } from '../../db/pool.js';
import type { QueryOnlyClient } from '../../db/queries.js';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

/** The 6 allowed rejection reason codes, matching migration 038. */
export const REJECTION_REASON_CODES = ['blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other'] as const;

export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

export type PhotoStatus = 'pending' | 'approved' | 'rejected';
export type PhotoVisibility = 'public' | 'training_only';
export type ContributionIntent = 'training_only' | 'catalog_and_training';

/**
 * Joined row shape returned by listPendingPhotos.
 * Snake_case matches DB column names; the route handler maps these into the
 * final API response shape (collapsing uploader_* fields into a single object
 * when present, or null when the uploader is missing or tombstoned).
 */
export interface PendingPhotoRow {
  id: string;
  url: string;
  caption: string | null;
  visibility: PhotoVisibility;
  created_at: string;

  item_id: string;
  item_name: string;
  item_slug: string;
  franchise_slug: string;
  item_thumbnail_url: string | null;

  uploader_id: string | null;
  uploader_display_name: string | null;
  uploader_email: string | null;

  contribution_id: string | null;
  contributed_by: string | null;
  consent_version: string | null;
  consent_granted_at: string | null;
  contribution_intent: ContributionIntent | null;

  existing_photos: Array<{ id: string; url: string }>;
  can_decide: boolean;
}

/** Minimal row shape for the self-approval guard + optimistic concurrency check. */
export interface PhotoForDecisionRow {
  id: string;
  status: PhotoStatus;
  visibility: PhotoVisibility;
  /**
   * Non-null whenever a `photo_contributions` row exists for this photo,
   * regardless of its status. The handler must reject any decision when
   * `contribution.status === 'revoked'` so curators cannot approve a photo
   * whose contributor has explicitly revoked consent.
   *
   * `file_copied` is also tracked because partial-copy crash-recovery rows
   * (file_copied=false) should not be eligible for decision either.
   */
  contribution: {
    contributed_by: string;
    intent: ContributionIntent;
    status: 'pending' | 'approved' | 'rejected' | 'revoked';
    file_copied: boolean;
  } | null;
}

/** UPDATE RETURNING row shape, returned to the client on a successful decide. */
export interface DecidedPhotoRow {
  id: string;
  item_id: string;
  url: string;
  status: PhotoStatus;
  visibility: PhotoVisibility;
  rejection_reason_code: RejectionReasonCode | null;
  rejection_reason_text: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Column constants
// ---------------------------------------------------------------------------

/** RETURNING column list for PATCH /admin/photos/:id/status. */
const ADMIN_PHOTO_DECISION_COLUMNS =
  'id, item_id, url, status, visibility, rejection_reason_code, rejection_reason_text, updated_at';

/**
 * Single source of truth for the pending-photo count predicate.
 *
 * Used by both `listPendingPhotos` (alongside the data query) and the
 * standalone `getPendingPhotoCount` for the nav notification dot. If the
 * pending predicate ever gains additional filters (e.g. soft delete), update
 * this constant in one place rather than two diverging string literals.
 */
const PENDING_COUNT_SQL = `SELECT COUNT(*)::int AS count FROM item_photos WHERE status = 'pending'`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * List the oldest 200 pending photos with everything the triage UI needs:
 * item metadata, uploader (tombstone-coerced to NULL), contribution audit,
 * 3 most-recent public-approved existing photos, and a server-computed
 * can_decide flag implementing the self-approval guard at the list level.
 *
 * The contribution join is LATERAL with LIMIT 1 so that if two non-revoked
 * contributions ever point to the same photo (race condition in the contribute
 * handler), the outer row is not duplicated.
 *
 * The existing_photos LATERAL subquery filters visibility='public' so the
 * sidebar shows only photos the public catalog would show — training_only
 * photos are irrelevant for visual orientation.
 *
 * No RLS on item_photos — uses pool.query() directly, no transaction needed.
 *
 * @param params - Listing parameters: `actorId` (the requesting curator's UUID,
 *   used to compute `can_decide` — false when actor == contributor) and `limit`
 *   (max photos to return; amendment caps at 200).
 */
export async function listPendingPhotos(params: {
  actorId: string;
  limit: number;
}): Promise<{ rows: PendingPhotoRow[]; totalCount: number }> {
  const dataQuery = `
    SELECT
      ip.id,
      ip.url,
      ip.caption,
      ip.visibility,
      ip.created_at,
      i.id            AS item_id,
      i.name          AS item_name,
      i.slug          AS item_slug,
      fr.slug         AS franchise_slug,
      prim.url        AS item_thumbnail_url,
      u.id            AS uploader_id,
      u.display_name  AS uploader_display_name,
      u.email         AS uploader_email,
      pc.id           AS contribution_id,
      pc.contributed_by,
      pc.consent_version,
      pc.consent_granted_at,
      pc.intent       AS contribution_intent,
      COALESCE(ep.photos, '[]'::json) AS existing_photos,
      (pc.contributed_by IS NULL OR LOWER(pc.contributed_by::text) != LOWER($1::text)) AS can_decide
    FROM item_photos ip
    INNER JOIN items i ON i.id = ip.item_id
    INNER JOIN franchises fr ON fr.id = i.franchise_id
    LEFT JOIN LATERAL (
      SELECT url FROM item_photos
      WHERE item_id = ip.item_id
        AND status = 'approved'
        AND visibility = 'public'
        AND is_primary = true
      LIMIT 1
    ) prim ON true
    LEFT JOIN users u ON u.id = ip.uploaded_by AND u.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT id, contributed_by, consent_version, consent_granted_at, intent
      FROM photo_contributions
      WHERE item_photo_id = ip.id
        AND status != 'revoked'
        AND file_copied = true
      ORDER BY created_at ASC
      LIMIT 1
    ) pc ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', ep_inner.id, 'url', ep_inner.url)) AS photos
      FROM (
        SELECT id, url FROM item_photos
        WHERE item_id = ip.item_id
          AND status = 'approved'
          AND visibility = 'public'
        ORDER BY created_at DESC
        LIMIT 3
      ) ep_inner
    ) ep ON true
    WHERE ip.status = 'pending'
    ORDER BY ip.created_at ASC
    LIMIT $2
  `;

  const [dataResult, countResult] = await Promise.all([
    pool.query<PendingPhotoRow>(dataQuery, [params.actorId, params.limit]),
    pool.query<{ count: number }>(PENDING_COUNT_SQL),
  ]);

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.count ?? 0,
  };
}

/**
 * Count pending photos. Uses the same partial index as listPendingPhotos.
 * Lightweight query for the admin nav notification dot.
 */
export async function getPendingPhotoCount(): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(PENDING_COUNT_SQL);
  return rows[0]?.count ?? 0;
}

/**
 * Load a single photo's minimal decision-relevant state: status, visibility,
 * and any attached non-revoked contribution. Used by the PATCH handler to
 * run the self-approval guard and compute the target visibility before the
 * UPDATE.
 *
 * Returns null if the photo row does not exist.
 *
 * @param client - Transaction client
 * @param id - item_photos.id
 */
export async function loadPhotoForDecision(client: QueryOnlyClient, id: string): Promise<PhotoForDecisionRow | null> {
  // Loads the contribution row regardless of status (including 'revoked') and
  // regardless of file_copied. Filtering happens in the handler so a revoked
  // or partially-copied contribution is observable and explicitly rejected,
  // closing the undo+revoke race window.
  //
  // Locks the contribution row FOR UPDATE to prevent a concurrent revoke from
  // sneaking between this load and the subsequent UPDATE statements.
  const { rows } = await client.query<{
    id: string;
    status: PhotoStatus;
    visibility: PhotoVisibility;
    contributed_by: string | null;
    intent: ContributionIntent | null;
    contribution_status: 'pending' | 'approved' | 'rejected' | 'revoked' | null;
    file_copied: boolean | null;
  }>(
    `SELECT ip.id, ip.status, ip.visibility,
            pc.contributed_by, pc.intent,
            pc.status AS contribution_status, pc.file_copied
     FROM item_photos ip
     LEFT JOIN LATERAL (
       SELECT contributed_by, intent, status, file_copied
       FROM photo_contributions
       WHERE item_photo_id = ip.id
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE
     ) pc ON true
     WHERE ip.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    visibility: row.visibility,
    contribution:
      row.contributed_by !== null && row.intent !== null && row.contribution_status !== null && row.file_copied !== null
        ? {
            contributed_by: row.contributed_by,
            intent: row.intent,
            status: row.contribution_status,
            file_copied: row.file_copied,
          }
        : null,
  };
}

/**
 * Fetch just the current status of a photo. Used on the 409 Conflict path
 * after an optimistic concurrency check fails, so the client can see the
 * actual current status and refetch the queue.
 *
 * The value may be stale between the failed UPDATE and this SELECT — that's
 * acceptable because the client refetches the whole queue on 409.
 *
 * @param client - Transaction client
 * @param id - item_photos.id
 */
export async function getPhotoStatus(client: QueryOnlyClient, id: string): Promise<PhotoStatus | null> {
  const { rows } = await client.query<{ status: PhotoStatus }>('SELECT status FROM item_photos WHERE id = $1', [id]);
  return rows[0]?.status ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Atomic photo decision UPDATE with optimistic concurrency check.
 *
 * Updates item_photos.status, visibility (via COALESCE — null means unchanged),
 * rejection reason columns (always set to the provided values, including the
 * undo path where they're null), and updated_at. Returns null if 0 rows were
 * affected, which indicates an optimistic concurrency conflict — the caller
 * should return 409 with the actual current status.
 *
 * The $5::text IS NULL OR status = $5 guard pattern lets callers optionally
 * pass an expectedStatus without branching the SQL.
 *
 * @param client - Transaction client
 * @param params - Decision parameters
 */
export async function decidePhoto(
  client: QueryOnlyClient,
  params: {
    id: string;
    status: PhotoStatus;
    expectedStatus: PhotoStatus | null;
    rejectionReasonCode: RejectionReasonCode | null;
    rejectionReasonText: string | null;
    /** New visibility (only meaningful on approve). Null means "leave unchanged". */
    targetVisibility: PhotoVisibility | null;
  }
): Promise<DecidedPhotoRow | null> {
  const { rows } = await client.query<DecidedPhotoRow>(
    `UPDATE item_photos
     SET status                = $1,
         rejection_reason_code = $2,
         rejection_reason_text = $3,
         visibility            = COALESCE($6, visibility),
         updated_at            = NOW()
     WHERE id = $4
       AND ($5::text IS NULL OR status = $5::text)
     RETURNING ${ADMIN_PHOTO_DECISION_COLUMNS}`,
    [
      params.status,
      params.rejectionReasonCode,
      params.rejectionReasonText,
      params.id,
      params.expectedStatus,
      params.targetVisibility,
    ]
  );
  return rows[0] ?? null;
}

/**
 * Mirror a photo decision onto the corresponding photo_contributions row.
 *
 * Filter is `status != 'revoked'` (NOT `= 'pending'`) so the undo-and-redo
 * flow works: if a contribution was previously approved and is being
 * re-approved after an undo, the WHERE clause still matches.
 *
 * For direct curator uploads with no photo_contributions row, 0 rows are
 * affected — that's fine.
 *
 * @param client - Transaction client
 * @param itemPhotoId - item_photos.id
 * @param status - New contribution status (mirrors the item_photos status)
 */
export async function mirrorContributionStatus(
  client: QueryOnlyClient,
  itemPhotoId: string,
  status: PhotoStatus
): Promise<void> {
  await client.query(
    `UPDATE photo_contributions
     SET status = $1, updated_at = NOW()
     WHERE item_photo_id = $2 AND status != 'revoked'`,
    [status, itemPhotoId]
  );
}
