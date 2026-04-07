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

| Decision | Choice | Rationale |
|---|---|---|
| Default intent for new contributions | `training_only` | Privacy by default — contributor opts in to public catalog |
| Existing-row backfill | `training_only` | Consistent with the new default; no production users affected |
| Curator override capability | Demote only (`public → training_only`); no promote | Demote is a strict subset of contributor consent; promote requires re-consent |
| Where intent is stored | `photo_contributions.intent` (immutable audit) + `item_photos.visibility` (mutable curator-controlled) | Separates "what the contributor wanted" from "what the catalog actually shows" |

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
  intent: 'training_only' | 'catalog_and_training';  // NEW, required
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

- Default selection: `'training_only'` (privacy default)
- Submit button label is dynamic: `"Contribute to Catalog"` when intent is
  `catalog_and_training`, `"Contribute to Training"` when `training_only`
- The licensing disclaimer text is **identical** for both intents (the underlying license
  grant is the same — only the display surface differs)

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
  ◉ Don't contribute              ← default
  ◯ Training only
  ◯ Catalog + training

  [conditional inline disclaimer when not "Don't contribute"]
```

- The "Don't contribute" option replaces the current default-unchecked state
- Selecting either contribute option expands the inline disclaimer (same text as
  ContributeDialog's callout but condensed)
- Submit logic in the dialog's chained mutation chain branches on the intent value

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

| Layer | Coverage |
|---|---|
| API unit | Migration backfill correctness, intent validation in contribute endpoint, visibility derivation logic |
| API integration | Contribute with `training_only` → catalog list does NOT include the photo after approval; contribute with `catalog_and_training` → catalog list DOES include after approval; backfill verification (existing pending contributions have `intent='training_only'` after migration) |
| Web unit | `ContributeDialog` intent radio + dynamic button label; `AddToCollectionDialog` 3-state radio + chained mutation correctly passes intent |
| E2E | Contributor selects training-only → photo never appears in catalog; contributor selects catalog+training → photo appears in catalog after approval |

Test scenarios in `docs/test-scenarios/E2E_COLLECTION_PHOTOS.md` (existing file, append
new "Contribution Intent" section).

## Files Modified / Created

### New
- `api/db/migrations/037_photo_contribution_visibility.sql`

### Modified
- `api/src/collection/photos/routes.ts` — contribute endpoint accepts `intent`
- `api/src/collection/photos/queries.ts` — `insertPendingCatalogPhoto` derives visibility
- `api/src/collection/photos/schemas.ts` — add `intent` to ContributeBody
- `api/src/catalog/photos/queries.ts` — `listPhotos` filters `visibility = 'public'`
- `web/src/collection/photos/ContributeDialog.tsx` — add intent radio
- `web/src/collection/photos/api.ts` — pass intent to contribute call
- `web/src/collection/photos/useCollectionPhotoMutations.ts` — accept intent parameter
- `web/src/collection/components/AddToCollectionDialog.tsx` — replace checkbox with 3-state radio
- `web/src/lib/zod-schemas.ts` — add intent enum to contribute request schema
- `docs/test-scenarios/E2E_COLLECTION_PHOTOS.md` — append "Contribution Intent" section
- Existing tests for `ContributeDialog`, `AddToCollectionDialog`, contribute API

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
