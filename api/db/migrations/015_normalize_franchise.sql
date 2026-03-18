-- migrate:up

-- ─── 1. Create franchises reference table ────────────────────────────────────
-- Follows continuity_families pattern: id, slug, name, sort_order, notes, created_at.
-- No updated_at (reference table convention).

CREATE TABLE franchises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE franchises IS 'Top-level franchise groupings (Transformers, G.I. Joe, etc.). The primary domain boundary for the catalog.';
COMMENT ON COLUMN franchises.slug IS 'URL-safe kebab-case key (e.g., transformers, gi-joe, star-wars).';
COMMENT ON COLUMN franchises.sort_order IS 'Optional display sort order. Lower values appear first.';

-- ─── 2. Seed initial franchise rows ──────────────────────────────────────────
-- These must exist before the UPDATE step populates franchise_id on other tables.

INSERT INTO franchises (slug, name, sort_order, notes) VALUES
    ('transformers', 'Transformers', 1, 'Hasbro/Takara Tomy transforming robot franchise. Originally adapted from Takara''s Diaclone and Micro Change lines (1984).'),
    ('gi-joe', 'G.I. Joe', 2, 'Hasbro military action figure franchise. A Real American Hero line (1982-1994) and subsequent reboots.'),
    ('star-wars', 'Star Wars', 3, 'Lucasfilm/Disney space opera franchise. Kenner original line (1978-1985), Hasbro modern lines.'),
    ('macross', 'Macross', 4, 'Studio Nue/Big West mecha franchise. Super Dimension Fortress Macross (1982) and sequels. Known as Robotech in the West.');

-- ─── 3. Add franchise_id UUID column to all 5 tables ────────────────────────
-- Nullable initially so we can UPDATE existing rows before enforcing NOT NULL.

ALTER TABLE characters ADD COLUMN franchise_id UUID;
ALTER TABLE factions ADD COLUMN franchise_id UUID;
ALTER TABLE sub_groups ADD COLUMN franchise_id UUID;
ALTER TABLE continuity_families ADD COLUMN franchise_id UUID;
ALTER TABLE toy_lines ADD COLUMN franchise_id UUID;

-- ─── 4. Populate franchise_id from TEXT franchise column ─────────────────────
-- Characters: franchise TEXT NOT NULL, always has a value.
-- Other 4 tables: franchise TEXT nullable. NULL defaults to Transformers (current context).

UPDATE characters c
   SET franchise_id = f.id
  FROM franchises f
 WHERE lower(c.franchise) = f.slug;

UPDATE factions fa
   SET franchise_id = COALESCE(
       (SELECT f.id FROM franchises f WHERE lower(fa.franchise) = f.slug),
       (SELECT f.id FROM franchises f WHERE f.slug = 'transformers')
   );

UPDATE sub_groups sg
   SET franchise_id = COALESCE(
       (SELECT f.id FROM franchises f WHERE lower(sg.franchise) = f.slug),
       (SELECT f.id FROM franchises f WHERE f.slug = 'transformers')
   );

UPDATE continuity_families cf
   SET franchise_id = COALESCE(
       (SELECT f.id FROM franchises f WHERE lower(cf.franchise) = f.slug),
       (SELECT f.id FROM franchises f WHERE f.slug = 'transformers')
   );

UPDATE toy_lines tl
   SET franchise_id = COALESCE(
       (SELECT f.id FROM franchises f WHERE lower(tl.franchise) = f.slug),
       (SELECT f.id FROM franchises f WHERE f.slug = 'transformers')
   );

-- ─── 5. Set franchise_id NOT NULL on ALL tables ─────────────────────────────

ALTER TABLE characters ALTER COLUMN franchise_id SET NOT NULL;
ALTER TABLE factions ALTER COLUMN franchise_id SET NOT NULL;
ALTER TABLE sub_groups ALTER COLUMN franchise_id SET NOT NULL;
ALTER TABLE continuity_families ALTER COLUMN franchise_id SET NOT NULL;
ALTER TABLE toy_lines ALTER COLUMN franchise_id SET NOT NULL;

-- ─── 6. Add FK constraints (ON DELETE RESTRICT) ─────────────────────────────

ALTER TABLE characters
    ADD CONSTRAINT characters_franchise_id_fkey
    FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE RESTRICT;

ALTER TABLE factions
    ADD CONSTRAINT factions_franchise_id_fkey
    FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE RESTRICT;

ALTER TABLE sub_groups
    ADD CONSTRAINT sub_groups_franchise_id_fkey
    FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE RESTRICT;

ALTER TABLE continuity_families
    ADD CONSTRAINT continuity_families_franchise_id_fkey
    FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE RESTRICT;

ALTER TABLE toy_lines
    ADD CONSTRAINT toy_lines_franchise_id_fkey
    FOREIGN KEY (franchise_id) REFERENCES franchises(id) ON DELETE RESTRICT;

-- ─── 7. Drop old unique indexes that used TEXT franchise ─────────────────────
-- Then create new ones using franchise_id UUID.

DROP INDEX idx_characters_name_franchise_cf;
CREATE UNIQUE INDEX idx_characters_name_franchise_cf
    ON characters (lower(name), franchise_id, continuity_family_id);

DROP INDEX idx_sub_groups_name_franchise;
CREATE UNIQUE INDEX idx_sub_groups_name_franchise
    ON sub_groups (lower(name), franchise_id);

-- ─── 8. Add FK performance indexes ──────────────────────────────────────────

CREATE INDEX idx_characters_franchise ON characters (franchise_id);
CREATE INDEX idx_factions_franchise ON factions (franchise_id);
CREATE INDEX idx_sub_groups_franchise ON sub_groups (franchise_id);
CREATE INDEX idx_continuity_families_franchise ON continuity_families (franchise_id);
CREATE INDEX idx_toy_lines_franchise ON toy_lines (franchise_id);

-- ─── 9. Drop TEXT franchise columns ──────────────────────────────────────────

ALTER TABLE characters DROP COLUMN franchise;
ALTER TABLE factions DROP COLUMN franchise;
ALTER TABLE sub_groups DROP COLUMN franchise;
ALTER TABLE continuity_families DROP COLUMN franchise;
ALTER TABLE toy_lines DROP COLUMN franchise;

-- migrate:down

-- Reverse: re-add TEXT columns, populate from FK, drop franchise_id, restore indexes.

ALTER TABLE characters ADD COLUMN franchise TEXT NOT NULL DEFAULT 'Transformers';
ALTER TABLE factions ADD COLUMN franchise TEXT;
ALTER TABLE sub_groups ADD COLUMN franchise TEXT;
ALTER TABLE continuity_families ADD COLUMN franchise TEXT;
ALTER TABLE toy_lines ADD COLUMN franchise TEXT;

UPDATE characters c SET franchise = f.name FROM franchises f WHERE f.id = c.franchise_id;
UPDATE factions fa SET franchise = f.name FROM franchises f WHERE f.id = fa.franchise_id;
UPDATE sub_groups sg SET franchise = f.name FROM franchises f WHERE f.id = sg.franchise_id;
UPDATE continuity_families cf SET franchise = f.name FROM franchises f WHERE f.id = cf.franchise_id;
UPDATE toy_lines tl SET franchise = f.name FROM franchises f WHERE f.id = tl.franchise_id;

-- Restore NULL for cross-franchise factions (Human, Neutral, Other)
UPDATE factions SET franchise = NULL WHERE slug IN ('human', 'neutral', 'other');

DROP INDEX idx_characters_franchise;
DROP INDEX idx_factions_franchise;
DROP INDEX idx_sub_groups_franchise;
DROP INDEX idx_continuity_families_franchise;
DROP INDEX idx_toy_lines_franchise;

DROP INDEX idx_characters_name_franchise_cf;
CREATE UNIQUE INDEX idx_characters_name_franchise_cf
    ON characters (lower(name), lower(franchise), continuity_family_id);

DROP INDEX idx_sub_groups_name_franchise;
CREATE UNIQUE INDEX idx_sub_groups_name_franchise
    ON sub_groups (lower(name), COALESCE(franchise, ''));

ALTER TABLE characters DROP CONSTRAINT characters_franchise_id_fkey;
ALTER TABLE factions DROP CONSTRAINT factions_franchise_id_fkey;
ALTER TABLE sub_groups DROP CONSTRAINT sub_groups_franchise_id_fkey;
ALTER TABLE continuity_families DROP CONSTRAINT continuity_families_franchise_id_fkey;
ALTER TABLE toy_lines DROP CONSTRAINT toy_lines_franchise_id_fkey;

ALTER TABLE characters DROP COLUMN franchise_id;
ALTER TABLE factions DROP COLUMN franchise_id;
ALTER TABLE sub_groups DROP COLUMN franchise_id;
ALTER TABLE continuity_families DROP COLUMN franchise_id;
ALTER TABLE toy_lines DROP COLUMN franchise_id;

DROP TABLE franchises;
