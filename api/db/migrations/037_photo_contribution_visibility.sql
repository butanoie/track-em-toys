-- migrate:up
-- ============================================================================
-- Migration 037: Photo Contribution Visibility (Phase 1.6 amendment #148)
--
-- Adds a contributor-intent choice to the contribution flow. Each contribution
-- declares one of:
--   - 'training_only'        — used for ML training only, never shown in the
--                              public catalog
--   - 'catalog_and_training' — shown in the catalog AND used for ML training
--                              (superset of training_only, not an alternative)
--
-- Two new columns:
--   - item_photos.visibility         — controls public catalog inclusion
--                                      (mutable, curator-controlled)
--   - photo_contributions.intent     — locked-in contributor consent
--                                      (immutable audit)
--
-- Backfill:
--   - All existing item_photos rows that came via a contribution are downgraded
--     to 'training_only' (privacy-default). Acceptable because zero production
--     users have contributed photos at this point in the project.
--   - Direct curator uploads (no photo_contributions row) keep the new default
--     'public', preserving existing behavior for catalog photos.
--   - All existing photo_contributions rows are set to 'training_only' (matches
--     the new column default; explicit for clarity).
-- ============================================================================

-- ─── 1. item_photos.visibility ───────────────────────────────────────────────

ALTER TABLE public.item_photos
    ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'training_only'));

-- ─── 2. photo_contributions.intent ───────────────────────────────────────────

ALTER TABLE public.photo_contributions
    ADD COLUMN intent TEXT NOT NULL DEFAULT 'training_only'
        CHECK (intent IN ('training_only', 'catalog_and_training'));

-- ─── 3. Backfill ─────────────────────────────────────────────────────────────

-- Downgrade every item_photos row that was created via a contribution.
-- Direct curator uploads have no photo_contributions row and keep 'public'.
UPDATE public.item_photos ip
    SET visibility = 'training_only'
    FROM public.photo_contributions pc
    WHERE pc.item_photo_id = ip.id;

-- Explicit backfill of photo_contributions (matches the new column default;
-- written explicitly so the intent of the backfill is auditable).
UPDATE public.photo_contributions
    SET intent = 'training_only';

-- ─── 4. Index for catalog list query ─────────────────────────────────────────

-- The public catalog photo list (listPhotos) filters
-- `WHERE item_id = $1 AND status = 'approved' AND visibility = 'public'`.
-- This partial index matches that predicate exactly.
CREATE INDEX idx_item_photos_public_approved
    ON public.item_photos (item_id, sort_order)
    WHERE visibility = 'public' AND status = 'approved';

-- migrate:down
DROP INDEX IF EXISTS public.idx_item_photos_public_approved;
ALTER TABLE public.photo_contributions DROP COLUMN IF EXISTS intent;
ALTER TABLE public.item_photos DROP COLUMN IF EXISTS visibility;
