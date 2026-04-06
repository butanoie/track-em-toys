# Collection Item Photos — DB + API Routes (Slice 1)

**Date:** 2026-04-03
**Time:** 04:03:12 UTC
**Type:** Feature
**Phase:** 1.6
**Version:** v0.14.0

## Summary

Implemented the backend foundation for user collection item photos and the catalog contribution flow. Users can upload private photos to their collection items, and optionally contribute them to the shared catalog (pending curator approval). GDPR purge extended to delete collection data and anonymize contributed catalog photos.

---

## Changes Implemented

### 1. Database Migration (036)

Two new tables:

- **`collection_item_photos`** — RLS-protected (FORCE), stores user-private photos per collection item. Denormalized `user_id` for efficient RLS policy evaluation. Perceptual hash (`dhash`) for duplicate detection.
- **`photo_contributions`** — No RLS (shared audit data). Tracks consent version, contribution status, and links between collection photos and catalog copies. `collection_item_photo_id` is nullable with `ON DELETE SET NULL` for GDPR compatibility.

### 2. API Routes (7 endpoints)

All under `/collection/:id/photos`, using `withTransaction` with RLS context:

| Method | Path                     | Purpose                           |
| ------ | ------------------------ | --------------------------------- |
| POST   | `/`                      | Upload photos (multipart, max 10) |
| GET    | `/`                      | List photos                       |
| PATCH  | `/reorder`               | Reorder photos                    |
| PATCH  | `/:photoId/primary`      | Set primary                       |
| DELETE | `/:photoId`              | Delete photo                      |
| POST   | `/:photoId/contribute`   | Contribute to catalog             |
| DELETE | `/:photoId/contribution` | Revoke contribution               |

### 3. GDPR Extension

Extended `gdprPurgeUser()` with RLS context switch pattern:

- Switches `app.user_id` to target user for FORCE RLS table access
- Deletes `collection_item_photos` (ON DELETE SET NULL preserves audit)
- Deletes `collection_items`
- Scrubs `item_photos.uploaded_by` to NULL
- Best-effort file cleanup after transaction commit

### 4. Shared Query Functions

- `getCollectionItemRef()` — shared collection item lookup for all photo handlers
- `insertPendingCatalogPhoto()` — catalog photo insert in query layer (not inline SQL)

**Created:**

- `api/db/migrations/036_collection_item_photos.sql`
- `api/src/collection/photos/routes.ts`
- `api/src/collection/photos/queries.ts`
- `api/src/collection/photos/schemas.ts`
- `api/src/collection/photos/storage.ts`
- `api/src/collection/photos/routes.test.ts`

**Modified:**

- `api/src/collection/routes.ts` — photo sub-plugin registration, content-type hook update
- `api/src/admin/queries.ts` — GDPR purge extension
- `api/src/admin/routes.ts` — file cleanup after GDPR
- `api/src/collection/routes.test.ts` — mock for photo sub-plugin
- `api/src/admin/routes.test.ts` — mock for `deleteUserPhotoDirectory`
- `.claude/rules/api-database.md` — GDPR RLS context switch pattern
- `.claude/rules/api-routes.md` — collection photo conventions

---

## Technical Details

### RLS Context Switch for GDPR

`gdprPurgeUser()` calls `set_config('app.user_id', $targetUserId, true)` before DELETE statements on FORCE RLS tables. This switches from the admin's context to the target user's, allowing the DELETE to see the target user's rows. Safe because subsequent operations touch only non-RLS tables.

### Storage Layout

Collection photos stored under `PHOTO_STORAGE_PATH/collection/{userId}/{collectionItemId}/{photoId}-{size}.webp`. Catalog contributions are file-copied (not linked) to `{itemId}/{newPhotoId}-{size}.webp`.

### Contribution Flow

1. Verify ownership via RLS
2. Insert `photo_contributions` row
3. Copy files to catalog directory
4. Insert `item_photos` with `status: 'pending'`
5. Update contribution with catalog photo ID

---

## Validation & Testing

- 22 new integration tests (all passing)
- 831 total tests passing, 0 lint errors
- TypeScript build clean

---

## Impact Assessment

- First feature to combine RLS-protected data with shared catalog data
- Establishes the GDPR RLS context switch pattern for future FORCE RLS tables
- No breaking changes to existing APIs

---

## Summary Statistics

- 6 new files, 7 modified files
- 22 new tests
- 2 new database tables, 1 migration
- 7 new API endpoints

---

## Next Steps

- Slice 2 (#138): Web UI — CollectionPhotoSheet, gallery integration
- Slice 3 (#139): ContributeDialog with disclaimers
- Slice 4 (#140): Add-by-Photo integration

## Status

✅ COMPLETE
