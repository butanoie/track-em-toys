-- migrate:up
-- ============================================================================
-- Migration 033: Dual Condition for Collection Items
--
-- Splits the single "condition" field into two distinct properties:
--   1. package_condition — packaging state (enum, renamed from condition)
--   2. item_condition    — physical figure grade (C1–C10 integer scale)
--
-- Also removes the 'damaged' value from the packaging enum — damaged is
-- better expressed as a low item_condition grade.
--
-- PostgreSQL cannot remove enum values, so we:
--   (a) rename the old type out of the way
--   (b) migrate 'damaged' rows → 'unknown'
--   (c) create the new type without 'damaged'
--   (d) rename + retype the column
--   (e) drop the old type
--   (f) add item_condition SMALLINT column
-- ============================================================================

-- Step 1: Rename old enum type to a temp name
ALTER TYPE public.item_condition RENAME TO _item_condition_old;

-- Step 2: Migrate 'damaged' rows to 'unknown' (still using old type)
UPDATE public.collection_items
SET condition = 'unknown'
WHERE condition = 'damaged';

-- Step 3: Create new enum type without 'damaged'
CREATE TYPE public.package_condition AS ENUM (
    'mint_sealed',
    'opened_complete',
    'opened_incomplete',
    'loose_complete',
    'loose_incomplete',
    'unknown'
);

-- Step 4: Rename the column
ALTER TABLE public.collection_items
    RENAME COLUMN condition TO package_condition;

-- Step 5: Drop the old default (PG can't auto-cast defaults between enum types)
ALTER TABLE public.collection_items
    ALTER COLUMN package_condition DROP DEFAULT;

-- Step 6: Change the column type to the new enum (via text cast)
ALTER TABLE public.collection_items
    ALTER COLUMN package_condition TYPE public.package_condition
    USING package_condition::text::public.package_condition;

-- Step 7: Re-set the default on the new type
ALTER TABLE public.collection_items
    ALTER COLUMN package_condition SET DEFAULT 'unknown'::public.package_condition;

-- Step 8: Drop the old enum type (no columns reference it anymore)
DROP TYPE public._item_condition_old;

-- Step 9: Add item_condition integer column (C-grade 1=Junk to 10=Mint)
ALTER TABLE public.collection_items
    ADD COLUMN item_condition SMALLINT NOT NULL DEFAULT 5
    CONSTRAINT collection_items_item_condition_range
        CHECK (item_condition BETWEEN 1 AND 10);

-- migrate:down
-- Reverse: drop new column, recreate old enum, rename column back

ALTER TABLE public.collection_items DROP COLUMN IF EXISTS item_condition;

CREATE TYPE public.item_condition AS ENUM (
    'mint_sealed',
    'opened_complete',
    'opened_incomplete',
    'loose_complete',
    'loose_incomplete',
    'damaged',
    'unknown'
);

ALTER TABLE public.collection_items
    ALTER COLUMN package_condition DROP DEFAULT;

ALTER TABLE public.collection_items
    ALTER COLUMN package_condition TYPE public.item_condition
    USING package_condition::text::public.item_condition;

ALTER TABLE public.collection_items
    RENAME COLUMN package_condition TO condition;

ALTER TABLE public.collection_items
    ALTER COLUMN condition SET DEFAULT 'unknown'::public.item_condition;

DROP TYPE IF EXISTS public.package_condition;
