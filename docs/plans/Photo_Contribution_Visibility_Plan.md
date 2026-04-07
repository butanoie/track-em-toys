# Photo Contribution Visibility (Training vs Catalog) — Phase 1.6 Amendment

## Problem

Phase 1.6 shipped a contribution flow that treats every contributed photo as both
catalog-bound AND training-bound. There is no way for a contributor to say "use this
photo for ML training only, but don't display it in the public catalog." This is a missed
requirement: many contributors will be willing to help train the model with photos they
do **not** want shown publicly (e.g., partial PII visible in the background, photos
they're not proud of aesthetically, etc.).

This amendment adds **contributor intent** to the contribution flow. Each contribution
declares one of two intents:

- **`training_only`** — used for ML training only, never shown in the public catalog
- **`catalog_and_training`** — shown in the catalog AND used for ML training

The intent is captured at consent time, locked into the audit trail, and drives whether
the resulting `item_photos` row is publicly visible.

## Why This Is a Phase 1.6 Amendment

The contribution flow is owned by Phase 1.6 (#136). The Phase 1.9b approval dashboard
(#72) needs to **read** the visibility/intent fields, but the data model + UI for setting
them belongs to the contribution flow itself. Mixing them into the dashboard PR would:

- Conflate two independent concerns (contribution UX vs curator UX)
- Make the dashboard PR ~30% larger and harder to review
- Hide a Phase 1.6 fix inside an unrelated phase's changelog

This amendment ships **first** as a self-contained PR. The dashboard PR (#72) assumes
the new schema exists and uses it.

## Scope

Single-PR amendment. Covers:

- Migration adding `visibility` to `item_photos` and `intent` to `photo_contributions`
- Backfill all existing rows to `training_only` (privacy-default)
- Updated `POST /collection/:id/photos/:photoId/contribute` API endpoint to accept intent
- Updated `ContributeDialog` with intent radio picker
- Updated `AddToCollectionDialog` (Add-by-Photo) with intent radio (replaces the
  contribute checkbox)
- Updated catalog photo list query to filter `WHERE visibility = 'public'`
- Updated ML training data exporter to include both visibilities
- Unit + integration + E2E tests for the new flow

**Out of scope** (deferred to the dashboard PR or beyond):

- Curator-side review of the intent (Phase 1.9b dashboard PR adds the metadata display
  and the demote-on-approve flow)
- Curator-side promotion `training_only → public` (requires re-consent flow, not
  shipping in v1)
- Bulk re-consent UI for existing contributors (no production users yet, so backfilled
  rows are inert)

## Decisions Locked

| Decision                              | Choice                                                                                                                            | Rationale                                                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default intent for new contributions  | `training_only`                                                                                                                   | Privacy + editorial defaults — the catalog is curated, and `catalog_and_training` adds public visibility on top of the same training donation (it is a superset, not an alternative) |
| Existing-row backfill                 | `training_only`                                                                                                                   | Consistent with the new default; no production users affected                                                                                                                        |
| Curator override capability           | Demote only (`public → training_only`); no promote                                                                                | Demote is a strict subset of contributor consent; promote requires re-consent                                                                                                        |
| Where intent is stored                | `photo_contributions.intent` (immutable audit) + `item_photos.visibility` (mutable curator-controlled)                            | Separates "what the contributor wanted" from "what the catalog actually shows"                                                                                                       |
| `ContributeDialog` consent model      | Explicit checkbox, required before submit (unchanged)                                                                             | Deliberate single-action consent moment                                                                                                                                              |
| `AddToCollectionDialog` consent model | Implicit in "Add to Collection" click; condensed inline disclaimer shown when intent ≠ `'none'` (unchanged from current behavior) | Consent is bundled with a broader action; the condensed disclaimer is notice enough                                                                                                  |
| `CONSENT_VERSION`                     | Stays at `'1.0'`                                                                                                                  | Pre-launch, no production users; the license grant text is unchanged (only the display-surface choice is new), so no audit boundary is needed                                        |

## Database — Migration 037

```sql
-- 037_photo_contribution_visibility.sql

-- Visibility on item_photos: controls public catalog inclusion
ALTER TABLE item_photos
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'training_only'));

-- Intent on photo_contributions: locked-in contributor consent
ALTER TABLE photo_contributions
  ADD COLUMN intent TEXT NOT NULL DEFAULT 'training_only'
    CHECK (intent IN ('training_only', 'catalog_and_training'));

-- Backfill: existing item_photos rows that came via a contribution → training_only
UPDATE item_photos ip
  SET visibility = 'training_only'
  FROM photo_contributions pc
  WHERE pc.item_photo_id = ip.id;

-- Backfill: existing photo_contributions rows → training_only (already the new default,
-- but explicit for clarity)
UPDATE photo_contributions
  SET intent = 'training_only';

-- Index for the catalog list query
CREATE INDEX idx_item_photos_public_approved
  ON item_photos (item_id, sort_order)
  WHERE visibility = 'public' AND status = 'approved';
```

**Notes on the backfill:**

- Direct curator uploads (no `photo_contributions` row) keep the new default `'public'`,
  preserving existing behavior for catalog photos uploaded via the curator UI
- All rows that came via a contribution are downgraded to `training_only`, even if
  previously `'approved'` and visible in the catalog. This is the correct privacy default
  per Q2; no production users exist yet so the practical impact is zero
- The `item_photos.status` defaults stay unchanged (migration 023's `'approved'` default)

## API Endpoint

### `POST /collection/:id/photos/:photoId/contribute` (modified)

Body gains `intent`:

```typescript
{
  consent_version: string;
  consent_acknowledged: boolean;
  intent: 'training_only' | 'catalog_and_training'; // NEW, required
}
```

**Validation:**

- `intent` is **required** (no server-side default — the contributor must have made an
  explicit choice in the UI)
- Existing validation for `consent_acknowledged === true` and `consent_version` unchanged

**Behavior:**

- Stores `intent` on the new `photo_contributions` row
- Sets `item_photos.visibility = 'training_only'` if `intent === 'training_only'`,
  else `'public'`
- All other contribute logic (file copy, dhash reuse, status='pending') unchanged

**Response shape:** unchanged (`{ contribution_id }`).

## Web UI Changes

### `ContributeDialog` (web/src/collection/photos/ContributeDialog.tsx)

Adds an **intent radio picker** between the photo preview and the consent checkbox:

```
┌─────────────────────────────────────┐
│  [photo preview]                    │
│                                     │
│  How should this photo be used?     │
│  ◉ Training only                    │   ← default selected
│    Used to train the ML model.      │
│    Not shown in the public catalog. │
│                                     │
│  ◯ Catalog + Training               │
│    Visible in the public catalog    │
│    AND used for ML training.        │
│                                     │
│  [licensing disclaimer callout]     │
│                                     │
│  ☐ I confirm I have the right…      │
│                                     │
│  [Cancel]   [Contribute to Catalog] │   ← button label adapts to intent
└─────────────────────────────────────┘
```

- Default selection: `'training_only'`. Rationale (same as `AddToCollectionDialog`): the
  catalog is deliberately curated — `catalog_and_training` adds public catalog visibility
  on top of the same training donation, it is not an alternative to it. Defaulting to
  `training_only` keeps the curated surface lean while still contributing to the model.
- **Dialog title** is softened from "Contribute Photo to Catalog" to "**Contribute Photo**"
  (no "to Catalog") — the dialog no longer has a single implied destination, so the title
  must be neutral. The E2E spec at `web/e2e/collection-photos.spec.ts:181` matches on
  `/Contribute Photo to Catalog/` and must be updated.
- **Dialog description** is softened from "Share this photo with the Track'em Toys
  community." to "**Contribute this photo to Track'em Toys**" — the word "community"
  implies a public/social surface, which is misleading for the `training_only` path.
- Submit button label is dynamic: `"Contribute to Catalog"` when intent is
  `catalog_and_training`, `"Contribute to Training"` when `training_only`.
- The licensing disclaimer text is **identical** for both intents — the underlying license
  grant is the same regardless of intent. Only which surface(s) display the photo differs.
- **Component seam:** `ContributeDialog` holds intent as internal state (default
  `'training_only'`, reset on open via `useEffect`). The `onConfirm` callback signature
  changes from `() => void` to `(intent: ContributeIntent) => void`. The parent
  (`CollectionPhotoSheet`) reads the intent argument and passes it to
  `contributeMutation.mutate({ photoId, intent })`. This preserves the existing
  "dialog collects consent, parent owns the mutation" separation.
- **`useCollectionPhotoMutations` variables type:** the contribute mutation's variables
  change from `string` (just `photoId`) to `{ photoId: string; intent: ContributeIntent }`.

### `AddToCollectionDialog` (web/src/collection/components/AddToCollectionDialog.tsx)

The current "Contribute this photo to the catalog" checkbox is **replaced** with a 3-state
radio inside the Photo Options section:

```
Photo Options
─────────────────────────────────────
[ photo preview ] filename
                  size

☑ Save this photo to your collection item

When save is checked:
  How should this photo be shared?
  ◯ Don't contribute
  ◉ Training only                 ← default
  ◯ Catalog + training

  [conditional inline disclaimer when not "Don't contribute"]
```

- **Default = `training_only`.** Rationale: the catalog is deliberately curated (quality
  over quantity). Every contributed photo trains the model regardless of intent —
  `catalog_and_training` is a **superset** of `training_only` that adds public catalog
  visibility on top of the same training donation, not a separate "catalog only" surface.
  Defaulting to `training_only` steers users toward contributing training data without
  flooding the curated public gallery. Catalog contributions are only wanted for items
  that have zero or few existing photos. See also the standalone `ContributeDialog`
  default (`training_only`) for the same reason.
- The "Don't contribute" option replaces the current default-unchecked checkbox state,
  but it is no longer the default — users who don't want to contribute must pick it
  explicitly.
- `'none'` is a **client-side sentinel only** — when the user keeps "Don't contribute"
  selected, the contribute API is not called at all. The API's `intent` field remains
  strictly `'training_only' | 'catalog_and_training'`; the server never sees `'none'`.
- Unchecking "Save this photo" hides the intent radio and resets `contributeIntent` back
  to the default (`training_only`).
- Selecting either contribute option expands the inline disclaimer (same text as
  ContributeDialog's callout but condensed).
- Submit logic in the dialog's chained mutation branches on
  `contributeIntent !== 'none'`.

## Catalog Photo List Query — Filter Update

### `api/src/catalog/photos/queries.ts` — `listPhotos()`

Add `AND visibility = 'public'` to the existing filter:

```sql
SELECT id, url, caption, is_primary, sort_order
FROM item_photos
WHERE item_id = $1
  AND status = 'approved'
  AND visibility = 'public'           -- NEW
ORDER BY is_primary DESC, sort_order ASC
```

This is the only change to the public catalog query path. Training-only photos never
appear in:

- The catalog item detail page photo gallery
- The lightbox
- The collection page thumbnails (which COALESCE catalog primary photos)
- The Search results

They DO appear in:

- The ML training data exporter (filters `status='approved'` only, no visibility filter)
- The curator approval dashboard (Phase 1.9b — sees all pending regardless of visibility)
- The contributor's own collection photo sheet (private, RLS-protected, unaffected)

## ML Training Data Exporter Update

The Phase 4.0 training data exporter currently filters `WHERE status = 'approved'`. No
change needed to its filter — it already includes all approved photos regardless of
visibility. **However**, the exporter must NOT add a `visibility = 'public'` filter when
it's eventually enhanced. Add a comment to that effect in the relevant query file
(`ml/data-prep/` or wherever the exporter lives) so future maintainers don't "tighten" it.

## Test Plan

| Layer           | Coverage                                                                                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API unit        | Migration backfill correctness, intent validation in contribute endpoint, visibility derivation logic                                                                                                                                                                             |
| API integration | Contribute with `training_only` → catalog list does NOT include the photo after approval; contribute with `catalog_and_training` → catalog list DOES include after approval; backfill verification (existing pending contributions have `intent='training_only'` after migration) |
| Web unit        | `ContributeDialog` intent radio + dynamic button label; `AddToCollectionDialog` 3-state radio + chained mutation correctly passes intent                                                                                                                                          |
| E2E             | Contributor selects training-only → photo never appears in catalog; contributor selects catalog+training → photo appears in catalog after approval                                                                                                                                |

Test scenarios in `docs/test-scenarios/E2E_COLLECTION_PHOTOS.md` (existing file, append
new "Contribution Intent" section).

## Files Modified / Created

### New

- `api/db/migrations/037_photo_contribution_visibility.sql` — migration with ALTER + backfill + partial index
- `api/src/catalog/ml-export/queries.test.ts` — regression guards asserting `PHOTO_JOIN` contains `status='approved'`, does NOT contain `visibility`, and uses `LEFT JOIN`. Locks in the "training_only photos must flow into training data" invariant so a future edit adding `AND visibility='public'` to the JOIN fails loudly
- `web/src/collection/photos/consent.ts` — shared module exporting `CONSENT_VERSION`, `DEFAULT_CONTRIBUTE_INTENT`, and `LICENSE_GRANT_TEXT`. Both `ContributeDialog` and `AddToCollectionDialog` import from here so the privacy default and the verbatim license grant sentence can never drift between surfaces
- `web/src/components/ui/radio-group.tsx` — Shadcn-generated (via `npx shadcn@latest add radio-group`), with the standard `cn` import path fix

### Modified

- `api/src/collection/photos/routes.ts` — contribute endpoint accepts `intent`; derives `visibility` from intent (`catalog_and_training → 'public'`, `training_only → 'training_only'`); passes visibility to `insertPendingCatalogPhoto`
- `api/src/collection/photos/queries.ts` — `insertContribution` accepts `intent`; **`insertPendingCatalogPhoto` now REQUIRES a `visibility` parameter and includes it in the INSERT column list** (the DB default is `'public'` which is the wrong default for contributed photos — this fixes a latent bug that would have silently made every contribution publicly visible)
- `api/src/collection/photos/schemas.ts` — `intent` added to `contributePhotoSchema.body.required` and `properties` (enum)
- `api/src/catalog/photos/queries.ts` — `listPhotos()` adds `AND visibility = 'public'` filter; comment references the partial index `idx_item_photos_public_approved`
- `api/src/catalog/ml-export/queries.ts` — `PHOTO_JOIN` is now `export`ed (for the regression test) with a long-form comment warning maintainers not to add a visibility filter
- `web/src/collection/photos/ContributeDialog.tsx` — intent radio (default `training_only`), dynamic button label ("Contribute to Training" vs "Contribute to Catalog"), softened dialog title ("Contribute Photo"), softened description ("Contribute this photo to Track'em Toys"), `onConfirm` signature changed from `() => void` to `(intent: ContributeIntent) => void`. Imports `DEFAULT_CONTRIBUTE_INTENT` and `LICENSE_GRANT_TEXT` from `consent.ts`
- `web/src/collection/photos/CollectionPhotoSheet.tsx` — `handleConfirmContribute` now receives the intent arg from the dialog and passes it to `contributeMutation.mutate({ photoId, intent })`
- `web/src/collection/photos/useCollectionPhotoMutations.ts` — `contributeMutation` variables type changed from `string` to `{ photoId: string; intent: ContributeIntent }`. `CONSENT_VERSION` no longer defined here — imported from `consent.ts`
- `web/src/collection/photos/api.ts` — `contributeCollectionPhoto` takes an `intent` 4th param, includes it in the JSON body
- `web/src/collection/components/AddToCollectionDialog.tsx` — replaces the old `contributePhoto: boolean` state with `contributeIntent: 'none' | ContributeIntent` (3-state radio). Default is `'training_only'`. Toggling "Save this photo" off hides the radio and resets intent. `'none'` is a **client-side sentinel** — when selected, the contribute API is not called at all. Imports `CONSENT_VERSION`, `DEFAULT_CONTRIBUTE_INTENT`, and `LICENSE_GRANT_TEXT` from `consent.ts`. The condensed inline disclaimer interpolates `LICENSE_GRANT_TEXT` instead of hard-coding the sentence
- `web/src/lib/zod-schemas.ts` — adds `ContributeIntentSchema = z.enum(['training_only', 'catalog_and_training'])` and exports `type ContributeIntent = z.infer<...>`. Used for UI state typing, mutation variables, and `api.ts` parameter types. The request body itself stays constructed inline (matches the existing pattern — no other endpoint validates outgoing request bodies with Zod)
- `web/package.json` + `package-lock.json` — adds `@radix-ui/react-radio-group` dependency
- `docs/test-scenarios/E2E_COLLECTION_PHOTOS.md` — appends "Contribution Intent" section (18 new Gherkin scenarios across `ContributeDialog`, `AddToCollectionDialog`, and server-side derivation)
- `.claude/rules/web-components.md` — photo-domain section updated: documents the new intent radio + tri-state client sentinel, the shared `consent.ts` module, the server-side visibility derivation pattern, and the ML exporter no-filter rule
- Existing tests updated: `api/src/collection/photos/routes.test.ts` (8 contribute tests, including 2 new intent-derivation assertions), `web/src/collection/photos/__tests__/ContributeDialog.test.tsx` (13 tests covering intent radio, dynamic label, `onConfirm(intent)` signature), `web/src/collection/components/__tests__/AddToCollectionDialog.test.tsx` (14 tests covering the 3-state radio, default intent, hide-on-save-off reset), `web/e2e/collection-photos.spec.ts` (adds a new training_only-default scenario, updates dialog title + button matchers), `web/e2e/add-by-photo.spec.ts` (5 photo-options-integration tests rewritten for the radio, adds a "Catalog + training" path test)

## Dependencies on Other Work

This amendment must ship **before** the Photo Approval Dashboard (#72), because the
dashboard plan assumes:

- `photo_contributions.intent` exists for the metadata panel display
- `item_photos.visibility` exists for the demote-on-approve flow
- The catalog list query already filters `visibility = 'public'`

After this PR merges, the dashboard plan's migration is renumbered from 037 to 038, and
the dashboard PR can assume the new fields are queryable.

## Risks

- **R1 — Backfill silently downgrades existing approved catalog photos.** Acceptable
  because zero production users have contributed photos at this point in the project.
  Documented in the changelog so post-launch contributors don't hit a surprise.
- **R2 — Migration is non-reversible without a separate down migration.** Standard for
  this codebase; the amendment doesn't introduce new precedent.
- **R3 — The 3-state radio in `AddToCollectionDialog` is a breaking change to the prop
  shape**. The previous `contributePhoto: boolean` becomes `contributeIntent: 'none' |
'training_only' | 'catalog_and_training'`. Internal-only component, no consumers
  outside the file.

## Out-of-Scope Followups

- **Bulk re-consent UI for existing contributors**: not needed (no production users)
- **Curator-side promotion UX**: requires a re-consent flow (notification to contributor,
  pending acceptance, etc.). Not planned for v1.
- **Per-image visibility on uploaded catalog photos**: curators uploading directly via
  the existing curator photo flow always get `visibility='public'`. If curators want to
  upload training-only catalog photos, that's a separate enhancement.
