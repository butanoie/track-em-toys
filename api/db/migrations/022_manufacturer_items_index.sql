-- migrate:up
-- Composite index for manufacturer-scoped cursor pagination.
-- Supports queries with WHERE manufacturer_id = ? ORDER BY name, id.
CREATE INDEX idx_items_manufacturer_name_id ON public.items (manufacturer_id, name, id);

-- migrate:down
DROP INDEX IF EXISTS public.idx_items_manufacturer_name_id;
