-- migrate:up

-- Add status, sort_order, and updated_at columns to item_photos.
-- status: controls photo visibility (pending/approved/rejected). Curator uploads default to 'approved'.
-- sort_order: user-defined display order within an item's photos.
-- updated_at: tracks last modification (set-primary, reorder, future caption edits).

ALTER TABLE public.item_photos
    ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill sort_order with position based on creation order per item
UPDATE item_photos ip
SET sort_order = sub.rn
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY created_at ASC) AS rn
    FROM item_photos
) sub
WHERE ip.id = sub.id;

-- Index for ordered fetches by item
CREATE INDEX idx_item_photos_item_sort ON public.item_photos (item_id, sort_order);

-- Attach updated_at trigger (function created in migration 001)
CREATE TRIGGER item_photos_updated_at
    BEFORE UPDATE ON public.item_photos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- migrate:down

DROP TRIGGER IF EXISTS item_photos_updated_at ON public.item_photos;
DROP INDEX IF EXISTS idx_item_photos_item_sort;
ALTER TABLE public.item_photos
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS sort_order,
    DROP COLUMN IF EXISTS status;
