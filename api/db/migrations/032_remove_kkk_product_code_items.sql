-- migrate:up
-- ============================================================================
-- Migration 032: Remove Flame Toys items with KKK- product code prefix
--
-- Deletes all items whose product_code starts with 'KKK-' and cleans up
-- dependent rows in tables with ON DELETE RESTRICT constraints.
-- Tables with CASCADE/SET NULL (item_photos, catalog_edits) are auto-handled.
-- ============================================================================

-- Use a CTE to identify target items once
WITH target_items AS (
    SELECT id FROM public.items WHERE product_code LIKE 'KKK-%'
)
-- 1. Delete item_character_depictions (ON DELETE RESTRICT)
DELETE FROM public.item_character_depictions
WHERE item_id IN (SELECT id FROM target_items);

WITH target_items AS (
    SELECT id FROM public.items WHERE product_code LIKE 'KKK-%'
)
-- 2. Delete item_relationships (ON DELETE RESTRICT on both FKs)
DELETE FROM public.item_relationships
WHERE item1_id IN (SELECT id FROM target_items)
   OR item2_id IN (SELECT id FROM target_items);

WITH target_items AS (
    SELECT id FROM public.items WHERE product_code LIKE 'KKK-%'
)
-- 3. Delete collection_items (ON DELETE RESTRICT)
DELETE FROM public.collection_items
WHERE item_id IN (SELECT id FROM target_items);

-- 4. Delete the items themselves (item_photos CASCADE, catalog_edits SET NULL)
DELETE FROM public.items WHERE product_code LIKE 'KKK-%';

-- migrate:down
-- Data deletion is irreversible — re-seed to restore removed items.
-- No-op: the items must be re-ingested from seed data.
