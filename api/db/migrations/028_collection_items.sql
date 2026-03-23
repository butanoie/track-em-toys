-- migrate:up
-- ============================================================================
-- Migration 028: Personal Collection
--
-- First RLS-protected table. Users can add catalog items to their personal
-- collection, tracking condition and notes per physical copy.
--
-- Design decisions:
--   - No UNIQUE(user_id, item_id): users may own multiple copies
--   - Soft delete via deleted_at (tombstone, never hard-purge via API)
--   - item_condition enum covers 7 states from sealed to damaged
--   - RLS context set via app.user_id session var (see migration 004)
--   - FORCE ROW LEVEL SECURITY: table owner also subject to policies
-- ============================================================================

-- ─── 1. item_condition enum ───────────────────────────────────────────────────
-- "opened" = packaging retained; "loose" = no packaging

CREATE TYPE public.item_condition AS ENUM (
    'mint_sealed',
    'opened_complete',
    'opened_incomplete',
    'loose_complete',
    'loose_incomplete',
    'damaged',
    'unknown'
);

-- ─── 2. collection_items table ────────────────────────────────────────────────
-- One row per physical copy owned by a user.

CREATE TABLE public.collection_items (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID            NOT NULL REFERENCES public.users(id),
    item_id     UUID            NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    condition   item_condition  NOT NULL DEFAULT 'unknown',
    notes       TEXT,
    deleted_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- ─── 3. updated_at trigger ────────────────────────────────────────────────────
-- Uses update_updated_at() trigger function from migration 001.

CREATE TRIGGER collection_items_updated_at
    BEFORE UPDATE ON public.collection_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 4. Indexes ───────────────────────────────────────────────────────────────
-- Partial indexes on active rows only (WHERE deleted_at IS NULL).

-- Primary access pattern: list all active items for a user
CREATE INDEX idx_collection_items_user_active
    ON public.collection_items (user_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Check endpoint: look up specific item_ids for a user
CREATE INDEX idx_collection_items_user_item
    ON public.collection_items (user_id, item_id)
    WHERE deleted_at IS NULL;

-- ─── 5. Row Level Security ────────────────────────────────────────────────────

ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items FORCE ROW LEVEL SECURITY;

CREATE POLICY collection_items_select
    ON public.collection_items
    FOR SELECT
    USING (user_id = (SELECT current_app_user_id()));

CREATE POLICY collection_items_insert
    ON public.collection_items
    FOR INSERT
    WITH CHECK (user_id = (SELECT current_app_user_id()));

CREATE POLICY collection_items_update
    ON public.collection_items
    FOR UPDATE
    USING (user_id = (SELECT current_app_user_id()))
    WITH CHECK (user_id = (SELECT current_app_user_id()));

-- Defensive: not exercised by the soft-delete API, but available for future
-- hard-purge operations.
CREATE POLICY collection_items_delete
    ON public.collection_items
    FOR DELETE
    USING (user_id = (SELECT current_app_user_id()));

-- migrate:down
DROP TRIGGER IF EXISTS collection_items_updated_at ON public.collection_items;
DROP TABLE IF EXISTS public.collection_items;
DROP TYPE IF EXISTS public.item_condition CASCADE;
