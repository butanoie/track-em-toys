# Phase 1.9 Slice 2 — Photo Upload UI for Curators

**Date:** 2026-03-20
**Time:** 18:53:48 UTC
**Type:** Feature
**Phase:** 1.9 (Photo Management)
**Issue:** #77

## Summary

Added curator/admin-facing photo management UI to catalog item detail views. The feature includes a slide-out Sheet with drag-and-drop upload (with per-photo XHR progress bars), drag-to-reorder grid, primary photo badge, and delete with confirmation. Integrates with the Slice 1 photo API endpoints (PR #76).

---

## Changes Implemented

### 1. Photo Management Sheet

Full-featured slide-out panel for curators to manage item photos:

- Drag-and-drop upload zone with "or select files" link
- Per-photo progress bars via XHR `upload.onprogress` (sequential processing)
- Client-side MIME type and file size validation (JPEG, PNG, WebP, GIF; max 10MB)
- `@dnd-kit/sortable` drag-to-reorder grid with keyboard accessibility and screen reader announcements
- Amber star badge for primary photo (WCAG 2.2 AA compliant — `bg-amber-600 text-white`)
- Delete with `ConfirmDialog` friction (destructive variant)

**Created:**

- `web/src/catalog/photos/api.ts` — XHR upload, delete/setPrimary/reorder API functions, `buildPhotoUrl()`, `validateFile()`
- `web/src/catalog/photos/usePhotoUpload.ts` — `useReducer` state machine for upload lifecycle
- `web/src/catalog/photos/usePhotoMutations.ts` — TanStack Query mutation bag
- `web/src/catalog/photos/PhotoManagementSheet.tsx` — Sheet composition root
- `web/src/catalog/photos/DropZone.tsx` — Drag-and-drop file input
- `web/src/catalog/photos/UploadQueue.tsx` — Per-file progress bar list
- `web/src/catalog/photos/PhotoGrid.tsx` — `@dnd-kit` sortable grid with photo actions

### 2. Integration with Item Detail Views

- Camera icon button in `ItemDetailPage` header row (next to ShareLinkButton)
- Camera icon button in `ItemDetailPanel` actions slot
- Both gated by `useAuth()` role check: `curator` or `admin` only

**Modified:**

- `web/src/catalog/pages/ItemDetailPage.tsx` — Role check + Sheet trigger
- `web/src/catalog/components/ItemDetailPanel.tsx` — Role check + Sheet trigger

### 3. Photo URL Prefix Fix

Applied `buildPhotoUrl()` to existing `PhotoGallery` component — fixes a latent bug where relative photo URLs from the API would not resolve correctly. No photos existed in seed data, so this was invisible until now.

**Modified:**

- `web/src/catalog/components/PhotoGallery.tsx` — `buildPhotoUrl()` applied to all `<img src>` attributes

### 4. API Client FormData Guard

Added `!(init.body instanceof FormData)` to `buildHeaders` in `api-client.ts`. Prevents the auto-injected `Content-Type: application/json` from overriding the browser's `multipart/form-data` boundary header on FormData uploads.

**Modified:**

- `web/src/lib/api-client.ts` — One-line guard in `buildHeaders`

### 5. New Dependencies

- Shadcn Sheet component (`@radix-ui/react-dialog` based)
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`

### 6. Zod Schemas

Added `PhotoWriteItemSchema` (with `status` field for write responses), `PhotoSchema` (extracted read shape), and response wrapper schemas.

**Modified:**

- `web/src/lib/zod-schemas.ts`
- `web/src/vite-env.d.ts` — `VITE_PHOTO_BASE_URL` type
- `web/.env.example` — `VITE_PHOTO_BASE_URL` placeholder

---

## Technical Details

### Upload Architecture

Upload uses XHR (not `fetch`) because the Fetch API doesn't expose `upload.onprogress`. The XHR wrapper in `api.ts` manages its own auth header via `authStore.getToken()` and implements a single retry on 401 via `attemptRefresh()`. Files are uploaded sequentially (one at a time) for predictable progress UX.

### State Management

Upload state uses `useReducer` (not TanStack Query) because upload progress is ephemeral UI state. The state machine tracks: `queued → uploading → done | error`. Completed items auto-remove after 3 seconds.

Photo mutations (delete, set primary, reorder) use the standard `useMutation` pattern with `invalidateQueries` on success.

### Accessibility

- Drop zone: `role="region"` with `aria-label`, `aria-describedby` for format hints
- Upload queue: `aria-live="polite"`, `role="alert"` on errors
- Photo grid: `@dnd-kit` keyboard sensor with custom screen reader announcements
- Primary badge: `role="status"` with `aria-label`
- All interactive elements have appropriate `aria-label` attributes

---

## Validation & Testing

### Test Results

```
Test Files  69 passed (69)
Tests       519 passed (519) — 25 new tests across 7 new test files
```

### New Test Files

| File                            | Tests | Coverage                                                    |
| ------------------------------- | ----- | ----------------------------------------------------------- |
| `api.test.ts`                   | 8     | `buildPhotoUrl`, `validateFile` (MIME + size)               |
| `DropZone.test.tsx`             | 7     | Render, file drop, file select, disabled state, a11y        |
| `UploadQueue.test.tsx`          | 8     | All 4 status states, multiple items, a11y                   |
| `PhotoGrid.test.tsx`            | 12    | Primary badge, set-primary, delete, drag handles, help text |
| `usePhotoMutations.test.ts`     | 4     | All 3 mutations call correct API functions                  |
| `usePhotoUpload.test.ts`        | 5     | Enqueue, validation, success flow, error recovery           |
| `PhotoManagementSheet.test.tsx` | 9     | Sheet render, drop zone, photo grid, delete confirm         |

### Quality Checks

| Check         | Result                 |
| ------------- | ---------------------- |
| Web Tests     | ✅ 519 passed          |
| Web Lint      | ✅ 0 errors            |
| Web Typecheck | ✅ 0 errors            |
| Web Format    | ✅ All files formatted |
| Web Build     | ✅ Built in 1.3s       |

### Bugs Caught in Code Review

5 bugs identified and fixed during quality review:

1. `onUploadComplete` was a no-op — uploads would never refresh the photo grid
2. `processingRef` race condition — upload queue stalled after any error
3. `attemptRefresh()` rejection unhandled — upload promise could hang forever
4. `buildPhotoUrl` double-slash risk with trailing slash in base URL
5. Unguarded `as` type cast in XHR error handler

---

## Impact Assessment

- Curators can now upload, reorder, and manage photos for catalog items
- Photo management is code-split into the Sheet bundle (~68KB gzip: 22KB) — not loaded for regular users
- `buildPhotoUrl()` fix prepares `PhotoGallery` for actual photo display
- `buildHeaders` FormData guard fixes a latent bug that would affect any future `apiFetch` with `FormData`

---

## Related Files

### Documentation

- `docs/decisions/ADR_Photo_Upload_UI.md` — Architecture decisions (11 decisions + 5 audit findings)
- `docs/designs/photo-management-sheet.md` — UI design specification
- `web/CLAUDE.md` — Photo Domains section updated with new conventions

---

## Status

✅ COMPLETE — Implementation, tests, and documentation all done. User needs to add `VITE_PHOTO_BASE_URL=http://localhost:3010/photos` to local `web/.env`.

## Next Steps

- Phase 1.9 Slice 3: ML training data export (#78)
- Real E2E tests for photo upload flow (deferred)
- Phase 1.9b: moderation (#71), approval dashboard (#72), soft delete (#73), captions (#74), pending visibility (#75)
