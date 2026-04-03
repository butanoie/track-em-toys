-- migrate:up
-- ============================================================================
-- Migration 036: Collection Item Photos + Photo Contributions
--
-- Two new tables for user-private collection photos and the optional
-- "contribute to catalog" flow.
--
-- Design decisions:
--   - collection_item_photos: RLS-protected (FORCE), user_id denormalized for
--     efficient per-row policy evaluation
--   - photo_contributions: NO RLS (shared audit data, like item_photos)
--   - collection_item_photo_id is nullable with ON DELETE SET NULL so that
--     GDPR deletion of collection photos preserves contribution audit records
--   - item_photos.uploaded_by is already nullable (migration 011) — no ALTER
-- ============================================================================

-- ─── 1. collection_item_photos ───────────────────────────────────────────────

CREATE TABLE public.collection_item_photos (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_item_id  UUID            NOT NULL REFERENCES public.collection_items(id) ON DELETE RESTRICT,
    user_id             UUID            NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    url                 TEXT            NOT NULL,
    caption             TEXT,
    is_primary          BOOLEAN         NOT NULL DEFAULT false,
    sort_order          INTEGER         NOT NULL DEFAULT 0,
    dhash               TEXT            NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TRIGGER collection_item_photos_updated_at
    BEFORE UPDATE ON public.collection_item_photos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Primary access: list photos for a collection item, ordered
CREATE INDEX idx_collection_item_photos_item
    ON public.collection_item_photos (collection_item_id, sort_order ASC);

-- Enforce at most one primary photo per collection item
CREATE UNIQUE INDEX idx_collection_item_photos_one_primary
    ON public.collection_item_photos (collection_item_id)
    WHERE is_primary = true;

-- ─── 2. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE public.collection_item_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_item_photos FORCE ROW LEVEL SECURITY;

CREATE POLICY collection_item_photos_select
    ON public.collection_item_photos
    FOR SELECT
    USING (user_id = (SELECT current_app_user_id()));

CREATE POLICY collection_item_photos_insert
    ON public.collection_item_photos
    FOR INSERT
    WITH CHECK (user_id = (SELECT current_app_user_id()));

CREATE POLICY collection_item_photos_update
    ON public.collection_item_photos
    FOR UPDATE
    USING (user_id = (SELECT current_app_user_id()))
    WITH CHECK (user_id = (SELECT current_app_user_id()));

CREATE POLICY collection_item_photos_delete
    ON public.collection_item_photos
    FOR DELETE
    USING (user_id = (SELECT current_app_user_id()));

-- ─── 3. photo_contributions ──────────────────────────────────────────────────
-- Audit trail for user photo contributions to the shared catalog.
-- No RLS — shared application data (like item_photos).

CREATE TABLE public.photo_contributions (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_item_photo_id    UUID            REFERENCES public.collection_item_photos(id) ON DELETE SET NULL,
    item_photo_id               UUID            REFERENCES public.item_photos(id) ON DELETE SET NULL,
    contributed_by              UUID            NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    item_id                     UUID            NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    consent_version             TEXT            NOT NULL,
    consent_granted_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    file_copied                 BOOLEAN         NOT NULL DEFAULT false,
    status                      TEXT            NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TRIGGER photo_contributions_updated_at
    BEFORE UPDATE ON public.photo_contributions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Prevent double-contributing the same source photo (revoked contributions can be re-contributed)
CREATE UNIQUE INDEX idx_photo_contributions_source
    ON public.photo_contributions (collection_item_photo_id)
    WHERE status != 'revoked' AND collection_item_photo_id IS NOT NULL;

CREATE INDEX idx_photo_contributions_user
    ON public.photo_contributions (contributed_by);

CREATE INDEX idx_photo_contributions_item
    ON public.photo_contributions (item_id, status);

-- migrate:down
DROP TRIGGER IF EXISTS photo_contributions_updated_at ON public.photo_contributions;
DROP TABLE IF EXISTS public.photo_contributions;
DROP TRIGGER IF EXISTS collection_item_photos_updated_at ON public.collection_item_photos;
DROP TABLE IF EXISTS public.collection_item_photos;
