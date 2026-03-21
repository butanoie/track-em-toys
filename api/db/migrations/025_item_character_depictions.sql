-- migrate:up
-- ============================================================================
-- Migration 025: Item character depictions junction table
--
-- Replaces the single items.character_id + items.character_appearance_id FKs
-- with a many-to-many junction through character_appearances. Each row links
-- an item to a character appearance; the character is derived via
-- character_appearances.character_id.
--
-- Backfills from existing items.character_appearance_id data. All current
-- items have character_appearance_id populated (verified by seed validation).
-- ============================================================================

CREATE TABLE public.item_character_depictions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id       UUID        NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    appearance_id UUID        NOT NULL REFERENCES public.character_appearances(id) ON DELETE RESTRICT,
    is_primary    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT item_character_depictions_unique UNIQUE (item_id, appearance_id)
);

-- At most one primary depiction per item (matches idx_item_photos_one_primary pattern)
CREATE UNIQUE INDEX idx_item_character_depictions_one_primary
    ON public.item_character_depictions (item_id) WHERE is_primary = TRUE;

CREATE INDEX idx_item_character_depictions_item ON public.item_character_depictions (item_id);
CREATE INDEX idx_item_character_depictions_appearance ON public.item_character_depictions (appearance_id);

COMMENT ON TABLE public.item_character_depictions IS
    'Junction: which character appearances an item depicts. Supports multi-character '
    'items (gift sets, 2-packs). Character is derived via appearance → character FK.';

-- Backfill from existing items.character_appearance_id
-- All current items have character_appearance_id populated.
INSERT INTO public.item_character_depictions (item_id, appearance_id, is_primary)
SELECT id, character_appearance_id, TRUE
  FROM public.items
 WHERE character_appearance_id IS NOT NULL
ON CONFLICT (item_id, appearance_id) DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS public.item_character_depictions;
