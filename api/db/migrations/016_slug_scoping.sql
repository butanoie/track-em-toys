-- migrate:up
-- ============================================================================
-- Migration 016: Franchise-scoped slug uniqueness
--
-- Relaxes global slug uniqueness to per-franchise uniqueness on all
-- franchise-scoped tables. This allows the same slug (e.g., "megatron")
-- to exist in different franchises.
--
-- Also relaxes factions.name from global to per-franchise uniqueness.
--
-- Adds composite B-tree indexes for cursor pagination on characters and items.
--
-- NOTE: migrate:down will fail if duplicate slugs within a franchise have
-- been written after this migration runs. This is expected — the down
-- migration documents the constraint but cannot guarantee reversal after
-- forward data diverges.
-- ============================================================================

-- ─── 1. Characters: slug scoping ─────────────────────────────────────────────

ALTER TABLE public.characters
    DROP CONSTRAINT IF EXISTS characters_slug_key;

CREATE UNIQUE INDEX idx_characters_slug_franchise
    ON public.characters (slug, franchise_id);

-- ─── 2. Factions: slug + name scoping ────────────────────────────────────────

ALTER TABLE public.factions
    DROP CONSTRAINT IF EXISTS factions_slug_key;

CREATE UNIQUE INDEX idx_factions_slug_franchise
    ON public.factions (slug, franchise_id);

-- Also relax factions.name from global to per-franchise.
-- Without this, two franchises cannot have a faction with the same name.
ALTER TABLE public.factions
    DROP CONSTRAINT IF EXISTS factions_name_key;

CREATE UNIQUE INDEX idx_factions_name_franchise
    ON public.factions (lower(name), franchise_id);

-- ─── 3. Sub-groups: slug scoping ─────────────────────────────────────────────

ALTER TABLE public.sub_groups
    DROP CONSTRAINT IF EXISTS sub_groups_slug_key;

CREATE UNIQUE INDEX idx_sub_groups_slug_franchise
    ON public.sub_groups (slug, franchise_id);

-- ─── 4. Continuity families: slug scoping ────────────────────────────────────

ALTER TABLE public.continuity_families
    DROP CONSTRAINT IF EXISTS continuity_families_slug_key;

CREATE UNIQUE INDEX idx_continuity_families_slug_franchise
    ON public.continuity_families (slug, franchise_id);

-- ─── 5. Toy lines: slug scoping ──────────────────────────────────────────────

ALTER TABLE public.toy_lines
    DROP CONSTRAINT IF EXISTS toy_lines_slug_key;

CREATE UNIQUE INDEX idx_toy_lines_slug_franchise
    ON public.toy_lines (slug, franchise_id);

-- ─── 6. Items: slug scoping ──────────────────────────────────────────────────

ALTER TABLE public.items
    DROP CONSTRAINT IF EXISTS items_slug_key;

CREATE UNIQUE INDEX idx_items_slug_franchise
    ON public.items (slug, franchise_id);

-- ─── 7. Character appearances: slug scoped to character ──────────────────────

ALTER TABLE public.character_appearances
    DROP CONSTRAINT IF EXISTS character_appearances_slug_key;

CREATE UNIQUE INDEX idx_character_appearances_slug_character
    ON public.character_appearances (slug, character_id);

-- ─── 8. Composite B-tree indexes for cursor pagination ───────────────────────
-- Keyset pagination uses ORDER BY name ASC, id ASC with a WHERE clause
-- (name, id) > ($cursor_name, $cursor_id::uuid). These indexes support
-- both the ordered scan and the franchise-filtered variant.

CREATE INDEX idx_characters_name_id
    ON public.characters (name, id);

CREATE INDEX idx_characters_franchise_name_id
    ON public.characters (franchise_id, name, id);

CREATE INDEX idx_items_name_id
    ON public.items (name, id);

CREATE INDEX idx_items_franchise_name_id
    ON public.items (franchise_id, name, id);

-- migrate:down

-- ─── Reverse: restore global slug uniqueness ─────────────────────────────────
-- WARNING: This will fail if duplicate slugs exist across franchises.

DROP INDEX IF EXISTS idx_items_franchise_name_id;
DROP INDEX IF EXISTS idx_items_name_id;
DROP INDEX IF EXISTS idx_characters_franchise_name_id;
DROP INDEX IF EXISTS idx_characters_name_id;

DROP INDEX IF EXISTS idx_character_appearances_slug_character;
ALTER TABLE public.character_appearances
    ADD CONSTRAINT character_appearances_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS idx_items_slug_franchise;
ALTER TABLE public.items
    ADD CONSTRAINT items_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS idx_toy_lines_slug_franchise;
ALTER TABLE public.toy_lines
    ADD CONSTRAINT toy_lines_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS idx_continuity_families_slug_franchise;
ALTER TABLE public.continuity_families
    ADD CONSTRAINT continuity_families_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS idx_sub_groups_slug_franchise;
ALTER TABLE public.sub_groups
    ADD CONSTRAINT sub_groups_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS idx_factions_name_franchise;
ALTER TABLE public.factions
    ADD CONSTRAINT factions_name_key UNIQUE (name);

DROP INDEX IF EXISTS idx_factions_slug_franchise;
ALTER TABLE public.factions
    ADD CONSTRAINT factions_slug_key UNIQUE (slug);

DROP INDEX IF EXISTS idx_characters_slug_franchise;
ALTER TABLE public.characters
    ADD CONSTRAINT characters_slug_key UNIQUE (slug);
