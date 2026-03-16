-- migrate:up
-- ============================================================================
-- Migration 013: Continuity families, character appearances, size class
--
-- 1. New reference table: continuity_families
-- 2. New editable entity: character_appearances
-- 3. Characters: replace series+continuity TEXT columns with continuity_family_id FK
-- 4. Items: add character_appearance_id FK and size_class column
--
-- continuity_family_id is the character identity boundary — G1 Megatron and
-- Beast Wars Megatron are different characters in different families.
-- character_appearances tracks visual depictions within a character (e.g.,
-- G1 cartoon Optimus vs IDW comic Optimus).
-- ============================================================================

-- -------------------------------------------------------
-- 1. Reference table: continuity_families
-- -------------------------------------------------------

CREATE TABLE public.continuity_families (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT            NOT NULL UNIQUE,
    name        TEXT            NOT NULL,
    franchise   TEXT,
    sort_order  INT,
    notes       TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.continuity_families IS
    'Continuity family groupings (Generation 1, Beast Era, Unicron Trilogy, etc.). '
    'The identity boundary for characters — same name in different families = different character. '
    'Reference table — no updated_at.';

COMMENT ON COLUMN public.continuity_families.slug IS
    'URL-safe kebab-case key (e.g., g1, beast-era, movieverse).';

COMMENT ON COLUMN public.continuity_families.sort_order IS
    'Optional display sort order. Lower values appear first.';

-- -------------------------------------------------------
-- 2. Editable entity: character_appearances
-- -------------------------------------------------------

CREATE TABLE public.character_appearances (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT            NOT NULL UNIQUE,
    name            TEXT            NOT NULL,
    character_id    UUID            NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    description     TEXT,
    source_media    TEXT,
    source_name     TEXT,
    year_start      INT,
    year_end        INT,
    metadata        JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.character_appearances IS
    'A character''s visual depiction in a specific media source. '
    'E.g., G1 cartoon Optimus Prime vs IDW comic Optimus Prime. '
    'Items optionally link to an appearance to specify which design the toy represents.';

COMMENT ON COLUMN public.character_appearances.slug IS
    'URL-safe kebab-case key, globally unique (e.g., optimus-prime-g1-cartoon, megatron-idw-phase-1).';

COMMENT ON COLUMN public.character_appearances.source_media IS
    'Media type. Values: TV, Comic, Movie, OVA, Toy-only, Video Game, Manga.';

COMMENT ON COLUMN public.character_appearances.source_name IS
    'Specific media title (e.g., The Transformers Season 1, Marvel US Comics, Bumblebee Movie).';

CREATE INDEX idx_character_appearances_character
    ON public.character_appearances (character_id);

CREATE TRIGGER character_appearances_updated_at
    BEFORE UPDATE ON public.character_appearances
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -------------------------------------------------------
-- 3. Characters: replace series+continuity with continuity_family_id
-- -------------------------------------------------------

ALTER TABLE public.characters
    ADD COLUMN continuity_family_id UUID NOT NULL
        REFERENCES public.continuity_families(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.characters.continuity_family_id IS
    'FK → continuity_families. The character identity boundary — same name in different '
    'families = different character (e.g., G1 Megatron vs Beast Wars Megatron). '
    'Replaces the free-text series and continuity columns from migration 012.';

-- Replace unique index: name+franchise+continuity → name+franchise+continuity_family_id
DROP INDEX IF EXISTS idx_characters_name_franchise_continuity;
CREATE UNIQUE INDEX idx_characters_name_franchise_cf
    ON public.characters (lower(name), lower(franchise), continuity_family_id);

-- Drop old indexes
DROP INDEX IF EXISTS idx_characters_series;
DROP INDEX IF EXISTS idx_characters_continuity;

-- Add index on new FK
CREATE INDEX idx_characters_continuity_family
    ON public.characters (continuity_family_id);

-- Drop old columns
ALTER TABLE public.characters
    DROP COLUMN IF EXISTS series,
    DROP COLUMN IF EXISTS continuity;

-- -------------------------------------------------------
-- 4. Items: add character_appearance_id and size_class
-- -------------------------------------------------------

ALTER TABLE public.items
    ADD COLUMN character_appearance_id UUID
        REFERENCES public.character_appearances(id) ON DELETE SET NULL,
    ADD COLUMN size_class TEXT;

COMMENT ON COLUMN public.items.character_appearance_id IS
    'Optional FK → character_appearances. Links an item to a specific visual depiction '
    'of a character (e.g., G1 cartoon Optimus vs Movie Optimus). NULL = generic depiction.';

COMMENT ON COLUMN public.items.size_class IS
    'Toy size class (e.g., Core, Deluxe, Voyager, Leader, Commander, Titan). '
    'Nullable — third-party figures may use non-standard or unknown sizing.';

CREATE INDEX idx_items_character_appearance
    ON public.items (character_appearance_id)
    WHERE character_appearance_id IS NOT NULL;

CREATE INDEX idx_items_size_class
    ON public.items (size_class)
    WHERE size_class IS NOT NULL;

-- migrate:down

-- 4. Revert items columns
DROP INDEX IF EXISTS idx_items_size_class;
DROP INDEX IF EXISTS idx_items_character_appearance;

ALTER TABLE public.items
    DROP COLUMN IF EXISTS size_class,
    DROP COLUMN IF EXISTS character_appearance_id;

-- 3. Restore characters: re-add series+continuity, restore old index
ALTER TABLE public.characters
    ADD COLUMN series TEXT NOT NULL DEFAULT '',
    ADD COLUMN continuity TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS idx_characters_continuity_family;
DROP INDEX IF EXISTS idx_characters_name_franchise_cf;

CREATE UNIQUE INDEX idx_characters_name_franchise_continuity
    ON public.characters (lower(name), lower(franchise), continuity);

CREATE INDEX idx_characters_series ON public.characters (series);
CREATE INDEX idx_characters_continuity ON public.characters (continuity);

ALTER TABLE public.characters
    DROP COLUMN IF EXISTS continuity_family_id;

-- Restore comments from migration 012
COMMENT ON COLUMN public.characters.series IS
    'Anime/show/toyline series. Always populated. NA G1 values: '
    '''The Transformers Season 1'', ''The Transformers Season 2'', '
    '''The Transformers: The Movie'', ''The Transformers Season 3'', '
    '''The Transformers Season 4: The Rebirth''. '
    'JP values: ''Transformers: The Headmasters'', '
    '''Transformers: Super-God Masterforce'', '
    '''Transformers: Victory'', ''Transformers: Zone''. '
    'Toy-only: ''Transformers G1 Toy-only''.';

COMMENT ON COLUMN public.characters.continuity IS
    'Continuity grouping. Always populated. Values: '
    '''G1 North America'', ''G1 Japan'', ''G1 Toy-only''.';

-- 2. Drop character_appearances
DROP TABLE IF EXISTS public.character_appearances;

-- 1. Drop continuity_families
DROP TABLE IF EXISTS public.continuity_families;
