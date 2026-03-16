-- migrate:up
-- ============================================================================
-- Migration 012: Enrich catalog schema
--
-- 1. Characters: adds series + continuity columns, expands unique index
-- 2. Characters: updates schema comments for character_type, combiner_role
-- 3. Catalog FKs: tightens NOT NULL + ON DELETE RESTRICT where required
-- 4. Users: adds deleted_at for GDPR tombstone pattern (PII scrubbed,
--    row preserved so FKs remain intact — no cascading updates on deletion)
-- 5. Drops unused categories table (to be replaced by a tags system if needed)
-- 6. item_photos: enforce at most one primary photo per item
-- 7. sub_groups: relax name unique to (name, franchise) composite
-- 8. characters → sub_groups: replace single FK with many-to-many junction table
--
-- series and continuity are always populated — no implicit defaults.
-- ============================================================================

-- -------------------------------------------------------
-- 1. Characters: series + continuity columns
-- -------------------------------------------------------

ALTER TABLE public.characters
    ADD COLUMN series TEXT NOT NULL,
    ADD COLUMN continuity TEXT NOT NULL;

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

-- -------------------------------------------------------
-- 2. Characters: update schema comments
-- -------------------------------------------------------

COMMENT ON COLUMN public.characters.character_type IS
    'Species or gimmick-type classification. Not an enum to allow future expansion. '
    'Species types: Transformer, Human, Nebulan, Quintesson, Sharkticon, Junkion, Alien. '
    'Gimmick types: Pretender, Godmaster, Powermaster, Targetmaster, Headmaster, '
    'Headmaster Junior, Brainmaster, Powered Master, Classic Pretender, Micromaster, Drone. '
    'Other: Energy being, Other Robotic, Other Alien.';

COMMENT ON COLUMN public.characters.combiner_role IS
    'Role in combination. Standard: torso, right arm, left arm, right leg, left leg. '
    'Extended (JP combiners): upper torso, lower torso, upper body, lower body, '
    'torso (right half), torso (left half), main body, wings/booster, weapon, '
    'back-mounted weapon. NULL if not a combiner component.';

COMMENT ON COLUMN public.characters.metadata IS
    'Extensible JSONB for japanese_name, first_appearance, first_appearance_season, '
    'aliases, series_year, notes, etc.';

-- Replace name+franchise unique index with name+franchise+continuity
-- Allows same character name across continuities (e.g., G1 Megatron vs Beast Wars Megatron)
DROP INDEX IF EXISTS idx_characters_name_franchise;
CREATE UNIQUE INDEX idx_characters_name_franchise_continuity
    ON public.characters (lower(name), lower(franchise), continuity);

CREATE INDEX idx_characters_series ON public.characters (series);
CREATE INDEX idx_characters_continuity ON public.characters (continuity);

-- -------------------------------------------------------
-- 3. Catalog FKs: tighten NOT NULL + ON DELETE RESTRICT
-- -------------------------------------------------------

-- toy_lines: manufacturer is required
ALTER TABLE public.toy_lines
    ALTER COLUMN manufacturer_id SET NOT NULL,
    DROP CONSTRAINT IF EXISTS toy_lines_manufacturer_id_fkey,
    ADD CONSTRAINT toy_lines_manufacturer_id_fkey
        FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON DELETE RESTRICT;

-- items: character and toy_line are required, manufacturer is optional
ALTER TABLE public.items
    ALTER COLUMN character_id SET NOT NULL,
    ALTER COLUMN toy_line_id SET NOT NULL,
    DROP CONSTRAINT IF EXISTS items_character_id_fkey,
    ADD CONSTRAINT items_character_id_fkey
        FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE RESTRICT,
    DROP CONSTRAINT IF EXISTS items_toy_line_id_fkey,
    ADD CONSTRAINT items_toy_line_id_fkey
        FOREIGN KEY (toy_line_id) REFERENCES public.toy_lines(id) ON DELETE RESTRICT;

-- catalog_edits: item deletion preserves edit history
ALTER TABLE public.catalog_edits
    DROP CONSTRAINT IF EXISTS catalog_edits_item_id_fkey,
    ADD CONSTRAINT catalog_edits_item_id_fkey
        FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;

-- -------------------------------------------------------
-- 4. Users: GDPR tombstone support
-- -------------------------------------------------------

-- User "deletion" = scrub PII + set deleted_at. Row preserved as tombstone
-- so all FKs remain intact. App checks deleted_at to render "Deleted user".
ALTER TABLE public.users
    ADD COLUMN deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.deleted_at IS
    'GDPR tombstone. When set, PII columns (email, display_name, avatar_url) have been scrubbed. '
    'The row is preserved so foreign keys from items, catalog_edits, item_photos remain intact. '
    'App displays "Deleted user" when deleted_at IS NOT NULL.';

-- -------------------------------------------------------
-- 5. Drop unused categories table
-- -------------------------------------------------------

-- categories was speculative schema from migration 011 with no seed data,
-- no FK references, and no application usage. Its intended use cases
-- (continuity, series, toy lines) are now served by dedicated columns/tables.
-- User-defined tagging will use a future tags system instead.
DROP TABLE IF EXISTS public.categories;

-- -------------------------------------------------------
-- 6. Enforce at most one primary photo per item
-- -------------------------------------------------------

CREATE UNIQUE INDEX idx_item_photos_one_primary
    ON public.item_photos (item_id) WHERE is_primary = TRUE;

-- -------------------------------------------------------
-- 7. sub_groups: relax name unique to (name, franchise)
-- -------------------------------------------------------

-- Allows same sub-group name in different franchises (e.g., if G.I. Joe
-- ever has a group with the same name as a Transformers group).
-- slug remains globally unique (used for URL routing).
ALTER TABLE public.sub_groups
    DROP CONSTRAINT IF EXISTS sub_groups_name_key;

CREATE UNIQUE INDEX idx_sub_groups_name_franchise
    ON public.sub_groups (lower(name), COALESCE(franchise, ''));

-- -------------------------------------------------------
-- 8. characters → sub_groups: many-to-many junction table
-- -------------------------------------------------------

-- Characters can belong to multiple sub-groups (e.g., Apeface is both
-- a Headmaster and a Horrorcon; Springer is a Triple Changer and a Wrecker).
-- Drop the single FK in favor of a junction table.
DROP INDEX IF EXISTS idx_characters_sub_group;
ALTER TABLE public.characters DROP COLUMN IF EXISTS sub_group_id;

CREATE TABLE public.character_sub_groups (
    character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
    sub_group_id UUID NOT NULL REFERENCES public.sub_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (character_id, sub_group_id)
);

CREATE INDEX idx_character_sub_groups_sub_group
    ON public.character_sub_groups (sub_group_id);

COMMENT ON TABLE public.character_sub_groups IS
    'Many-to-many junction: characters can belong to multiple sub-groups. '
    'E.g., Apeface → Headmasters + Horrorcons; Springer → Triple Changers.';

-- migrate:down

-- Restore single sub_group_id FK on characters
DROP TABLE IF EXISTS public.character_sub_groups;
ALTER TABLE public.characters
    ADD COLUMN sub_group_id UUID REFERENCES public.sub_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_characters_sub_group ON public.characters (sub_group_id);

-- Restore sub_groups name unique constraint
DROP INDEX IF EXISTS idx_sub_groups_name_franchise;
ALTER TABLE public.sub_groups
    ADD CONSTRAINT sub_groups_name_key UNIQUE (name);

DROP INDEX IF EXISTS idx_item_photos_one_primary;

-- Recreate categories table (dropped in step 5)
CREATE TABLE public.categories (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT            NOT NULL,
    slug        TEXT            NOT NULL UNIQUE,
    parent_id   UUID            REFERENCES public.categories(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

ALTER TABLE public.users
    DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE public.catalog_edits
    DROP CONSTRAINT IF EXISTS catalog_edits_item_id_fkey,
    ADD CONSTRAINT catalog_edits_item_id_fkey
        FOREIGN KEY (item_id) REFERENCES public.items(id);

ALTER TABLE public.items
    DROP CONSTRAINT IF EXISTS items_toy_line_id_fkey,
    ADD CONSTRAINT items_toy_line_id_fkey
        FOREIGN KEY (toy_line_id) REFERENCES public.toy_lines(id),
    DROP CONSTRAINT IF EXISTS items_character_id_fkey,
    ADD CONSTRAINT items_character_id_fkey
        FOREIGN KEY (character_id) REFERENCES public.characters(id),
    ALTER COLUMN toy_line_id DROP NOT NULL,
    ALTER COLUMN character_id DROP NOT NULL;

ALTER TABLE public.toy_lines
    DROP CONSTRAINT IF EXISTS toy_lines_manufacturer_id_fkey,
    ADD CONSTRAINT toy_lines_manufacturer_id_fkey
        FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id),
    ALTER COLUMN manufacturer_id DROP NOT NULL;

DROP INDEX IF EXISTS idx_characters_continuity;
DROP INDEX IF EXISTS idx_characters_series;
DROP INDEX IF EXISTS idx_characters_name_franchise_continuity;
CREATE UNIQUE INDEX idx_characters_name_franchise ON public.characters (lower(name), lower(franchise));

ALTER TABLE public.characters
    DROP COLUMN IF EXISTS continuity,
    DROP COLUMN IF EXISTS series;

-- Restore original comments
COMMENT ON COLUMN public.characters.character_type IS
    'Species/type classification. Not an enum to allow future expansion.';

COMMENT ON COLUMN public.characters.combiner_role IS
    'Role in combination: torso, right-arm, left-arm, right-leg, left-leg, head, component. NULL if not a combiner component.';

COMMENT ON COLUMN public.characters.metadata IS
    'Extensible JSONB for japanese_name, first_appearance, aliases, notes, etc.';
