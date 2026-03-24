-- migrate:up
-- ============================================================================
-- Migration 031: Add updated_at to reference and relationship tables
--
-- Reference tables (franchises, continuity_families, factions, sub_groups) and
-- relationship tables (character_relationships, item_relationships) previously
-- had no updated_at column by convention. This migration adds the column and
-- BEFORE UPDATE triggers for bidirectional seed sync support.
--
-- Uses the shared update_updated_at() function from migration 001.
-- ============================================================================

-- ─── Reference tables ───────────────────────────────────────────────────────

ALTER TABLE public.franchises
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER franchises_updated_at
    BEFORE UPDATE ON public.franchises
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.continuity_families
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER continuity_families_updated_at
    BEFORE UPDATE ON public.continuity_families
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.factions
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER factions_updated_at
    BEFORE UPDATE ON public.factions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.sub_groups
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER sub_groups_updated_at
    BEFORE UPDATE ON public.sub_groups
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── Relationship tables ────────────────────────────────────────────────────

ALTER TABLE public.character_relationships
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER character_relationships_updated_at
    BEFORE UPDATE ON public.character_relationships
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.item_relationships
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TRIGGER item_relationships_updated_at
    BEFORE UPDATE ON public.item_relationships
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS item_relationships_updated_at ON public.item_relationships;
ALTER TABLE public.item_relationships DROP COLUMN IF EXISTS updated_at;

DROP TRIGGER IF EXISTS character_relationships_updated_at ON public.character_relationships;
ALTER TABLE public.character_relationships DROP COLUMN IF EXISTS updated_at;

DROP TRIGGER IF EXISTS sub_groups_updated_at ON public.sub_groups;
ALTER TABLE public.sub_groups DROP COLUMN IF EXISTS updated_at;

DROP TRIGGER IF EXISTS factions_updated_at ON public.factions;
ALTER TABLE public.factions DROP COLUMN IF EXISTS updated_at;

DROP TRIGGER IF EXISTS continuity_families_updated_at ON public.continuity_families;
ALTER TABLE public.continuity_families DROP COLUMN IF EXISTS updated_at;

DROP TRIGGER IF EXISTS franchises_updated_at ON public.franchises;
ALTER TABLE public.franchises DROP COLUMN IF EXISTS updated_at;
