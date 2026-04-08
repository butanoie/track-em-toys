-- migrate:up
-- ============================================================================
-- Migration 038: Item Photos Rejection Reasons (Phase 1.9b #72)
--
-- Adds rejection reason columns to item_photos for the curator Photo Approval
-- Dashboard. Curators can reject pending photos with a structured reason code
-- (blurry, wrong_item, nsfw, duplicate, poor_quality, other) plus an optional
-- free-text note when code='other'.
--
-- Two new columns:
--   - rejection_reason_code  — enum-like TEXT, queryable, badge-friendly
--   - rejection_reason_text  — free-form note, only allowed when code='other'
--
-- Both columns are nullable and have no default. They stay NULL on every
-- existing row (all are either approved or pending). Populated only when the
-- curator rejects a photo via PATCH /admin/photos/:id/status.
--
-- Two CHECK constraints protect against illegal state:
--   - rejection_text only when code='other'
--   - rejection_code only when status='rejected'
--
-- The handler always clears both reason columns in the SAME UPDATE when the
-- target status is not 'rejected' (undo flow) to avoid a transient state that
-- violates the code/status constraint mid-transaction.
--
-- One new partial index:
--   - idx_item_photos_pending_created: accelerates the pending queue listing
--     `SELECT ... WHERE status='pending' ORDER BY created_at ASC LIMIT 200`
-- ============================================================================

-- ─── 1. rejection_reason_code ────────────────────────────────────────────────

ALTER TABLE public.item_photos
    ADD COLUMN rejection_reason_code TEXT
        CHECK (rejection_reason_code IN
            ('blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other'));

-- ─── 2. rejection_reason_text ────────────────────────────────────────────────

ALTER TABLE public.item_photos
    ADD COLUMN rejection_reason_text TEXT;

-- ─── 3. Cross-field CHECK constraints ────────────────────────────────────────

-- Text note only allowed when the code is 'other'
ALTER TABLE public.item_photos
    ADD CONSTRAINT item_photos_rejection_text_only_other CHECK (
        rejection_reason_text IS NULL OR rejection_reason_code = 'other'
    );

-- Reason code only allowed when status is 'rejected'
ALTER TABLE public.item_photos
    ADD CONSTRAINT item_photos_rejection_code_only_rejected CHECK (
        rejection_reason_code IS NULL OR status = 'rejected'
    );

-- ─── 4. Partial index for pending queue listing ──────────────────────────────

-- The Photo Approval Dashboard lists pending photos oldest-first:
--   SELECT ... FROM item_photos WHERE status = 'pending'
--   ORDER BY created_at ASC LIMIT 200
-- This partial index matches the predicate exactly and keeps the queue query
-- cheap even when the table grows. `created_at ASC` is implicit in btree, but
-- specifying it makes the ordering intent explicit.
CREATE INDEX idx_item_photos_pending_created
    ON public.item_photos (created_at ASC)
    WHERE status = 'pending';

-- migrate:down
DROP INDEX IF EXISTS public.idx_item_photos_pending_created;
ALTER TABLE public.item_photos
    DROP CONSTRAINT IF EXISTS item_photos_rejection_code_only_rejected;
ALTER TABLE public.item_photos
    DROP CONSTRAINT IF EXISTS item_photos_rejection_text_only_other;
ALTER TABLE public.item_photos DROP COLUMN IF EXISTS rejection_reason_text;
ALTER TABLE public.item_photos DROP COLUMN IF EXISTS rejection_reason_code;
