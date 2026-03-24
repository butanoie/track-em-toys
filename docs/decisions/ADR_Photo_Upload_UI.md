# ADR: Photo Upload UI Design (Phase 1.9 Slice 2)

**Date:** 2026-03-20
**Status:** Accepted (architecture + UI design approved, audit complete)
**Depends on:** Phase 1.9 Slice 1 (Photo API, PR #76 merged)
**GitHub Issue:** #77

---

## Context

Phase 1.9 Slice 2 adds curator/admin-facing photo management UI to the catalog item detail views. The Slice 1 API is already complete with four endpoints: upload (multipart POST), delete, set primary, and reorder. This slice needs to provide an intuitive management interface that integrates cleanly into the existing item detail page and panel.

### Requirements

- Upload button visible only to curators/admins on both `ItemDetailPage` and `ItemDetailPanel`
- Slide-out Sheet for photo management (more space than the 380px detail panel column)
- Dedicated drop zone with "or select files" link
- Per-photo progress bars during upload
- Photo management: delete (with confirmation friction), set primary (badge overlay, WCAG 2.2 AA), drag-to-reorder
- TanStack Query mutation hooks with cache invalidation
- `VITE_PHOTO_BASE_URL` env var for photo URL construction

---

## Design Decisions

### 1. Slide-Out Sheet for Photo Management

**Decision:** Photo management lives in a Shadcn `Sheet` (right side, ~480px wide) rather than inline in the detail content or a modal dialog.

**Why:** The `ItemDetailPanel` is only 380px wide — too narrow for drag-to-reorder, upload controls, and photo thumbnails simultaneously. A full modal would obscure the item context. A right-side Sheet provides ample space while keeping the item detail visible on the left. Radix Sheet handles focus trap, `aria-modal`, and scroll lock correctly.

### 2. XHR for Upload Progress (Not Fetch)

**Decision:** Use `XMLHttpRequest` with `upload.onprogress` for photo uploads instead of the `fetch` API.

**Why:** The user requested per-photo progress bars. The `fetch` API does not expose upload progress (`ReadableStream` upload tracking has spotty browser support and requires `duplex: 'half'`). XHR's `upload.onprogress` is the reliable cross-browser solution. The XHR wrapper reads auth tokens from `authStore.getToken()` directly and implements a single retry on 401 via `attemptRefresh()`.

**Trade-off:** The upload path does not go through `apiFetch`, so it manages its own auth header. This is acceptable — it's a single function, and the alternative (no progress bars) is worse UX.

### 3. Sequential Upload (One File at a Time)

**Decision:** Upload files sequentially rather than in parallel.

**Why:** Sequential uploads produce predictable, readable progress — one bar advances at a time. The API accepts 1-10 files per request but we send one per request for individual progress tracking. With max 10 files at ≤10MB each, sequential is fast enough. The API rate limit is 20 uploads/minute, so parallel uploads could hit rate limits with large batches.

### 4. `useReducer` State Machine for Upload Lifecycle

**Decision:** Upload state is managed via a `useReducer` hook (`usePhotoUpload`) with states: `queued → uploading → done | error`.

**Why:** Upload state is ephemeral UI state (not server state), so it does not belong in TanStack Query. A reducer provides predictable state transitions for the per-file lifecycle. The hook is independently testable.

### 5. Mutation Bag Pattern for Photo Operations

**Decision:** `usePhotoMutations(franchise, slug)` returns `{ deleteMutation, setPrimaryMutation, reorderMutation }` following the `useAdminUserMutations` pattern.

**Why:** Consistent with the existing codebase convention. All three mutations share a single `invalidateQueries` closure targeting `['catalog', 'items', franchise, slug]`. Upload is excluded from this bag because it uses XHR (not `useMutation`).

### 6. Optimistic Local State for Drag Reorder

**Decision:** `PhotoGrid` maintains a local `orderedPhotos` state synced from the `photos` prop. On drag-end, local state updates immediately and the reorder mutation fires in the background.

**Why:** Without optimistic state, the photo grid would snap back to the original order during the API round-trip, creating a jarring UX. On error, query invalidation restores the server's canonical order.

### 7. `buildHeaders` FormData Guard

**Decision:** Add `!(init.body instanceof FormData)` to the Content-Type auto-injection condition in `api-client.ts`.

**Why:** The current `buildHeaders` sets `Content-Type: application/json` for any POST/PATCH with a body. For `FormData`, this overrides the browser's automatic `multipart/form-data; boundary=...` header, breaking multipart uploads. This is a latent bug that would affect any future `apiFetch` call with `FormData`, even though the current XHR upload path bypasses `apiFetch`.

### 8. ConfirmDialog: Cross-Module Import (No Move)

**Decision:** Import `ConfirmDialog` from `@/admin/components/ConfirmDialog` in catalog code. Do not move it to a shared location.

**Why:** The component has zero admin-specific imports — all its dependencies are from `@/components/ui/*`. Moving it would require updating admin tests and import paths for no functional gain. If more consumers appear later, the move is a trivial refactor.

### 9. Photo URL Prefix in Frontend

**Decision:** `VITE_PHOTO_BASE_URL` is read via `import.meta.env` and prepended in frontend components, not in the API layer.

**Why:** The API stores relative URLs in the database (e.g., `abc-123/def-456-gallery.webp`) for portability (CDN, different environments). The frontend is the right place to resolve the full URL — it knows its own environment config. A `buildPhotoUrl()` utility function provides this. The function must normalize the join: `${base}/${relativeUrl}` handling trailing/leading slashes.

**Scope note:** This fix must also be applied to the existing `PhotoGallery` component, which currently renders `<img src={photo.url}>` with bare relative URLs. This hasn't broken yet because no seed data has photos, but will break with real photos.

### 10. Role Gating at Page/Panel Level

**Decision:** Role check (`user?.role === 'curator' || user?.role === 'admin'`) happens in `ItemDetailPage` and `ItemDetailPanel`, not in `ItemDetailContent` or the Sheet.

**Why:** `ItemDetailContent` is a purely presentational component — it should not call `useAuth()`. The "Manage Photos" button renders in the page header row (next to `ShareLinkButton`) and in the panel's `actions` slot (via `DetailPanelShell`). The Sheet itself does not re-check roles — it trusts that only authorized users can open it.

### 11. Integration Points

**Decision:** "Manage Photos" button placement:

- **ItemDetailPage:** In the header row, next to `ShareLinkButton`
- **ItemDetailPanel:** In `DetailPanelShell`'s `actions` slot

**Why:** This matches the existing pattern where the `ShareLinkButton` already lives in these locations. It keeps `ItemDetailContent` purely presentational.

---

## File Organization

All new photo UI code lives in `web/src/catalog/photos/`:

```
catalog/photos/
  api.ts                    — uploadPhoto (XHR), deletePhoto, setPrimaryPhoto, reorderPhotos
  usePhotoUpload.ts         — useReducer state machine for upload lifecycle
  usePhotoMutations.ts      — TanStack Query mutation bag
  PhotoManagementSheet.tsx  — Slide-out Sheet composing all sub-components
  DropZone.tsx              — Drag-and-drop file input with "or select files"
  PhotoGrid.tsx             — @dnd-kit sortable grid with per-photo actions
  __tests__/                — Component and hook tests
```

### Files to Modify

- `web/src/lib/api-client.ts` — FormData guard in `buildHeaders`
- `web/src/lib/zod-schemas.ts` — `PhotoWriteItemSchema`, `PhotoSchema` exports
- `web/src/vite-env.d.ts` — `VITE_PHOTO_BASE_URL` type declaration
- `web/.env.example` — Add `VITE_PHOTO_BASE_URL` placeholder
- `web/src/catalog/pages/ItemDetailPage.tsx` — Role check + Sheet trigger
- `web/src/catalog/components/ItemDetailPanel.tsx` — Role check + Sheet trigger
- `web/src/catalog/components/PhotoGallery.tsx` — Apply `buildPhotoUrl()` to existing photo URLs
- Existing test files for modified components

---

## New Dependencies

- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — Drag-to-reorder (modern, accessible, ~10KB). `@dnd-kit/utilities` provides `CSS.Transform.toString()` required by `useSortable`.
- Shadcn Sheet component — `npx shadcn@latest add sheet` (Radix Dialog-based)

---

## API Endpoints (Slice 1, Already Built)

| Method   | Path                                                | Purpose                        |
| -------- | --------------------------------------------------- | ------------------------------ |
| `POST`   | `/catalog/franchises/:franchise/items/:slug/photos` | Upload 1-10 photos (multipart) |
| `DELETE` | `.../photos/:photoId`                               | Delete a photo (204)           |
| `PATCH`  | `.../photos/:photoId/primary`                       | Set primary photo              |
| `PATCH`  | `.../photos/reorder`                                | Bulk reorder photos            |

---

## Deferred / Out of Scope

- Real (non-mocked) E2E tests — deferred, tracked in agent memory
- Photo moderation (#71), approval dashboard (#72), soft delete (#73), captions (#74), pending visibility (#75) — all deferred to Phase 1.9b
- Optimistic updates for delete/set-primary — using invalidate-on-success pattern for consistency with rest of codebase
- Parallel upload — sequential is sufficient for ≤10 files

---

## Resolved Questions (via Frontend Design Spec)

All UI design questions answered in `docs/designs/photo-management-sheet.md`:

- **Sheet layout:** Drop zone top, upload queue middle, photo grid bottom
- **Progress bars:** Inline per-file with filename, percentage, spinning loader
- **Primary badge:** Amber filled star (`bg-amber-600 text-white`), top-left corner, always visible
- **Drop zone active state:** Solid primary border, light primary bg, "Release to upload" text
- **Mobile responsive:** Full-width sheet, 2-col grid, always-visible action bar (no hover on touch)
- **Drag interaction:** Entire photo tile is draggable (5px activation distance allows button clicks)

## Audit Findings (Architecture Review)

Findings from the 5-pass architecture review (2026-03-20):

1. **PhotoGallery needs URL prefix too** — existing component uses bare relative URLs; `buildPhotoUrl()` must be applied there
2. **`@dnd-kit/utilities` required** — provides `CSS.Transform.toString()` for `useSortable`
3. **Client-side file size validation** — add 10MB check before queuing to avoid wasted upload + 413 error
4. **Disable drag during upload** — query invalidation from completed uploads resets `orderedPhotos` via `useEffect`, which could disrupt an in-progress drag
5. **XHR `withCredentials: true`** — required for the refresh cookie during 401 retry
