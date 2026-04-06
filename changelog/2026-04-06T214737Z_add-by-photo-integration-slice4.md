# Add-by-Photo Collection Photo Integration (Slice 4)

**Date:** 2026-04-06
**Time:** 21:47:37 UTC
**Type:** Feature
**Phase:** 1.6
**Version:** v0.16.0

## Summary

Final slice of Phase 1.6 (Collection Item Photos). When a user identifies a toy via the
Add-by-Photo ML flow and clicks "Add", the resulting Add to Collection dialog now offers two
checkboxes for handling the scanned photo: save it to the new collection item, and optionally
contribute it to the shared catalog. The dialog chains create → upload → contribute in a single
submit, with isolated failure handling so a photo upload error never rolls back a successful item
creation.

---

## Changes Implemented

### 1. `usePhotoIdentify` — Expose Current File

- Added `getCurrentFile()` returning `fileRef.current` so consumers can access the in-flight scan
  file without restructuring the existing ref-based state machine
- No behavioral change to identify/altMode/reset paths

### 2. `AddByPhotoSheet` + `PredictionCard` — Thread File Through

- `AddByPhotoSheet` reads `getCurrentFile()` and passes it to each `PredictionCard`
- `PredictionCard` accepts a new optional `photoFile?: File` prop and forwards it to
  `AddToCollectionDialog`
- No-op when not in the Add-by-Photo flow (e.g., catalog item page entry point)

### 3. `AddToCollectionDialog` — Photo Options Section

- New optional `photoFile?: File` prop. When present, renders a "Photo Options" section below
  the existing condition/notes fields with:
  - 48×48 thumbnail preview (via `URL.createObjectURL`, cleaned up on unmount)
  - Filename and human-readable file size
  - "Save this photo to your collection item" checkbox (default: checked)
  - "Contribute this photo to the catalog" checkbox (default: unchecked, hidden when save is
    unchecked)
  - Inline condensed disclaimer that appears only when contribute is checked
- Submit chain:
  1. `mutations.add.mutate(...)` creates the collection item
  2. On success, success toast + (if no photo) close immediately
  3. Otherwise IIFE: `uploadCollectionPhoto(newId, file)` → optional
     `contributeCollectionPhoto(newId, photoId, '1.0')`
  4. Each step has its own try/catch — failures show targeted toasts but the dialog still closes
     in `finally` because the item was already created
- New local state: `savePhoto`, `contributePhoto`, `isChaining`. All reset on dialog reopen.
- `isPending` derives from `mutations.add.isPending || isChaining` and disables every control
  through all three async stages

### 4. Tests

- New `AddToCollectionDialog.test.tsx` with 11 unit tests covering:
  - Photo Options section visibility (with/without `photoFile`)
  - Default checkbox state (save checked, contribute unchecked)
  - Photo preview rendering with formatted size
  - Hiding contribute checkbox when save is unchecked
  - Conditional inline disclaimer display
  - Item-only path (no photo)
  - Upload-only path (save checked, contribute unchecked)
  - Full chain (save + contribute, both succeed)
  - Save unchecked skips upload entirely
  - Upload failure: error toast fires, dialog still closes
  - Contribute failure: error toast fires, upload result preserved
- All 11 new tests pass; existing `AddByPhotoSheet` tests still pass

## Decisions Made

- **Approach C — inline chain, direct API calls**: Rejected extracting a `useAddByPhotoFlow` hook
  (premature abstraction with one caller) and rejected using `useCollectionPhotoMutations`
  (parameterized by collection item ID at hook-call time, which we don't have until `add` resolves)
- **Partial-failure UX**: Item creation is the commit point. Upload and contribute are best-effort
  with their own toasts. The user keeps their item even if the photo step fails — surprising
  rollback would lose data
- **`onSuccess` callback signature unchanged**: Issue spec suggested adding `(collectionItemId)`
  but no existing caller needs the ID. Avoided cascading signature changes across `PredictionCard`,
  `CollectionPage`, etc. until a caller actually needs it
- **Telemetry**: Reused existing `prediction_accepted` event. Contribution telemetry is captured
  server-side via `photo_contributions` rows; a separate ML event would be redundant

## Files Modified

- `web/src/collection/hooks/usePhotoIdentify.ts` — added `getCurrentFile()`
- `web/src/collection/components/AddByPhotoSheet.tsx` — passes file to PredictionCard
- `web/src/collection/components/PredictionCard.tsx` — new `photoFile?: File` prop
- `web/src/collection/components/AddToCollectionDialog.tsx` — photo checkboxes + chained submit
- `web/src/collection/components/__tests__/AddToCollectionDialog.test.tsx` — new file (11 tests)

## Verification

- `npm run typecheck` ✅
- `npm run lint` ✅
- `npx vitest run AddToCollectionDialog.test.tsx` ✅ (11/11)
- `npx vitest run AddByPhotoSheet.test.tsx` ✅ (4/4 — no regressions)

## Next Steps

- E2E test for the happy-path "save + contribute" flow (deferred — matches Slices 1-3 deferral)
- Phase 1.6 epic #136 can now be marked complete pending PR merge
- Phase 2.0 (iOS) or Phase 1.12 (GDPR account deletion) are the remaining roadmap candidates
