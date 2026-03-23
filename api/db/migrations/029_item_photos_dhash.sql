-- migrate:up

-- Add perceptual hash (dHash) column to item_photos for duplicate detection.
-- dhash: 16-character hex string representing a 64-bit difference hash.
-- New uploads compute the hash before insertion; duplicate detection compares
-- Hamming distance between hashes within the same item.

ALTER TABLE public.item_photos
    ADD COLUMN dhash TEXT NOT NULL DEFAULT '';

-- migrate:down

ALTER TABLE public.item_photos
    DROP COLUMN IF EXISTS dhash;
