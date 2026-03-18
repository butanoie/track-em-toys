-- migrate:up
-- ============================================================================
-- Migration 017: Add franchise_id to items with auto-populate trigger
--
-- Items inherit franchise context from their toy line. This migration adds
-- a direct franchise_id FK for efficient franchise-scoped queries, and a
-- BEFORE INSERT OR UPDATE trigger to auto-populate it from toy_line_id.
--
-- The trigger prevents denormalization drift on both INSERT (ingest script
-- does not pass franchise_id) and UPDATE (toy_line_id change re-derives
-- franchise_id automatically).
--
-- Also creates the items slug scoping index and pagination indexes that
-- were deferred from migration 016 (they depend on franchise_id existing).
--
-- Preconditions (guaranteed by prior migrations):
--   - items.toy_line_id is NOT NULL (migration 012)
--   - toy_lines.franchise_id is NOT NULL (migration 015)
--   - items.slug global UNIQUE constraint already dropped (migration 016)
-- ============================================================================

-- ─── 1. Add nullable franchise_id column ─────────────────────────────────────

ALTER TABLE public.items
    ADD COLUMN franchise_id UUID;

-- ─── 2. Populate from toy_lines.franchise_id ─────────────────────────────────

UPDATE public.items i
   SET franchise_id = tl.franchise_id
  FROM public.toy_lines tl
 WHERE i.toy_line_id = tl.id;

-- ─── 3. Set NOT NULL + FK constraint ─────────────────────────────────────────

ALTER TABLE public.items
    ALTER COLUMN franchise_id SET NOT NULL;

ALTER TABLE public.items
    ADD CONSTRAINT items_franchise_id_fkey
    FOREIGN KEY (franchise_id) REFERENCES public.franchises(id) ON DELETE RESTRICT;

-- ─── 4. Performance index ────────────────────────────────────────────────────

CREATE INDEX idx_items_franchise
    ON public.items (franchise_id);

-- ─── 5. Items slug scoping (deferred from migration 016) ────────────────────
-- Now that franchise_id exists, create the composite unique index.

CREATE UNIQUE INDEX idx_items_slug_franchise
    ON public.items (slug, franchise_id);

-- ─── 6. Items cursor pagination indexes (deferred from migration 016) ────────

CREATE INDEX idx_items_name_id
    ON public.items (name, id);

CREATE INDEX idx_items_franchise_name_id
    ON public.items (franchise_id, name, id);

-- ─── 7. Auto-populate trigger ────────────────────────────────────────────────
-- On INSERT: derive franchise_id from toy_line_id when franchise_id is NULL.
-- On UPDATE: re-derive franchise_id when toy_line_id changes.
-- This keeps the ingest script working and prevents denormalization drift.

CREATE OR REPLACE FUNCTION public.items_default_franchise_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.franchise_id IS NULL OR
       (TG_OP = 'UPDATE' AND NEW.toy_line_id IS DISTINCT FROM OLD.toy_line_id) THEN
        SELECT franchise_id INTO NEW.franchise_id
          FROM public.toy_lines
         WHERE id = NEW.toy_line_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_default_franchise
    BEFORE INSERT OR UPDATE ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.items_default_franchise_id();

-- migrate:down

DROP TRIGGER IF EXISTS items_default_franchise ON public.items;
DROP FUNCTION IF EXISTS public.items_default_franchise_id();

DROP INDEX IF EXISTS idx_items_franchise_name_id;
DROP INDEX IF EXISTS idx_items_name_id;
DROP INDEX IF EXISTS idx_items_slug_franchise;
DROP INDEX IF EXISTS idx_items_franchise;

ALTER TABLE public.items
    DROP CONSTRAINT IF EXISTS items_franchise_id_fkey;

ALTER TABLE public.items
    DROP COLUMN IF EXISTS franchise_id;
