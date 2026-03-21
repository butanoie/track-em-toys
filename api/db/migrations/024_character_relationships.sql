-- migrate:up
-- ============================================================================
-- Migration 024: Character relationships table
--
-- First-class entity for character-to-character relationships, replacing the
-- legacy self-referential combined_form_id and combiner_role columns.
--
-- Relationship types: combiner-component, partner-bond, vehicle-crew, rival,
-- sibling, mentor-student, evolution. See RELATIONSHIP_TYPE_REGISTRY in
-- seed-validation.test.ts for the canonical type/role/subtype allowlists.
--
-- Seed data lives in relationships/*.json (auto-discovered by ingest.ts).
-- ============================================================================

CREATE TABLE public.character_relationships (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type         TEXT        NOT NULL,
    subtype      TEXT,
    entity1_id   UUID        NOT NULL REFERENCES public.characters(id) ON DELETE RESTRICT,
    entity1_role TEXT,
    entity2_id   UUID        NOT NULL REFERENCES public.characters(id) ON DELETE RESTRICT,
    entity2_role TEXT,
    metadata     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT character_relationships_no_self CHECK (entity1_id <> entity2_id),
    CONSTRAINT character_relationships_unique UNIQUE (type, entity1_id, entity2_id)
);

CREATE INDEX idx_character_relationships_entity1 ON public.character_relationships (entity1_id);
CREATE INDEX idx_character_relationships_entity2 ON public.character_relationships (entity2_id);
CREATE INDEX idx_character_relationships_type ON public.character_relationships (type);

COMMENT ON TABLE public.character_relationships IS
    'Character-to-character relationships: combiners, partner bonds, vehicle-crew, rivals, '
    'siblings, mentor-student, evolution. Replaces the legacy combined_form_id self-FK.';

-- migrate:down
DROP TABLE IF EXISTS public.character_relationships;
