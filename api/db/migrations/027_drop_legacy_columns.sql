-- migrate:up
-- ============================================================================
-- Migration 027: Drop legacy combiner and item-character columns
--
-- Removes columns superseded by the relationship system:
-- - characters.combined_form_id  → replaced by character_relationships
-- - characters.combiner_role     → replaced by character_relationships
-- - items.character_id           → replaced by item_character_depictions
-- - items.character_appearance_id → replaced by item_character_depictions
--
-- Preconditions:
-- - character_relationships table exists and is populated (migration 024)
-- - item_character_depictions table exists and is backfilled (migration 025)
-- - Ingest script and API queries no longer reference these columns
-- ============================================================================

-- 1. Drop legacy combiner columns from characters
DROP INDEX IF EXISTS idx_characters_combined_form;
ALTER TABLE public.characters DROP COLUMN IF EXISTS combined_form_id;
ALTER TABLE public.characters DROP COLUMN IF EXISTS combiner_role;

-- 2. Drop legacy item-character columns from items
DROP INDEX IF EXISTS idx_items_character;
ALTER TABLE public.items DROP COLUMN IF EXISTS character_id;
ALTER TABLE public.items DROP COLUMN IF EXISTS character_appearance_id;

-- migrate:down
-- NOTE: Columns are restored as nullable — data cannot be recovered after drop.
-- This DOWN is for schema rollback in dev only; re-seed to repopulate.

ALTER TABLE public.characters
    ADD COLUMN combined_form_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
    ADD COLUMN combiner_role TEXT;

CREATE INDEX idx_characters_combined_form
    ON public.characters (combined_form_id) WHERE combined_form_id IS NOT NULL;

ALTER TABLE public.items
    ADD COLUMN character_id UUID REFERENCES public.characters(id),
    ADD COLUMN character_appearance_id UUID REFERENCES public.character_appearances(id) ON DELETE SET NULL;

CREATE INDEX idx_items_character ON public.items (character_id);
