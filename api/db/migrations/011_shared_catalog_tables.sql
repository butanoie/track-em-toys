-- migrate:up
-- ============================================================================
-- Migration 011: Shared catalog tables with slug keys
--
-- Creates the core shared catalog tables: factions, sub_groups, characters,
-- manufacturers, categories, toy_lines, items, item_photos, and catalog_edits.
--
-- Design decisions:
--   - UUID primary keys on all tables (consistent with auth tables)
--   - slug columns are UNIQUE NOT NULL, used as stable URL-safe identifiers
--   - factions and sub_groups are normalized reference tables (not enums)
--     so new factions/groups can be added without schema migration
--   - characters table is enriched with faction, character_type, sub_group,
--     alt_mode, combiner metadata, and a JSONB metadata column for future
--     extensibility (e.g., Japanese names, first appearance data)
--   - combiner relationships use self-referential FK: component characters
--     point to their combined form via combined_form_id
--   - slug generation convention: lowercase, hyphens for spaces, no special
--     chars, no apostrophes (e.g., "optimus-prime", "dr-arkeville")
-- ============================================================================

-- -------------------------------------------------------
-- 1. Reference tables: factions and sub_groups
-- -------------------------------------------------------

CREATE TABLE public.factions (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT            NOT NULL UNIQUE,
    slug        TEXT            NOT NULL UNIQUE,
    franchise   TEXT,           -- e.g., 'Transformers', 'G.I. Joe', NULL for cross-franchise
    notes       TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.factions IS 'Canonical factions/allegiances (Autobot, Decepticon, etc.). Normalized to avoid enum migration overhead.';
COMMENT ON COLUMN public.factions.slug IS 'URL-safe kebab-case key (e.g., autobot, decepticon, quintesson)';

CREATE TABLE public.sub_groups (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT            NOT NULL UNIQUE,
    slug        TEXT            NOT NULL UNIQUE,
    faction_id  UUID            REFERENCES public.factions(id) ON DELETE SET NULL,  -- nullable: some sub-groups are faction-neutral
    franchise   TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sub_groups IS 'Named sub-teams within factions (Dinobots, Constructicons, Aerialbots, etc.)';
COMMENT ON COLUMN public.sub_groups.faction_id IS 'Optional FK to factions. NULL for cross-faction or franchise-neutral groups.';

-- -------------------------------------------------------
-- 2. Characters table (enriched)
-- -------------------------------------------------------

CREATE TABLE public.characters (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT            NOT NULL,
    slug                TEXT            NOT NULL UNIQUE,
    franchise           TEXT            NOT NULL DEFAULT 'Transformers',

    -- Faction & classification
    faction_id          UUID            REFERENCES public.factions(id) ON DELETE SET NULL,
    character_type      TEXT,           -- 'Transformer', 'Human', 'Quintesson', 'Nebulan', 'Junkion', 'Other Robotic', 'Other Organic', 'Other Alien'
    sub_group_id        UUID            REFERENCES public.sub_groups(id) ON DELETE SET NULL,

    -- Transformer-specific
    alt_mode            TEXT,           -- e.g., 'semi-truck', 'F-15 jet', 'Walther P38 pistol'

    -- Combiner relationships (self-referential)
    is_combined_form    BOOLEAN         NOT NULL DEFAULT FALSE,
    combined_form_id    UUID            REFERENCES public.characters(id) ON DELETE SET NULL,  -- if this character is a component, points to the gestalt
    combiner_role       TEXT,           -- 'torso', 'right arm', 'left arm', 'right leg', 'left leg', 'head', 'component'

    -- Extensible metadata
    metadata            JSONB           NOT NULL DEFAULT '{}'::jsonb,
    -- Expected metadata keys:
    --   japanese_name      TEXT     Japanese name if different
    --   first_appearance   TEXT     e.g., "S1E01 More Than Meets the Eye Part 1"
    --   first_appearance_season  INT  1,2,3,4 or 0 for 1986 movie
    --   aliases            TEXT[]   Alternative names
    --   notes              TEXT     Freeform notes

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.characters IS 'Franchise characters (Optimus Prime, Snake Eyes, Spike Witwicky, etc.). Includes Transformers, humans, and other species.';
COMMENT ON COLUMN public.characters.slug IS 'URL-safe kebab-case key (e.g., optimus-prime, spike-witwicky, devastator). Unique across all franchises.';
COMMENT ON COLUMN public.characters.character_type IS 'Species/type classification. Not an enum to allow future expansion.';
COMMENT ON COLUMN public.characters.combined_form_id IS 'Self-referential FK: if this character is a combiner component, references the combined form character entry.';
COMMENT ON COLUMN public.characters.combiner_role IS 'Role in combination: torso, right-arm, left-arm, right-leg, left-leg, head, component. NULL if not a combiner component.';
COMMENT ON COLUMN public.characters.metadata IS 'Extensible JSONB for japanese_name, first_appearance, aliases, notes, etc.';

-- Partial unique index: within a franchise, name+franchise should be unique
-- (allows same character name across different franchises if needed)
CREATE UNIQUE INDEX idx_characters_name_franchise ON public.characters (lower(name), lower(franchise));

CREATE INDEX idx_characters_faction ON public.characters (faction_id);
CREATE INDEX idx_characters_sub_group ON public.characters (sub_group_id);
CREATE INDEX idx_characters_combined_form ON public.characters (combined_form_id) WHERE combined_form_id IS NOT NULL;
CREATE INDEX idx_characters_type ON public.characters (character_type);

CREATE TRIGGER characters_updated_at
    BEFORE UPDATE ON public.characters
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -------------------------------------------------------
-- 3. Manufacturers table (with slug)
-- -------------------------------------------------------

CREATE TABLE public.manufacturers (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT            NOT NULL UNIQUE,
    slug                TEXT            NOT NULL UNIQUE,
    is_official_licensee BOOLEAN        NOT NULL DEFAULT FALSE,
    country             TEXT,
    website_url         VARCHAR(500),
    aliases             TEXT[]          DEFAULT '{}',
    notes               TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.manufacturers.slug IS 'URL-safe kebab-case key (e.g., fanstoys, hasbro, takara-tomy)';

CREATE TRIGGER manufacturers_updated_at
    BEFORE UPDATE ON public.manufacturers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -------------------------------------------------------
-- 4. Categories table (hierarchical)
-- -------------------------------------------------------

CREATE TABLE public.categories (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT            NOT NULL,
    slug        TEXT            NOT NULL UNIQUE,
    parent_id   UUID            REFERENCES public.categories(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- 5. Toy lines table (with slug)
-- -------------------------------------------------------

CREATE TABLE public.toy_lines (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT            NOT NULL,
    slug            TEXT            NOT NULL UNIQUE,
    franchise       TEXT,
    manufacturer_id UUID            REFERENCES public.manufacturers(id),
    scale           VARCHAR(50),
    description     TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_toy_lines_manufacturer ON public.toy_lines (manufacturer_id);

CREATE TRIGGER toy_lines_updated_at
    BEFORE UPDATE ON public.toy_lines
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -------------------------------------------------------
-- 6. Items table (master catalog, with slug)
-- -------------------------------------------------------

CREATE TABLE public.items (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT            NOT NULL,
    slug            TEXT            NOT NULL UNIQUE,
    manufacturer_id UUID            REFERENCES public.manufacturers(id),
    character_id    UUID            REFERENCES public.characters(id),
    toy_line_id     UUID            REFERENCES public.toy_lines(id),
    year_released   INTEGER,
    description     TEXT,
    barcode         TEXT,
    sku             TEXT,
    product_code    TEXT,           -- e.g., 'MP-44', 'FT-44'
    is_third_party  BOOLEAN         NOT NULL DEFAULT FALSE,
    created_by      UUID            REFERENCES public.users(id),
    data_quality    TEXT            NOT NULL DEFAULT 'needs_review'
                                   CHECK (data_quality IN ('needs_review', 'verified', 'community_verified')),
    metadata        JSONB           NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.items.slug IS 'URL-safe kebab-case key (e.g., ft-44-thomas, mp-44-optimus-prime). Unique across all items.';
COMMENT ON COLUMN public.items.product_code IS 'Manufacturer product designation (e.g., MP-44, FT-44, CS-01)';
COMMENT ON COLUMN public.items.metadata IS 'Extensible JSONB: scale, variant_type, base_product_code, sub_brand, status, etc.';

CREATE INDEX idx_items_manufacturer ON public.items (manufacturer_id);
CREATE INDEX idx_items_character ON public.items (character_id);
CREATE INDEX idx_items_toy_line ON public.items (toy_line_id);
CREATE INDEX idx_items_product_code ON public.items (product_code) WHERE product_code IS NOT NULL;
CREATE INDEX idx_items_data_quality ON public.items (data_quality);

CREATE TRIGGER items_updated_at
    BEFORE UPDATE ON public.items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- -------------------------------------------------------
-- 7. Item photos
-- -------------------------------------------------------

CREATE TABLE public.item_photos (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID            NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
    url         TEXT            NOT NULL,
    caption     TEXT,
    uploaded_by UUID            REFERENCES public.users(id),
    is_primary  BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_photos_item ON public.item_photos (item_id);

-- -------------------------------------------------------
-- 8. Catalog edits (approval queue)
-- -------------------------------------------------------

CREATE TABLE public.catalog_edits (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID            REFERENCES public.items(id),
    editor_id   UUID            NOT NULL REFERENCES public.users(id),
    edit_type   TEXT            NOT NULL CHECK (edit_type IN ('create', 'update', 'merge', 'delete')),
    data_before JSONB,
    data_after  JSONB           NOT NULL,
    status      TEXT            NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_approved')),
    reviewed_by UUID            REFERENCES public.users(id),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_edits_item ON public.catalog_edits (item_id);
CREATE INDEX idx_catalog_edits_status ON public.catalog_edits (status) WHERE status = 'pending';

-- migrate:down
DROP TABLE IF EXISTS public.catalog_edits;
DROP TABLE IF EXISTS public.item_photos;
DROP TABLE IF EXISTS public.items;
DROP TABLE IF EXISTS public.toy_lines;
DROP TABLE IF EXISTS public.categories;
DROP TABLE IF EXISTS public.manufacturers;
DROP TABLE IF EXISTS public.characters;
DROP TABLE IF EXISTS public.sub_groups;
DROP TABLE IF EXISTS public.factions;
