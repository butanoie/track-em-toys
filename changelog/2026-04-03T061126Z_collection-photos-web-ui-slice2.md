# Collection Item Photos — Web UI (Slice 2)

**Date:** 2026-04-03
**Time:** 06:11:26 UTC
**Type:** Feature
**Phase:** 1.6
**Version:** v0.15.0

## Summary

Implemented the web frontend for collection item photo management. Users can now upload, view, reorder, set primary, and delete photos on their collection items via a right-panel Sheet. The collection list API response now includes collection photo count and prioritizes user-uploaded photos for thumbnails.

---

## Changes Implemented

### 1. Web API Client + Hooks

- XHR upload with progress tracking, auth header via `authStore.getToken()`, 401 retry via `attemptRefresh()`
- Serial upload state machine (same reducer pattern as catalog photo upload)
- TanStack Query mutations for delete, set-primary, reorder — all invalidate `['collection']` prefix
- Reuses `validateFile` and `DuplicateUploadError` from catalog photos module

### 2. CollectionPhotoSheet

- Right panel Sheet (`sm:max-w-3xl`) composing catalog `DropZone`, `UploadQueue`, and `PhotoGrid`
- `ConfirmDialog` for destructive delete with isPending feedback
- Fetches photos on open, refreshes after each mutation
- No contribute button (deferred to Slice 3)

### 3. Collection Item Integration

- Camera button with photo count badge on `CollectionItemCard` and `CollectionTable`
- `onManagePhotos` prop threaded through `CollectionGrid`
- `CollectionPage` owns `photoTarget` state, renders `CollectionPhotoSheet`

### 4. API Response Extension

- `COALESCE(collection_primary_photo.url, catalog_photo.url)` as `thumbnail_url` — user's photo takes priority
- `collection_photo_count` correlated subquery (RLS-scoped through parent JOIN)
- Updated `CollectionListRow`, `collectionItemSchema`, `formatCollectionItem`

### 5. Zod Schemas

- `CollectionPhotoSchema` (no status field), `CollectionPhotosResponseSchema`
- `SetPrimaryCollectionPhotoResponseSchema`, `ReorderCollectionPhotosResponseSchema`
- `ContributePhotoResponseSchema`, `RevokeContributionResponseSchema`
- `collection_photo_count` added to `CollectionItemSchema`

**Created:** 4 new web files

**Modified:** 12 files across API and web (queries, schemas, routes, components, tests, E2E mocks)

---

## Validation & Testing

- API: 831 tests pass, 0 lint errors
- Web: 758 tests pass, 0 lint errors, clean typecheck, clean build
- All existing tests updated with new `collection_photo_count` field and `onManagePhotos` prop

---

## Status

✅ COMPLETE
