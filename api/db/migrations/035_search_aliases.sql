-- migrate:up
-- ============================================================================
-- Migration 035: Add search_aliases to characters and items
--
-- Adds a search_aliases TEXT column to both tables, then rebuilds the
-- search_vector generated columns to include COALESCE(search_aliases, '').
--
-- PostgreSQL does not support ALTER on GENERATED columns, so each
-- search_vector must be dropped and re-created. GIN indexes are dropped
-- first and re-created after.
--
-- search_aliases holds space-separated alternate search terms:
-- acronym expansions (H.I.S.S. → "hiss"), nicknames, alternate names.
-- NULL for entities that don't need aliases (no overhead in tsvector).
-- ============================================================================

-- ─── 1. Add search_aliases columns ──────────────────────────────────────────

ALTER TABLE public.characters
    ADD COLUMN search_aliases text;

ALTER TABLE public.items
    ADD COLUMN search_aliases text;

-- ─── 2. Rebuild characters search_vector ────────────────────────────────────

DROP INDEX IF EXISTS idx_characters_search;
ALTER TABLE public.characters DROP COLUMN search_vector;

ALTER TABLE public.characters
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple',
            name || ' ' ||
            COALESCE(alt_mode, '') || ' ' ||
            COALESCE(character_type, '') || ' ' ||
            COALESCE(search_aliases, '')
        )
    ) STORED;

CREATE INDEX idx_characters_search
    ON public.characters USING GIN (search_vector);

-- ─── 3. Rebuild items search_vector ─────────────────────────────────────────

DROP INDEX IF EXISTS idx_items_search;
ALTER TABLE public.items DROP COLUMN search_vector;

ALTER TABLE public.items
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple',
            name || ' ' ||
            COALESCE(description, '') || ' ' ||
            COALESCE(product_code, '') || ' ' ||
            COALESCE(sku, '') || ' ' ||
            COALESCE(search_aliases, '')
        )
    ) STORED;

CREATE INDEX idx_items_search
    ON public.items USING GIN (search_vector);

-- migrate:down

-- Reverse: drop rebuilt search_vectors, drop search_aliases, restore originals

DROP INDEX IF EXISTS idx_characters_search;
ALTER TABLE public.characters DROP COLUMN IF EXISTS search_vector;
ALTER TABLE public.characters DROP COLUMN IF EXISTS search_aliases;

ALTER TABLE public.characters
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple',
            name || ' ' ||
            COALESCE(alt_mode, '') || ' ' ||
            COALESCE(character_type, '')
        )
    ) STORED;

CREATE INDEX idx_characters_search
    ON public.characters USING GIN (search_vector);

DROP INDEX IF EXISTS idx_items_search;
ALTER TABLE public.items DROP COLUMN IF EXISTS search_vector;
ALTER TABLE public.items DROP COLUMN IF EXISTS search_aliases;

ALTER TABLE public.items
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple',
            name || ' ' ||
            COALESCE(description, '') || ' ' ||
            COALESCE(product_code, '') || ' ' ||
            COALESCE(sku, '')
        )
    ) STORED;

CREATE INDEX idx_items_search
    ON public.items USING GIN (search_vector);
