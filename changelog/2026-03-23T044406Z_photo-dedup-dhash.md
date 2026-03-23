# Photo Upload Deduplication via dHash

**Date:** 2026-03-23
**Time:** 04:44:06 UTC
**Type:** Feature
**Phase:** 1.9 (Photo Management)

## Summary

Added perceptual image deduplication to the catalog photo upload pipeline using the dHash (difference hash) algorithm. When a curator uploads a photo, the system computes a 64-bit hash, compares it against existing photos for the same item via Hamming distance, and rejects duplicates with a 409 response. This prevents redundant images in the catalog without requiring exact byte-for-byte matching.

---

## Changes Implemented

### 1. Database Schema

Added `dhash TEXT NOT NULL DEFAULT ''` column to `item_photos` via migration 029. The column stores a 16-character hex string representing the 64-bit perceptual hash. Existing rows receive an empty string default (no backfill needed — existing photos are being purged). The column is excluded from `PHOTO_COLUMNS` and never returned to clients.

**Created:**

- `api/db/migrations/029_item_photos_dhash.sql` — column addition with migrate:down

### 2. dHash Computation Module

Ported `computeDHash` and `hammingDistance` from the ML pipeline's `track-em-toys-data/lib/image-dedup.ts` into the API codebase. Pure functions with no external dependencies beyond Sharp.

**Created:**

- `api/src/catalog/photos/dhash.ts` — `computeDHash(buffer)` → 16-char hex, `hammingDistance(a, b)` → 0–64
- `api/src/catalog/photos/dhash.test.ts` — 8 unit tests using real Sharp (solid images, checkerboard patterns, known bit patterns)

### 3. API Upload Pipeline Integration

Integrated dedup check into the upload handler between `toBuffer()` and `processUpload()`. Hashes are fetched once per request (not per file) and maintained in a batch list to catch within-batch duplicates. Duplicates return 409 with the matched photo's `id` and `url`.

**Modified:**

- `api/src/catalog/photos/queries.ts` — added `PhotoHashRow`, `getPhotoHashesByItem()`, `dhash` in `InsertPhotoParams` and `insertPhoto`
- `api/src/catalog/photos/schemas.ts` — added `duplicatePhotoError` schema with nested `matched` object, 409 response in `uploadPhotosSchema`
- `api/src/catalog/photos/routes.ts` — dedup check before processing, batch hash accumulation, 409 response
- `api/src/catalog/photos/routes.test.ts` — dhash module mock, 409 test, above-threshold test, updated mock sequences

### 4. Web UI Error Handling

Added `DuplicateUploadError` class and 409 handling in the XHR upload layer. The upload hook catches duplicates and shows a specific Sonner toast with description.

**Modified:**

- `web/src/lib/zod-schemas.ts` — `DuplicatePhotoResponseSchema`
- `web/src/catalog/photos/api.ts` — `DuplicateUploadError` class, 409 branch in XHR onload
- `web/src/catalog/photos/usePhotoUpload.ts` — `DuplicateUploadError` catch with specific toast
- `web/src/catalog/photos/__tests__/usePhotoUpload.test.ts` — duplicate upload error test

---

## Technical Details

### dHash Algorithm

1. Resize to 9x8 greyscale (72 pixels) via Sharp `fit: 'fill'`
2. Compare each pixel to its right neighbor across 8 columns × 8 rows = 64 bits
3. Pack into BigInt, serialize as 16-char lowercase hex with left-pad
4. Hamming distance: XOR + Kernighan bit-count (Brian Kernighan's algorithm)

### Duplicate Detection Flow

```
toBuffer() → computeDHash(rawBuffer) → check DB + batch hashes
  ├─ match (distance ≤ 10) → 409 { error, matched: { id, url } }
  └─ no match → processUpload() → write files → insertPhoto({ ..., dhash })
```

### Design Decisions

- **Same-item scope** — checks only within the uploading item, not cross-catalog
- **Raw buffer hashing** — computed before Sharp processing to bail early on duplicates
- **Threshold ≤ 10** — matches ML pipeline's proven default (10 out of 64 bits)
- **`dhash` internal only** — excluded from `PHOTO_COLUMNS`, never serialized to clients
- **No index on dhash** — per-item scans via existing `idx_item_photos_item` index

---

## Validation & Testing

### Test Results

| Module | Tests | Status |
|--------|-------|--------|
| API | 716 passed, 42 skipped | ✅ |
| Web | 593 passed | ✅ |

### New Tests Added

- 8 dhash unit tests (hash format, determinism, resolution invariance, distance calculations)
- 2 route integration tests (409 on duplicate, 201 when above threshold)
- 1 web hook test (DuplicateUploadError toast)

### Quality Checks

- TypeScript: zero errors (API + Web)
- ESLint: zero warnings
- Prettier: zero formatting issues
- Build: clean (API + Web)

---

## Impact Assessment

- **Curators** get immediate feedback when uploading duplicate photos
- **Catalog quality** improves by preventing redundant images per item
- **ML training** benefits from cleaner, non-duplicate photo sets
- **No breaking changes** — the `dhash` column is internal and invisible to clients

---

## Related Files

**Created:** `api/db/migrations/029_item_photos_dhash.sql`, `api/src/catalog/photos/dhash.ts`, `api/src/catalog/photos/dhash.test.ts`

**Modified:** `api/src/catalog/photos/queries.ts`, `api/src/catalog/photos/schemas.ts`, `api/src/catalog/photos/routes.ts`, `api/src/catalog/photos/routes.test.ts`, `web/src/lib/zod-schemas.ts`, `web/src/catalog/photos/api.ts`, `web/src/catalog/photos/usePhotoUpload.ts`, `web/src/catalog/photos/__tests__/usePhotoUpload.test.ts`

---

## Status

✅ COMPLETE
