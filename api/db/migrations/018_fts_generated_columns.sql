-- migrate:up
-- ============================================================================
-- Migration 018: Full-text search generated columns + GIN indexes
--
-- Adds GENERATED ALWAYS AS ... STORED tsvector columns to characters and items.
-- GIN indexes are built on the generated columns, eliminating the need for
-- queries to reproduce the exact tsvector expression (expression-matching
-- fragility is the most common FTS index bug).
--
-- Uses 'simple' text config (no stemming, no stop-word removal) because the
-- data is dominated by proper nouns: Optimus Prime, FT-44, Megatron.
-- English stemming would mangle these.
--
-- Characters: search on name + alt_mode + character_type
-- Items: search on name + description + product_code + sku
-- ============================================================================

-- ─── 1. Characters search_vector ─────────────────────────────────────────────

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

-- ─── 2. Items search_vector ──────────────────────────────────────────────────

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

-- migrate:down

DROP INDEX IF EXISTS idx_items_search;
ALTER TABLE public.items DROP COLUMN IF EXISTS search_vector;

DROP INDEX IF EXISTS idx_characters_search;
ALTER TABLE public.characters DROP COLUMN IF EXISTS search_vector;
