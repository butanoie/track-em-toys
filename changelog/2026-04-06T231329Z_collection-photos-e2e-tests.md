# Collection Photos E2E Test Suite (#145)

**Date:** 2026-04-06
**Time:** 23:13:29 UTC
**Type:** Test
**Phase:** 1.6
**Version:** v0.16.0

## Summary

Added 16 Playwright E2E tests covering the full Phase 1.6 collection photo lifecycle:
photo upload, management, contribution flow, and Add-by-Photo integration. Built a new
stateful mock helper (`MockCollectionPhotoState`) to drive all 7 photo endpoints. Also
fixed a real UX bug discovered while writing the tests: the Add to Collection dialog
overflowed the viewport when the new Photo Options section was rendered.

---

## Changes Implemented

### 1. `MockCollectionPhotoState` (new helper class)

Stateful mock for `/collection/:id/photos*` endpoints in `web/e2e/fixtures/mock-helpers.ts`.
Mirrors `MockCollectionState`'s closure-based pattern.

- Methods: `addPhoto`, `listPhotos`, `setPrimary`, `deletePhoto`, `contribute`,
  `revokeContribution`, `setNextUploadResponse` (one-shot)
- Constructor accepts initial seed via `Record<itemId, Partial<MockCollectionPhoto>[]>`
- `register(page)` installs Playwright route handlers — must be called AFTER
  `MockCollectionState.register(page)` so its catch-all on `**/collection/**` doesn't win
- Response shapes follow the schema split: POST/PATCH/DELETE return the **base**
  photo shape, GET list returns the **extended** shape with `contribution_status`
- Generic `DELETE /:photoId` route is registered FIRST so the more-specific suffix
  routes (`/primary`, `/contribute`, `/contribution`, `/reorder`) registered later
  take priority via Playwright's last-wins rule
- Photo ID portion of route regexes uses `[^/]+` (not strict UUID) so tests can seed
  with friendly IDs like `'photo-1'`

### 2. `web/e2e/collection-photos.spec.ts` (NEW, 11 tests)

**Photo Upload (4)**
- Upload single PNG → photo appears + success toast
- Upload 3 files → all 3 appear in grid
- Upload PDF → error toast, no upload
- Duplicate upload (one-shot 409) → DuplicateUploadError toast

**Photo Management (2)**
- Set primary → star moves to clicked photo
- Delete with confirm → photo removed + toast

**Contribute Flow (5)**
- Contribute happy path → consent → submit → "Submitted" badge
- Submitted badge persists after sheet close + reopen
- Submitted photos hide the contribute action
- Approved photos show "Shared" badge (pre-seeded)
- Rejected photos allow re-contribution

Drag-to-reorder is **intentionally skipped** — covered by PhotoGrid unit tests +
the API integration test. dnd-kit + Playwright drag is historically flaky.

### 3. `web/e2e/add-by-photo.spec.ts` (EXTENDED, +5 tests)

New "Add by Photo — photo options integration" describe block:
- Photo Options section renders with default state (save✓, contribute✗)
- Default checkboxes (save only) → submit → upload mock fires, no contribute toast
- Save + contribute → submit → both upload and contribute toasts fire
- Unchecking save hides the contribute checkbox
- Catalog-page entry (no `photoFile` prop) hides Photo Options entirely

### 4. `web/playwright.config.ts`

Added `collection-photos.spec.ts` to the `user` project's `testMatch`.

### 5. UX Fix — `AddToCollectionDialog` viewport overflow

**Bug discovered while writing tests.** The Slice 4 Photo Options section made the
dialog tall enough to exceed the default 1280×720 viewport, pushing the "Add to
Collection" submit button below the visible area. Playwright's actionability check
caught this; manual testing on taller browser windows did not.

**Fix:** Added `max-h-[90vh] overflow-y-auto` to the `DialogContent` className.
Scoped to this dialog only — not the shared shadcn `dialog.tsx` primitive.

## Decisions Made

- **All 13 issue checklist items** plus 3 extras from the scenarios doc (multi-upload,
  invalid file type, approved badge) = 16 tests total
- **Drag-reorder excluded** — flaky in Playwright, already covered by unit + integration
- **Inline base64 PNG** for upload fixtures — matches existing `add-by-photo.spec.ts`
  pattern, no binary fixtures committed
- **Stateful mock class** rather than per-test inline mocks — most scenarios need
  cross-action state ("upload then verify it appears", "contribute then verify badge
  persists after reopen")
- **One-shot duplicate trigger** (`setNextUploadResponse`) cleared after first POST
  so tests don't need explicit cleanup
- **Schema split awareness baked into the mock** — POST returns base shape, GET returns
  extended shape; mismatches would cause client Zod parse failures

## Files Modified

- `web/e2e/fixtures/mock-helpers.ts` — `MockCollectionPhotoState` class + types (~190 lines added)
- `web/e2e/collection-photos.spec.ts` — NEW file, 11 tests
- `web/e2e/add-by-photo.spec.ts` — extended with 5 photo options integration tests
- `web/playwright.config.ts` — registered new spec in `user` project testMatch
- `web/src/collection/components/AddToCollectionDialog.tsx` — viewport overflow fix

## Verification

- `npm run build` ✅
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npx vitest run AddToCollectionDialog` ✅ (11/11 unit tests still pass)
- `npx playwright test collection-photos add-by-photo collection.spec --project=user` ✅ (39/39 — no regressions)

## Architectural Audit Notes

The architecture review caught these issues that required course correction during
implementation:
- **M2 (Schema split)**: Mock had to distinguish base vs extended shape per endpoint
- **M3 (Route collision)**: Generic DELETE route had to register before suffix routes
- **M4 (Duplicate trigger semantics)**: One-shot reset chosen over sticky
- **Discovered during implementation**: photo IDs in tests aren't UUIDs, regexes had to
  be loosened from `[0-9a-f-]{36}` to `[^/]+`
- **Discovered during implementation**: dialog viewport overflow bug from Slice 4

## Next Steps

- PR review and merge
- Phase 1.6 epic #136 ready to close once this and PR #144 merge
- Optional follow-up: add `max-h-[90vh] overflow-y-auto` to other long dialogs in the
  codebase (EditCollectionItemDialog, ImportCollectionDialog) if they have the same risk
