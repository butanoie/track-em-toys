# Collection Item Photos + Catalog Contribution — Phase 1.6

## Problem

Users can catalog their toy collections but cannot attach their own photos. The existing photo system (Phase 1.9) is curator-managed catalog photos — shared reference images visible to all users. Collectors need private, per-item photos of their own physical copies (condition documentation, display shots, etc.).

Additionally, user-contributed photos could feed back into the shared catalog and ML training pipeline, but this requires licensing disclaimers and curator approval.

## Scope

Four slices, delivered as an epic with sub-issues:

1. **DB + API for collection item photos** — Migration, RLS-protected table, CRUD endpoints
2. **Web UI for collection photos** — Photo management sheet, gallery integration in collection views
3. **Contribution flow** — "Contribute to catalog" action with licensing disclaimers, pending approval
4. **Add-by-Photo integration** — Save/contribute checkboxes in AddToCollectionDialog when opened from ML scan

## Architecture Decisions

### Two Photo Tables, One Storage Root

Collection photos use a **separate table** (`collection_item_photos`) with RLS, parallel to the existing `item_photos` (no RLS). Both tables share `PHOTO_STORAGE_PATH` but use distinct directory layouts:

```
PHOTO_STORAGE_PATH/
  {itemId}/                          # Catalog photos (existing)
    {photoId}-thumb.webp
    {photoId}-original.webp
  collection/                        # Collection photos (new)
    {userId}/
      {collectionItemId}/
        {photoId}-thumb.webp
        {photoId}-original.webp
```

**Rationale:** User-scoped directories prevent cross-user enumeration at the filesystem level. The `collection/` prefix cleanly separates private from shared content. No new environment variable needed.

### Contribution = File Copy, Not Link

When a user contributes a collection photo to the catalog, the files are **copied** (not symlinked or hardlinked) to the catalog directory. This decouples lifecycles — a user deleting their collection photo doesn't break the catalog copy, and catalog photos may be served from a CDN with different access controls.

### GDPR: Delete User Data, Keep Licensed Content + Audit Trail

When `gdprPurgeUser()` runs:

1. **Switch RLS context** to target user (`set_config('app.user_id', $targetId, true)`) — both `collection_item_photos` and `collection_items` have `FORCE ROW LEVEL SECURITY`, so the admin's context cannot access them
2. **Delete collection item photos** — hard-delete all `collection_item_photos` rows for the user. `ON DELETE SET NULL` on `photo_contributions.collection_item_photo_id` preserves audit records
3. **Delete collection items** — hard-delete all `collection_items` rows for the user (FK children already removed in step 2)
4. **Scrub catalog photo attribution** — `UPDATE item_photos SET uploaded_by = NULL` for contributed photos (column is already nullable)
5. **Delete photo files** — after transaction commits, `rm -rf PHOTO_STORAGE_PATH/collection/{userId}/` (best-effort, log failures)

**What survives:**
- `photo_contributions` rows (audit trail) — `collection_item_photo_id = NULL`, `contributed_by` → tombstone user, `item_photo_id` → surviving catalog photo, `consent_version` preserved
- Contributed catalog photos (`item_photos` rows + files) — user granted a perpetual license; photo content (a toy) is not PII
- `users` tombstone row — PII scrubbed, FKs intact

**What is deleted:**
- All `collection_item_photos` rows and files
- All `collection_items` rows
- `uploaded_by` attribution on catalog photos (set to NULL)

### Contributions Require Curator Approval

Contributed photos enter `item_photos` with `status: 'pending'`. Curators approve or reject via the existing `PhotoManagementSheet`. No new curator UI is needed — pending photos already appear in the management interface.

### Add-by-Photo UX: Inline Checkboxes

When `AddToCollectionDialog` receives a `photoFile` prop (from the ML scan flow), it shows two checkboxes below the condition/notes fields — keeping the flow single-step rather than a multi-step wizard. This minimizes friction for the most common case.

## Database Schema

### New Table: `collection_item_photos` (Migration 036)

```sql
CREATE TABLE public.collection_item_photos (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_item_id  UUID            NOT NULL REFERENCES public.collection_items(id) ON DELETE RESTRICT,
    user_id             UUID            NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    url                 TEXT            NOT NULL,
    caption             TEXT,
    is_primary          BOOLEAN         NOT NULL DEFAULT false,
    sort_order          INTEGER         NOT NULL DEFAULT 0,
    dhash               TEXT            NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- RLS: ENABLE + FORCE, 4 policies using (SELECT current_app_user_id())
-- Indexes: (collection_item_id, sort_order), partial unique on (collection_item_id) WHERE is_primary
-- Trigger: update_updated_at
```

`user_id` is denormalized from `collection_items` because RLS policies evaluate per-row — a JOIN inside the policy expression would be expensive.

### New Table: `photo_contributions` (Migration 036, same file)

```sql
CREATE TABLE public.photo_contributions (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_item_photo_id    UUID        REFERENCES public.collection_item_photos(id) ON DELETE SET NULL,
    item_photo_id               UUID        REFERENCES public.item_photos(id) ON DELETE SET NULL,
    contributed_by              UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    item_id                     UUID        NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
    consent_version             TEXT        NOT NULL,
    consent_granted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    file_copied                 BOOLEAN     NOT NULL DEFAULT false,
    status                      TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS (shared application data, like item_photos)
-- Unique index: (collection_item_photo_id) WHERE status != 'revoked'
-- Indexes: (contributed_by), (item_id, status)
```

**Note:** `item_photos.uploaded_by` is already nullable (migration 011). No ALTER needed.

## API Routes

All under `/collection/:id/photos`, registered as a sub-plugin of `collectionRoutes`.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/collection/:id/photos` | Upload photos (multipart, max 10 files) |
| GET | `/collection/:id/photos` | List photos for a collection item |
| PATCH | `/collection/:id/photos/reorder` | Reorder photos |
| PATCH | `/collection/:id/photos/:photoId/primary` | Set primary photo |
| DELETE | `/collection/:id/photos/:photoId` | Hard-delete a photo |
| POST | `/collection/:id/photos/:photoId/contribute` | Contribute to catalog |
| DELETE | `/collection/:id/photos/:photoId/contribution` | Revoke contribution |

Auth: `[fastify.authenticate, fastify.requireRole('user')]` — all authenticated users, RLS enforces ownership.

### Content-Type Hook Update

The `collectionRoutes` preValidation hook (line 162-169 of `api/src/collection/routes.ts`) currently rejects non-JSON content types. Must be updated to also accept `multipart/form-data` for photo upload routes.

### Contribution Endpoint Flow

1. Verify collection item + photo via RLS (ownership enforced by policy)
2. Validate `consent_acknowledged === true` and `consent_version`
3. Check no active contribution exists (unique index also enforces)
4. Look up `collection_items.item_id` for catalog target
5. Insert `photo_contributions` row (`status: 'pending'`, `file_copied: false`)
6. Copy files from collection path to catalog path with new photo ID
7. Reuse existing dhash (already computed on upload)
8. Insert `item_photos` row with `status: 'pending'`, `uploaded_by: user.sub`
9. Update `photo_contributions` with `item_photo_id` and `file_copied: true`

## Web UI Design

### CollectionPhotoSheet

Mirrors `PhotoManagementSheet` (right panel Sheet, `sm:max-w-3xl`) with collection-scoped props. Composes existing `DropZone`, `UploadQueue`, and an extended `PhotoGrid`.

**Extended photo tile actions:**
- Star (set primary) — top-left, same as catalog
- Contribute (Share2 icon) — bottom-left, gradient overlay, same opacity transition as delete
- Delete (Trash2 icon) — bottom-right
- "Contributed" badge — replaces contribute action when already contributed (`bg-amber-600/80 text-white text-[10px]`, same pattern as primary badge)

### ContributeDialog

Modal `Dialog` (`sm:max-w-md`) with:
- Photo thumbnail preview (max-h-48, object-contain)
- Disclaimer text in a subtle boxed callout (`bg-muted/50 border border-border p-3`)
- Checkbox: "I confirm I have the right to share this photo" (requires Shadcn Checkbox install)
- Submit button: amber accent, disabled until checkbox checked

Consent version tracked as `'1.0'` — bumped when disclaimer text changes.

### AddToCollectionDialog Enhancements

When `photoFile?: File` prop is provided (from Add-by-Photo ML flow):
- Labeled divider: "Photo Options" with horizontal rule
- Photo preview row: 48x48 thumbnail + filename + file size
- Checkbox: "Save this photo to your collection item" (default: checked)
- Checkbox: "Contribute this photo to the catalog" (default: unchecked)
- When contribute is checked, condensed disclaimer text expands below

Submit chains: (1) create collection item, (2) upload photo if checked, (3) contribute if checked.

### Collection Item Integration

- **CollectionItemCard** (grid): Primary collection photo takes priority over catalog thumbnail. New Camera button in action row opens CollectionPhotoSheet. Photo count badge when count > 0.
- **CollectionTable** (table): Same thumbnail priority logic. Camera icon in actions column.
- API response gains `collection_photo_url: string | null` and `collection_photo_count: number` from LEFT JOIN.

## Reused Modules

| Module | Reuse Type |
|--------|-----------|
| `api/src/catalog/photos/thumbnails.ts` | Direct import (processUpload, DimensionError) |
| `api/src/catalog/photos/dhash.ts` | Direct import (computeDHash, hammingDistance) |
| `api/src/catalog/photos/storage.ts` | Import ensureDir, writePhoto; new collection-scoped path functions |
| `web/src/catalog/photos/DropZone.tsx` | Direct use (generic, no domain coupling) |
| `web/src/catalog/photos/UploadQueue.tsx` | Direct use |
| `web/src/lib/photo-url.ts` | Direct use (buildPhotoUrl works with any relative URL) |

## New Files

### API
- `api/db/migrations/036_collection_item_photos.sql`
- `api/src/collection/photos/routes.ts`
- `api/src/collection/photos/queries.ts`
- `api/src/collection/photos/schemas.ts`
- `api/src/collection/photos/storage.ts`
- `api/src/collection/photos/routes.test.ts`

### Web
- `web/src/collection/photos/CollectionPhotoSheet.tsx`
- `web/src/collection/photos/ContributeDialog.tsx`
- `web/src/collection/photos/api.ts`
- `web/src/collection/photos/useCollectionPhotoUpload.ts`
- `web/src/collection/photos/useCollectionPhotoMutations.ts`

## Photo Limits

- Max photos per collection item: **10**
- Max per upload request: **10**
- Max file size: **10 MB** (reuses `config.photos.maxSizeMb`)
- Min dimension: **600px** shortest edge (reuses `processUpload` validation)

## Dependencies

- Shadcn Checkbox component: `npx shadcn@latest add checkbox` (not yet installed)
- No new npm packages required

## Status

- **Phase:** Architecture reviewed (3 passes, all medium+ resolved), documentation gate passed
- **Epic issue:** #136 (sub-issues #137–#140)
- **Depends on:** Phase 1.8 Slice 1 (collection items) ✅, Phase 1.9 (catalog photos) ✅

## Architecture Review Notes

Findings from the 3-pass architecture audit (see conversation for full details):

1. **`item_photos.uploaded_by` already nullable** — migration 011 has no NOT NULL constraint. Removed unnecessary ALTER from migration.
2. **GDPR RLS context mismatch** (HIGH) — `collection_item_photos` has FORCE RLS. Admin GDPR purge runs with admin's `app.user_id`, which can't see target user's rows. Resolved: temporarily switch RLS context via `set_config('app.user_id', $targetId, true)` inside `gdprPurgeUser`. Safe because subsequent operations touch only non-RLS tables.
3. **`photo_contributions.collection_item_photo_id` FK conflict** (MEDIUM) — Changed from `NOT NULL ... ON DELETE RESTRICT` to nullable `ON DELETE SET NULL`. GDPR deletes collection photos; contribution audit records survive with NULL source reference.
4. **GDPR must also delete `collection_items`** — user data, not audit trail. FK ordering: delete photos first, then items.
5. **Contribute handler cleanup** — try/catch with best-effort file deletion if `item_photos` insert fails after catalog file copy (matches catalog upload pattern).
