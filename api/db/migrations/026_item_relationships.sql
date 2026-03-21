-- migrate:up
-- ============================================================================
-- Migration 026: Item relationships table (schema only)
--
-- Item-to-item relationships: mold-origin (repaint/retool), gift-set-contents,
-- variant (chase/exclusive). No seed data yet — table is ready for future use.
-- ============================================================================

CREATE TABLE public.item_relationships (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    type      TEXT        NOT NULL CHECK (type IN ('mold-origin', 'gift-set-contents', 'variant')),
    subtype   TEXT,
    item1_id  UUID        NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    item1_role TEXT,
    item2_id  UUID        NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    item2_role TEXT,
    metadata  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT item_relationships_no_self CHECK (item1_id <> item2_id),
    CONSTRAINT item_relationships_unique UNIQUE (type, item1_id, item2_id)
);

CREATE INDEX idx_item_relationships_item1 ON public.item_relationships (item1_id);
CREATE INDEX idx_item_relationships_item2 ON public.item_relationships (item2_id);

COMMENT ON TABLE public.item_relationships IS
    'Item-to-item relationships: mold origins (repaint/retool), gift set contents, '
    'variants (chase/exclusive). Schema-only — no seed data yet.';

-- migrate:down
DROP TABLE IF EXISTS public.item_relationships;
