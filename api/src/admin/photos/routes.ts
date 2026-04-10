import type { FastifyInstance } from 'fastify';
import { withTransaction } from '../../db/pool.js';
import { HttpError } from '../../auth/errors.js';
import * as photoQueries from './queries.js';
import type {
  ContributionIntent,
  PendingPhotoRow,
  PhotoStatus,
  PhotoVisibility,
  RejectionReasonCode,
} from './queries.js';
import { listPendingPhotosSchema, decidePhotoSchema, pendingPhotoCountSchema } from './schemas.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max pending photos returned per list request. Amendment caps the queue at 200. */
const PENDING_QUEUE_LIMIT = 200;

// Rate limits. The PATCH endpoint gets its own higher budget because a curator
// clearing a large queue via keyboard shortcuts can sustain ~1-2 decisions per
// second — the default adminRateLimitWrite (20/min) would throttle fast triage.
//
// Names are scoped to this plugin (e.g. pendingQueueRateLimit not adminRateLimitRead)
// to avoid collision with the same-named constant in admin/routes.ts, which has
// a different intended scope.
const pendingQueueRateLimit = { rateLimit: { max: 30, timeWindow: '1 minute' } } as const;
const pendingCountRateLimit = { rateLimit: { max: 60, timeWindow: '1 minute' } } as const;
const photoDecideRateLimit = { rateLimit: { max: 120, timeWindow: '1 minute' } } as const;

// ─── Request body types ─────────────────────────────────────────────────────

interface DecidePhotoBody {
  status: PhotoStatus;
  expected_status?: PhotoStatus;
  visibility?: PhotoVisibility;
  rejection_reason_code?: RejectionReasonCode;
  rejection_reason_text?: string;
}

interface IdParams {
  id: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute the target visibility for an approve decision.
 *
 * - Reject/pending decisions: return null (visibility left unchanged via COALESCE).
 * - Approve + explicit `training_only` request: demote regardless of intent.
 * - Approve, no explicit request: honor the contributor's intent
 *   (`catalog_and_training` → public, `training_only` → training_only).
 * - Approve with no contribution row (direct curator upload, dead code in
 *   practice since direct uploads never enter the queue): default to public.
 *
 * @param status - The new photo status (approved | rejected | pending)
 * @param requested - The visibility the curator explicitly requested (only `training_only` is accepted)
 * @param intent - The contributor's locked-in intent, or null for direct curator uploads
 */
function computeTargetVisibility(
  status: PhotoStatus,
  requested: PhotoVisibility | undefined,
  intent: ContributionIntent | null
): PhotoVisibility | null {
  if (status !== 'approved') return null;
  if (requested === 'training_only') return 'training_only';
  return intent === 'catalog_and_training' || intent === null ? 'public' : 'training_only';
}

/**
 * Map a raw DB row from listPendingPhotos into the API response shape.
 * Collapses the uploader_* columns into a single nullable object (tombstoned
 * users have NULL in every uploader_* column via the LEFT JOIN).
 *
 * @param row - The raw query row from listPendingPhotos
 */
function mapPendingPhotoRow(row: PendingPhotoRow) {
  return {
    id: row.id,
    item: {
      id: row.item_id,
      name: row.item_name,
      slug: row.item_slug,
      franchise_slug: row.franchise_slug,
      thumbnail_url: row.item_thumbnail_url,
    },
    photo: {
      url: row.url,
      caption: row.caption,
      visibility: row.visibility,
    },
    uploader: row.uploader_id
      ? {
          id: row.uploader_id,
          display_name: row.uploader_display_name,
          email: row.uploader_email,
        }
      : null,
    contribution:
      row.contribution_id &&
      row.contributed_by &&
      row.consent_version &&
      row.consent_granted_at &&
      row.contribution_intent
        ? {
            id: row.contribution_id,
            consent_version: row.consent_version,
            consent_granted_at: row.consent_granted_at,
            intent: row.contribution_intent,
            contributed_by: row.contributed_by,
          }
        : null,
    existing_photos: row.existing_photos,
    can_decide: row.can_decide,
    created_at: row.created_at,
  };
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

/**
 * Register admin photo approval routes under the /photos sub-plugin.
 *
 * NOTE: This sub-plugin is mounted inside adminRoutes (URL prefix /admin)
 * but uses `requireRole('curator')` — NOT `requireRole('admin')`. The URL
 * prefix is /admin/* for UI consistency (admin sidebar), but the photo
 * approval workflow is a curator concern by design. Admins inherit access
 * via the role hierarchy (admin >= curator).
 *
 * Do NOT "normalize" this by changing curator to admin or by moving the
 * routes outside /admin — the mismatch is intentional.
 *
 * @param fastify - Fastify instance
 * @param _opts - Plugin options (unused)
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin contract requires async
export async function adminPhotoRoutes(fastify: FastifyInstance, _opts: object): Promise<void> {
  const curatorPreHandler = [fastify.authenticate, fastify.requireRole('curator')];

  // ─── GET /pending ─────────────────────────────────────────────────────────

  fastify.get(
    '/pending',
    { schema: listPendingPhotosSchema, preHandler: curatorPreHandler, config: pendingQueueRateLimit },
    async (request) => {
      const actorId = request.user.sub;
      const actorRole = request.user.role;
      const { rows, totalCount } = await photoQueries.listPendingPhotos({
        actorId,
        actorRole,
        limit: PENDING_QUEUE_LIMIT,
      });
      return {
        photos: rows.map(mapPendingPhotoRow),
        total_count: totalCount,
      };
    }
  );

  // ─── GET /pending-count ───────────────────────────────────────────────────

  fastify.get(
    '/pending-count',
    { schema: pendingPhotoCountSchema, preHandler: curatorPreHandler, config: pendingCountRateLimit },
    async () => {
      const count = await photoQueries.getPendingPhotoCount();
      return { count };
    }
  );

  // ─── PATCH /:id/status ────────────────────────────────────────────────────

  fastify.patch<{ Params: IdParams; Body: DecidePhotoBody }>(
    '/:id/status',
    { schema: decidePhotoSchema, preHandler: curatorPreHandler, config: photoDecideRateLimit },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;
      const actorId = request.user.sub;

      // ─── Pre-transaction validation (cross-field rules not expressible in ajv) ───

      if (body.status === 'rejected' && !body.rejection_reason_code) {
        return reply.code(400).send({
          error: 'rejection_reason_code is required when status is rejected',
        });
      }

      if (body.rejection_reason_text !== undefined && body.rejection_reason_code !== 'other') {
        return reply.code(400).send({
          error: "rejection_reason_text is only allowed when rejection_reason_code is 'other'",
        });
      }

      if (body.visibility === 'public') {
        return reply.code(422).send({
          error: 'Cannot promote visibility to public — promotion requires re-consent from the contributor',
        });
      }

      // ─── Atomic decision inside withTransaction ────────────────────────────

      const result = await withTransaction(async (client) => {
        // Load current state + any attached contribution. The contribution
        // row (if any) is locked FOR UPDATE for the duration of the
        // transaction to prevent races with concurrent revoke operations.
        const existing = await photoQueries.loadPhotoForDecision(client, id);
        if (!existing) {
          throw new HttpError(404, { error: 'Photo not found' });
        }

        // Contribution-state guards (both return 409 with the same payload):
        //   1. Revoked: contributor has explicitly withdrawn consent. The
        //      LATERAL load returns revoked rows so this check is reachable;
        //      the FOR UPDATE lock prevents a concurrent revoke from sneaking
        //      through after we read.
        //   2. Crash-recovery: contributions whose underlying file copy never
        //      finished must not enter the decision flow either.
        if (
          existing.contribution &&
          (existing.contribution.status === 'revoked' || !existing.contribution.file_copied)
        ) {
          throw new HttpError(409, {
            error: 'Photo state has changed',
            current_status: existing.status,
          });
        }

        // Self-approval guard: curators cannot decide on their own contribution
        // (in any direction — approve, reject, or undo). Admins bypass this
        // guard by design: they are the ultimate catalog authority and may
        // need to resolve edge cases on photos they themselves contributed.
        // UUIDs are lowercased on both sides because the JWT sub may arrive
        // in either case while Postgres UUID columns always output lowercase.
        if (
          request.user.role !== 'admin' &&
          existing.contribution &&
          existing.contribution.contributed_by.toLowerCase() === actorId.toLowerCase()
        ) {
          throw new HttpError(403, { error: 'Cannot decide on your own contribution' });
        }

        // Compute the target visibility server-side from the intent + request
        const targetVisibility = computeTargetVisibility(
          body.status,
          body.visibility,
          existing.contribution?.intent ?? null
        );

        // Atomic UPDATE with optimistic concurrency guard
        const updated = await photoQueries.decidePhoto(client, {
          id,
          status: body.status,
          expectedStatus: body.expected_status ?? null,
          rejectionReasonCode: body.status === 'rejected' ? (body.rejection_reason_code ?? null) : null,
          rejectionReasonText:
            body.status === 'rejected' && body.rejection_reason_code === 'other'
              ? (body.rejection_reason_text ?? null)
              : null,
          targetVisibility,
        });

        if (!updated) {
          // 0 rows affected → expected_status mismatch. Fetch actual current
          // status. If the row has vanished entirely (deleted between
          // loadPhotoForDecision above and this UPDATE), return 404 — the 409
          // schema's current_status enum only allows valid statuses, so we
          // cannot send 'unknown' without breaking the response contract.
          const current = await photoQueries.getPhotoStatus(client, id);
          if (current === null) {
            throw new HttpError(404, { error: 'Photo not found' });
          }
          throw new HttpError(409, {
            error: 'Photo state has changed',
            current_status: current,
          });
        }

        // Mirror the decision onto photo_contributions (0 rows affected is fine
        // for direct curator uploads with no contribution row).
        await photoQueries.mirrorContributionStatus(client, id, body.status);

        return updated;
      }, actorId);

      return result;
    }
  );
}
