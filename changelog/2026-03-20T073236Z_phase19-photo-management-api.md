# Phase 1.9 Slice 1 — Photo Management API

**Date:** 2026-03-20
**Time:** 07:32:36 UTC
**Type:** Feature Addition
**Phase:** 1.9 Photo Management
**Issue:** #37

## Summary

Built the complete API-side photo management system for catalog items. Curators can upload, delete, reorder, and set primary photos via 4 new endpoints. Photos are converted to WebP and stored at 3 resolutions (thumb 200×200, gallery 800×800, lossless original) for gallery display and ML training. Added `status`, `sort_order`, and `updated_at` columns to `item_photos` to support future moderation workflows.

---

## Changes Implemented

### 1. Migration 023: Schema Updates

Added three columns to `item_photos`: `status TEXT DEFAULT 'approved'` (for future moderation), `sort_order INTEGER` (user-defined display order), `updated_at TIMESTAMPTZ` (with trigger). Backfills `sort_order` via `ROW_NUMBER()` window function.

**Created:**

- `api/db/migrations/023_item_photos_status_sort_order.sql`

### 2. Photo Module (`src/catalog/photos/`)

Five co-located files implementing storage, processing, queries, schemas, and routes.

**Created:**

- `api/src/catalog/photos/storage.ts` — FS path helpers, ensureDir, writePhoto, deletePhotoFiles
- `api/src/catalog/photos/thumbnails.ts` — sharp pipeline: 3 WebP variants via `Promise.all`
- `api/src/catalog/photos/queries.ts` — INSERT, DELETE, SET PRIMARY (atomic via `withTransaction`), REORDER (atomic), getMaxSortOrder
- `api/src/catalog/photos/schemas.ts` — Fastify request/response schemas for all 4 endpoints
- `api/src/catalog/photos/routes.ts` — POST upload, DELETE, PATCH set-primary, PATCH reorder

### 3. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/:franchise/items/:slug/photos` | curator | Multi-file upload (max 10), WebP conversion |
| DELETE | `/:franchise/items/:slug/photos/:photoId` | curator | Hard delete photo + files |
| PATCH | `/:franchise/items/:slug/photos/:photoId/primary` | curator | Set as primary (atomic) |
| PATCH | `/:franchise/items/:slug/photos/reorder` | curator | Bulk update sort_order |

### 4. Infrastructure

- `@fastify/multipart`, `@fastify/static`, `sharp` added as dependencies
- `PHOTO_STORAGE_PATH`, `PHOTO_BASE_URL`, `PHOTO_MAX_SIZE_MB` env vars
- `@fastify/static` registered in development mode for local photo serving
- Startup validation: `PHOTO_STORAGE_PATH` must exist and be writable (skipped in test)

### 5. Existing Code Updates

- `items/queries.ts` — `PhotoRow` gains `sort_order`, query adds `WHERE status = 'approved'` and `ORDER BY is_primary DESC, sort_order ASC`
- `items/schemas.ts` — imports shared `photoItem` from `shared/schemas.ts`
- `items/routes.ts` — registers `photoRoutes` sub-plugin at `/:slug/photos`
- `shared/schemas.ts` — new `photoItem` export (prevents drift between read/write schemas)
- `config.ts` — `photos` config group
- `types/index.ts` — `PhotoStatus` type, `ItemPhoto` updated
- `db/pool.ts` — `QueryOnlyClient` type export for test mocking
- Web Zod schema + PhotoGallery interface — `sort_order` field added

---

## Technical Details

### Storage Architecture

- **File naming**: `{itemId}/{photoId}-{size}.webp` (thumb, gallery, original)
- **DB URL**: relative path `{itemId}/{photoId}-gallery.webp` — client prepends `PHOTO_BASE_URL`
- **Atomic uploads**: all files processed into memory buffers first, then written to disk + inserted to DB; cleanup on failure

### Key Design Decisions

- `@fastify/multipart` scoped to photo plugin — coexists with JSON body parsing (different content types)
- `withTransaction` (no userId) for SET PRIMARY and REORDER atomicity — reuses existing pattern
- MIME allowlist: `image/jpeg`, `image/png`, `image/webp`, `image/gif` (SVG rejected for XSS)
- `status` column pre-built for future moderation; curator uploads auto-set `'approved'`
- `sort_order` globally unique per item (includes pending/rejected) to avoid collisions

### Deferred Issues

- #71 Photo moderation (NSFW detection + approval)
- #72 Approval notification dashboard
- #73 Soft delete + 30-day recycle bin
- #74 Caption editing
- #75 Pending photo visibility

---

## Validation & Testing

```
API:  807 tests passed, 0 failures (25 new photo tests)
Web:  466 tests passed, 0 failures
Lint: clean
Typecheck: clean
Format: clean
Build: success
```

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| New files | 10 |
| Modified files | 13 + 8 test config updates |
| New API tests | 25 |
| New endpoints | 4 |
| New dependencies | 3 (@fastify/multipart, @fastify/static, sharp) |
| Deferred issues created | 5 |

---

## Status

✅ COMPLETE (Slice 1 of 3)
