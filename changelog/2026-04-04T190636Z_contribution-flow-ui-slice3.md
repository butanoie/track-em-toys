# Collection Photo Contribution Flow — Web UI (Slice 3)

**Date:** 2026-04-04
**Time:** 19:06:36 UTC
**Type:** Feature
**Phase:** 1.6
**Version:** v0.16.0

## Summary

Implemented the web UI for contributing collection photos to the shared catalog. Users can now click a share icon on any private collection photo to open a consent dialog with licensing disclaimers, then submit the photo for curator review. The list API now returns contribution status per photo, driving "Submitted" and "Shared" badges on photo tiles.

---

## Changes Implemented

### 1. API Backend — Contribution Status in List Response

- Extended `listCollectionPhotos` query with LEFT JOIN on `photo_contributions` to return `contribution_status: string | null`
- Created `CollectionPhotoListRow` interface extending `CollectionPhotoRow` with the new field
- Created `collectionPhotoListItem` Fastify schema spreading base properties + `contribution_status`
- Only the list response uses the extended schema — CRUD responses (upload, set-primary, reorder) remain unchanged

### 2. Web Schema + API Client

- Added `CollectionPhotoListSchema` extending `CollectionPhotoSchema` with `contribution_status: z.enum(['pending', 'approved', 'rejected']).nullable()`
- Added `CollectionPhotoListResponseSchema` for the list endpoint
- Added `contributeCollectionPhoto()` and `revokeCollectionPhotoContribution()` API client functions
- Updated `listCollectionPhotos` return type to `CollectionPhotoListItem[]`

### 3. Mutations Hook

- Added `contributeMutation` (calls contribute API with hardcoded `CONSENT_VERSION = '1.0'`)
- Added `revokeMutation` (wired but not exposed in UI — deferred per issue scope)

### 4. ContributeDialog Component

- Modal Dialog with photo thumbnail preview, licensing disclaimer callout, consent checkbox, amber submit button
- Checkbox gates the submit button (disabled until checked)
- Callback pattern: `onConfirm: () => void` — parent (CollectionPhotoSheet) owns the mutation
- Reset on reopen via `useEffect([open])`
- Installed Shadcn Checkbox component (`@radix-ui/react-checkbox`)

### 5. PhotoGrid Enhancement

- Added optional `onContribute?: (photoId: string) => void` prop to shared PhotoGrid
- Widened photos type to `PhotoWithContribution` (intersection with optional `contribution_status`)
- Renders Share2 icon button when `onContribute` provided and status is null or rejected
- Renders "Submitted" badge (amber) for pending contributions
- Renders "Shared" badge (green) for approved contributions
- Rejected contributions allow re-contribution (contribute button re-appears)
- Fully backward compatible — catalog callers pass `Photo[]` without `onContribute`

### 6. CollectionPhotoSheet Integration

- Added `contributeTarget: string | null` state mirroring the existing `deleteTarget` pattern
- Wired `onContribute={setContributeTarget}` to PhotoGrid
- Mounted ContributeDialog as sibling fragment alongside ConfirmDialog
- Success toast: "Photo contributed for review"

**Created:** 4 new files (ContributeDialog, checkbox component, 2 test files)

**Modified:** 11 files across API and web

---

## Technical Details

### Schema Split Pattern

The key architectural decision was splitting `CollectionPhotoSchema` (base) from `CollectionPhotoListSchema` (extended). This prevents Zod parse failures when set-primary/reorder/upload responses lack `contribution_status` — those endpoints return the base shape, while only the list endpoint returns the extended shape with the LEFT JOIN.

### Contribution Status Flow

```
listCollectionPhotos (API)
  → LEFT JOIN photo_contributions WHERE status != 'revoked'
  → contribution_status: null | 'pending' | 'approved' | 'rejected'
  → Zod parse via CollectionPhotoListSchema
  → PhotoGrid renders badge or contribute button based on status
```

---

## Validation & Testing

- API: 832 tests pass (+1), 0 lint errors, clean build
- Web: 779 tests pass (+21), 0 lint errors, clean typecheck, clean build
- Formatting: clean (Prettier)
- Quality review: 3 agents, 1 bug found and fixed (rejected re-contribution)

---

## Status

COMPLETE
