-- migrate:up
-- ============================================================================
-- Migration 017: Add franchise_id to items with auto-populate trigger
--
-- Items inherit franchise context from their toy line. This migration adds
-- a direct franchise_id FK for efficient franchise-scoped queries, and a
-- BEFORE INSERT trigger to auto-populate it from toy_line_id when NULL.
--
-- The trigger prevents denormalization drift and keeps the ingest script
-- working without changes (ingest does not pass franchise_id explicitly).
--
-- Preconditions (guaranteed by prior migrations):
--   - items.toy_line_id is NOT NULL (migration 012)
--   - toy_lines.franchise_id is NOT NULL (migration 015)
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

-- ─── 5. Auto-populate trigger ────────────────────────────────────────────────
-- When franchise_id is NULL on INSERT, derive it from the toy_line's franchise.
-- This keeps the ingest script working (it does not pass franchise_id) and
-- prevents drift between items.franchise_id and toy_lines.franchise_id for
-- new inserts.

CREATE OR REPLACE FUNCTION public.items_default_franchise_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.franchise_id IS NULL THEN
        SELECT franchise_id INTO NEW.franchise_id
          FROM public.toy_lines
         WHERE id = NEW.toy_line_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_default_franchise
    BEFORE INSERT ON public.items
    FOR EACH ROW
    EXECUTE FUNCTION public.items_default_franchise_id();

-- migrate:down

DROP TRIGGER IF EXISTS items_default_franchise ON public.items;
DROP FUNCTION IF EXISTS public.items_default_franchise_id();

DROP INDEX IF EXISTS idx_items_franchise;

ALTER TABLE public.items
    DROP CONSTRAINT IF EXISTS items_franchise_id_fkey;

ALTER TABLE public.items
    DROP COLUMN IF EXISTS franchise_id;
