# Phase 1.6 Amendment — Contribution Visibility (training_only vs catalog+training)

**Date:** 2026-04-07
**Time:** 04:44:43 UTC
**Type:** Feature (Phase 1.6 amendment)
**Phase:** 1.6 (Collection Item Photos + Contribution)
**Issue:** [#148](https://github.com/butanoie/track-em-toys/issues/148)
**Plan:** [`docs/plans/Photo_Contribution_Visibility_Plan.md`](../docs/plans/Photo_Contribution_Visibility_Plan.md)

## Summary

Phase 1.6 originally treated every contributed photo as both catalog-bound AND training-bound.
This amendment adds a **contributor intent** choice to every contribution surface: `training_only`
(feeds ML training, hidden from the public catalog) or `catalog_and_training` (the superset —
also displayed in the public catalog). Default is `training_only` because the catalog is
deliberately curated and `catalog_and_training` is additive visibility, not an alternative
training donation.

This amendment is a **hard prerequisite** for the Phase 1.9b Photo Approval Dashboard (#72),
which needs `photo_contributions.intent` and `item_photos.visibility` to drive its metadata
display and demote-on-approve flow.

## Changes Implemented

### Database — Migration 037

- **New column** `item_photos.visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'training_only'))`
- **New column** `photo_contributions.intent TEXT NOT NULL DEFAULT 'training_only' CHECK (intent IN ('training_only', 'catalog_and_training'))`
- **Backfill** downgrades every contributed `item_photos` row to `training_only` (privacy default; zero production users affected)
- **Partial index** `idx_item_photos_public_approved ON item_photos (item_id, sort_order) WHERE visibility = 'public' AND status = 'approved'` — matches the new catalog list query predicate exactly

### API

- **`POST /collection/:id/photos/:photoId/contribute`** — body gains required `intent: 'training_only' | 'catalog_and_training'` field
- **Server-side visibility derivation** — `intent === 'catalog_and_training' ? 'public' : 'training_only'`, computed in the route handler before calling the insert query
- **`insertPendingCatalogPhoto` signature change** — now REQUIRES a `visibility` parameter and includes it in the INSERT column list. This fixes a latent bug: without this change, the DB default (`'public'`) would have silently overridden contributor intent for every new contribution
- **`insertContribution`** accepts `intent` as a 5th parameter, persists it to `photo_contributions.intent`
- **`listPhotos()` catalog query** now filters `AND visibility = 'public'` — training-only photos never appear in the catalog gallery
- **ML export `PHOTO_JOIN` constant** — now `export`ed with a long-form comment warning maintainers NOT to add a visibility filter. A new regression test (`queries.test.ts`) asserts the absence of any `visibility` reference in the join string

### Web UI

- **`ContributeDialog`** — adds an intent radio (default `training_only`), dynamic submit button label ("Contribute to Training" vs "Contribute to Catalog"), neutral dialog title ("Contribute Photo"), softened description ("Contribute this photo to Track'em Toys"). `onConfirm` signature changed from `() => void` to `(intent: ContributeIntent) => void`
- **`AddToCollectionDialog`** — replaces the old `contributePhoto: boolean` checkbox with a 3-state radio: `'none' | 'training_only' | 'catalog_and_training'`. Default is `'training_only'` (meaningful behavior change — users who previously got "save only" by default now contribute training data by default). `'none'` is a **client-side sentinel** — when selected, the contribute API is never called. Toggling "Save this photo" off hides the radio and resets intent to the default
- **Shared `collection/photos/consent.ts` module** — new file exporting `CONSENT_VERSION`, `DEFAULT_CONTRIBUTE_INTENT`, and `LICENSE_GRANT_TEXT`. Both dialogs import these so the privacy default and the verbatim license grant sentence can never drift between surfaces
- **`contributeMutation` variables type** changed from `string` (just `photoId`) to `{ photoId: string; intent: ContributeIntent }`
- **`contributeCollectionPhoto` API client** gains a required 4th `intent` parameter
- **Shadcn `RadioGroup` primitive** installed via `npx shadcn@latest add radio-group` with the standard `cn` import path fix applied silently per the project's post-install conventions

## Technical Details

### Visibility derivation (API route)

```ts
// Intent drives catalog visibility: catalog_and_training → 'public',
// training_only → 'training_only'. catalog_and_training is a superset —
// every contribution trains the model; intent only controls public display.
const visibility = intent === 'catalog_and_training' ? 'public' : 'training_only';
```

### Shared consent constants

```ts
// web/src/collection/photos/consent.ts
export const CONSENT_VERSION = '1.0';
export const DEFAULT_CONTRIBUTE_INTENT: ContributeIntent = 'training_only';
export const LICENSE_GRANT_TEXT =
  "You grant Track'em Toys a perpetual, non-exclusive, royalty-free license to use, display, and modify this photo for catalog and ML training";
```

### Tri-state client sentinel (AddToCollectionDialog)

```ts
type ContributeIntentChoice = 'none' | ContributeIntent;
// Chain gate:
if (contributeIntent !== 'none' && newPhoto) {
  await contributeCollectionPhoto(createdItem.id, newPhoto.id, CONSENT_VERSION, contributeIntent);
}
```

The API contract strictly accepts `'training_only' | 'catalog_and_training'`. The `'none'`
value exists only in the UI radio state and is gated out before any network call.

### Pre-launch decisions (locked in the plan)

- **`CONSENT_VERSION` stays at `'1.0'`** — the license grant itself is unchanged; only the display-surface choice is new. Pre-launch, zero production contributors, no audit boundary needed.
- **Backfill downgrades every existing contribution to `training_only`** — acceptable because zero production users have contributed photos. Documented as R1 in the plan's Risks section.
- **Curator override is "demote only, no promote"** — promoting `training_only → public` requires re-consent, which is out of scope for v1.
- **Consent asymmetry preserved** — `ContributeDialog` keeps its explicit "I confirm" checkbox; `AddToCollectionDialog` keeps implicit consent via the "Add to Collection" button click + condensed inline disclaimer. The asymmetry is justified by the asymmetry in entry context (deliberate vs side-choice).

## Validation & Testing

### API

```
Test Files  45 passed | 1 skipped (46)
     Tests  839 passed | 42 skipped (881)
```

New API tests:
- `routes.test.ts` — 4 new tests (intent=training_only happy path, intent→visibility derivation for training_only, intent→visibility derivation for catalog_and_training, 400 on missing intent, 400 on invalid enum)
- `ml-export/queries.test.ts` — NEW file with 3 regression guards: `PHOTO_JOIN` contains `status='approved'`, does NOT contain `visibility`, uses `LEFT JOIN`. These lock in the "training_only photos must flow into training data" invariant so a future edit adding `AND visibility='public'` to the join fails loudly

### Web

```
Test Files  107 passed (107)
     Tests  797 passed (797)
```

Unit tests updated:
- `ContributeDialog.test.tsx` — 13 tests covering intent radio default, button label switching, consent requirement across both intents, `onConfirm(intent)` signature, reset on reopen, disabled state during pending
- `AddToCollectionDialog.test.tsx` — 14 tests covering 3-state radio, training_only default, hide-on-save-off reset, disclaimer visibility, all three contribute paths (none/training_only/catalog_and_training), partial failure handling

E2E tests (Playwright, user project):
```
25 passed (12.3s)
```

- `collection-photos.spec.ts` — updated the existing contribute test for the new dialog title + button label, added a new scenario for the training_only default path
- `add-by-photo.spec.ts` — rewrote 4 existing photo-options tests for the radio, added a "Catalog + training" path test

### Quality gates

- ✅ API: build, lint, typecheck, prettier, 839 tests passing
- ✅ Web: build, lint, typecheck, prettier, 797 unit tests, 25 E2E tests
- ✅ Migration 037 applied cleanly to the dev DB
- ✅ Audit pass found 12 concerns, 1 HIGH severity (latent `insertPendingCatalogPhoto` visibility-default bug) — all resolved before implementation
- ✅ Quality review found 5 medium issues across 3 reviewers — all fixed (shared constants, shared license text, ml-export regression test, `CONSENT_VERSION` relocation, rules file update)
- ✅ Code simplifier ran 2 passes, rejected 7 candidate simplifications with explicit rationale, concluded no further changes

## Impact Assessment

### Behavior changes visible to end users

1. **Default contribution flow shifts.** Users who scan a photo via Add-by-Photo and click "Add" now contribute the photo as **training data by default**. Previously the photo was saved privately with no contribution. Users who want to keep their photo entirely private must explicitly pick "Don't contribute."
2. **Dialog copy changes.** `ContributeDialog` title changes from "Contribute Photo to Catalog" to "Contribute Photo"; description from "Share this photo with the Track'em Toys community" to "Contribute this photo to Track'em Toys"; button label becomes dynamic ("Contribute to Training" vs "Contribute to Catalog").
3. **Catalog photo gallery excludes training-only photos.** Any contribution that eventually gets approved with `visibility='training_only'` will feed ML training but never appear in the public catalog gallery.

### Backward compatibility

- **Breaking prop change** on `AddToCollectionDialog` internal state shape (`contributePhoto: boolean` → `contributeIntent: 'none' | 'training_only' | 'catalog_and_training'`). Internal-only component, no external consumers.
- Every existing contributed photo gets downgraded to `training_only` by the migration backfill. Since there are zero production contributions, this is a no-op in practice.

### Dependencies unblocked

- **Phase 1.9b Photo Approval Dashboard (#72)** can now proceed. Its plan assumes both new columns exist and that the catalog list query already filters `visibility = 'public'`. After this merges, the dashboard migration renumbers from 037 to 038.

## Related Files

### New
- `api/db/migrations/037_photo_contribution_visibility.sql`
- `api/src/catalog/ml-export/queries.test.ts`
- `web/src/collection/photos/consent.ts`
- `web/src/components/ui/radio-group.tsx`

### Modified (API)
- `api/src/collection/photos/routes.ts`
- `api/src/collection/photos/queries.ts`
- `api/src/collection/photos/schemas.ts`
- `api/src/collection/photos/routes.test.ts`
- `api/src/catalog/photos/queries.ts`
- `api/src/catalog/ml-export/queries.ts`
- `api/db/schema.sql` (auto-regenerated by dbmate)

### Modified (Web)
- `web/src/collection/photos/ContributeDialog.tsx`
- `web/src/collection/photos/CollectionPhotoSheet.tsx`
- `web/src/collection/photos/useCollectionPhotoMutations.ts`
- `web/src/collection/photos/api.ts`
- `web/src/collection/photos/__tests__/ContributeDialog.test.tsx`
- `web/src/collection/components/AddToCollectionDialog.tsx`
- `web/src/collection/components/__tests__/AddToCollectionDialog.test.tsx`
- `web/src/lib/zod-schemas.ts`
- `web/package.json`, `web/package-lock.json` (adds `@radix-ui/react-radio-group`)
- `web/e2e/collection-photos.spec.ts`
- `web/e2e/add-by-photo.spec.ts`
- `web/e2e/fixtures/mock-helpers.ts` (trivial Prettier reflow)

### Modified (Docs)
- `docs/plans/Photo_Contribution_Visibility_Plan.md` — plan refined during implementation (5 Phase-3 decisions + file list updates)
- `docs/plans/Photo_Approval_Dashboard_Plan.md` — added provenance-constraint section documenting that every uploader is either a real user or a GDPR tombstone (no anonymous donors)
- `docs/test-scenarios/E2E_COLLECTION_PHOTOS.md` — appended 18 new Gherkin scenarios under "Contribution Intent"
- `.claude/rules/web-components.md` — photo-domain section updated: new intent radio, tri-state client sentinel, shared `consent.ts` constants, server-side visibility derivation, ML exporter no-filter rule
- `README.md`, `docs/plans/Development_Roadmap_v1_0.md` — phase status updates reflecting 1.6 amendment and 1.9b design-locked state

## Next Steps

After this PR merges:

1. **Phase 1.9b Photo Approval Dashboard (#72)** — implementation can begin. Dashboard migration number bumps from 037 → 038.
2. **Optional follow-up cleanup** noted during code simplification: standardizing all `handleConfirm*` mutation callbacks in `CollectionPhotoSheet` to use `onSettled` for dedup. Out of scope for this amendment; track separately if it becomes worth doing.

## Status

✅ COMPLETE — ready for review and merge. Closes #148 on merge.
