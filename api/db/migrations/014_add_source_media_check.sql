-- migrate:up
-- ============================================================================
-- Migration 014: Add CHECK constraint on character_appearances.source_media
--
-- Enforces valid source_media values at the database level. Previously only
-- documented in a column comment (migration 013).
--
-- Merges "Comic" and "Manga" into a single "Comic/Manga" value — both are
-- sequential art and many Transformers publications span both categories.
-- ============================================================================

ALTER TABLE public.character_appearances
    ADD CONSTRAINT character_appearances_source_media_check
    CHECK (source_media IN ('TV', 'Comic/Manga', 'Movie', 'OVA', 'Toy-only', 'Video Game'));

-- Update the column comment to reflect the enforced values
COMMENT ON COLUMN public.character_appearances.source_media IS
    'Media type. Constrained to: TV, Comic/Manga, Movie, OVA, Toy-only, Video Game.';

-- migrate:down

ALTER TABLE public.character_appearances
    DROP CONSTRAINT IF EXISTS character_appearances_source_media_check;

COMMENT ON COLUMN public.character_appearances.source_media IS
    'Media type. Values: TV, Comic, Movie, OVA, Toy-only, Video Game, Manga.';
