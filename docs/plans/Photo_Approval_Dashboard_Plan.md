# Photo Approval Dashboard — Phase 1.9b

## Problem

Phase 1.6 shipped a contribution flow where users can submit their personal collection
photos to the shared catalog. Each contribution creates a row in `item_photos` with
`status: 'pending'`, awaiting curator approval. There is currently **no UI for curators to
review or act on these pending photos** — they sit in the database with no visibility,
no workflow, and no way to be promoted to `'approved'`.

This dashboard addresses that gap: a curator-facing review interface that surfaces every
pending photo (regardless of source), supports fast approve/reject decisions, and updates
the contribution audit trail atomically.

## Dependency: Phase 1.6 Visibility Amendment

This dashboard plan **requires** the Phase 1.6 amendment (see
[`Photo_Contribution_Visibility_Plan.md`](Photo_Contribution_Visibility_Plan.md)) to ship
first. That amendment adds:

- `item_photos.visibility` (`'public' | 'training_only'`)
- `photo_contributions.intent` (`'training_only' | 'catalog_and_training'`)
- Migration 037

The dashboard plan below uses migration **038** (renumbered from 037) and assumes the
visibility/intent columns already exist. The curator UI surfaces the contributor's intent
and supports a "demote on approve" flow (`public → training_only`) but never promotes.

## Scope

Single-PR feature, not split into slices. Covers:

- DB migration adding rejection-reason columns to `item_photos`
- Three new admin API endpoints (list, decide, count)
- New `/admin/photo-approvals` route with single-image triage UI
- Notification dot on the admin nav link when pending count > 0
- Keyboard-driven workflow (left-hand-only shortcuts)
- Undo-last-decision via Sonner action button
- Unit + integration + E2E tests

**Out of scope** (deferred to follow-ups):

- NSFW auto-moderation (#71 — separate feature, this dashboard works without it)
- Background cleanup job for rejected files (separate issue, see "File Retention" below)
- Bulk approve/reject (single-image triage is the v1 UX)
- Approval history view (undo-last is the only retroactive action in v1)
- Pagination (queue is bounded at 200 with a UI warning)

## User & Use Case

**Audience:** Curators (and admins via role inheritance). Realistic queue size in steady
state: a handful to a few dozen pending photos. Curators want to clear the queue quickly
with confident judgments based on visual inspection.

**Workflow:**

1. Curator notices the amber dot on the "Admin" nav link → clicks through to dashboard
2. First pending photo loads, focused
3. Curator inspects the hero image, glances at the 3 existing approved photos for the
   same item (sidebar) to detect duplicates or quality regressions
4. Presses **A** to approve (most common) — soft flash, photo slides left, next loads
5. Or presses **R-R** (chord) to reject without reason, OR presses **1-6** to reject with
   a preset reason (1=blurry, 2=wrong item, 3=NSFW, 4=duplicate, 5=poor quality, 6=other
   → opens free-text input)
6. If they hit the wrong key, the Sonner toast has an "Undo" button (5-second window)
7. Queue empty → empty state with a serif "No photos awaiting review" message

## Architecture Decisions

### Validation Rules (Defense in Depth)

The rejection reason columns are protected at three layers — DB constraints, Fastify
schema, and endpoint handler logic — to prevent invalid combinations:

| Rule | DB constraint | API schema | Handler |
|---|---|---|---|
| Code only when status='rejected' | ✓ | ✓ | clears on undo |
| Text only when code='other' | ✓ | ✓ | clears when code changes |
| `rejection_reason_text` length | — | `maxLength: 500` | — |
| Status transition validity | — | enum check | `expected_status` (see below) |

The endpoint handler always sets `rejection_reason_code = NULL, rejection_reason_text = NULL`
in the same UPDATE statement when the target status is not `'rejected'`. This is required
to avoid a transient state that violates the `code IS NULL OR status = 'rejected'`
CHECK constraint during undo flows.

### Two Rejection Reason Columns

```sql
ALTER TABLE item_photos
  ADD COLUMN rejection_reason_code TEXT
    CHECK (rejection_reason_code IN
      ('blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other')),
  ADD COLUMN rejection_reason_text TEXT;
```

Two columns instead of one because:

- The **code** is queryable, translatable, and badge-friendly. ("Show me all NSFW
  rejections this month" is a one-liner.)
- The **text** is only used when `code = 'other'` — a free-form note. Storing them in one
  column would force string parsing later.
- A CHECK constraint enforces `text IS NULL OR code = 'other'` so the schema rejects
  illegal combinations at insert time.
- A second CHECK enforces `code IS NULL OR status = 'rejected'` so non-rejected rows
  can't carry stale reason data.

### Atomic Approve/Reject Across Two Tables

When a curator approves a contributed photo, **both** the catalog row and the audit row
flip in a single transaction:

```sql
BEGIN;
UPDATE item_photos SET status = 'approved', updated_at = NOW()
  WHERE id = $1 RETURNING id;
UPDATE photo_contributions SET status = 'approved', updated_at = NOW()
  WHERE item_photo_id = $1 AND status != 'revoked';
COMMIT;
```

This keeps the contributor-facing badge ("Submitted" → "Shared") in lockstep with the
catalog state. The same atomic flip applies to rejection. The Phase 1.6 list query
already JOINs `photo_contributions.status` and expects it to track reality, so any drift
would cause user-visible UI bugs.

**WHERE clause uses `status != 'revoked'`, NOT `status = 'pending'`** — this is critical
for the undo-and-redo flow. If a contribution was previously approved and is being
re-approved after an undo, the `photo_contributions.status` is already `'approved'`, and
filtering on `'pending'` would skip the row. The non-`'revoked'` filter handles every
state the curator might transition.

For **direct curator uploads** (no `photo_contributions` row), the second UPDATE simply
affects 0 rows — that's fine.

### Optimistic Concurrency

The PATCH endpoint accepts an optional `expected_status` field in the request body. When
provided, it's added to the WHERE clause: `UPDATE item_photos SET ... WHERE id = $1 AND
status = $expected`. If the row's current status doesn't match (because another curator
already decided), the UPDATE affects 0 rows and the endpoint returns **409 Conflict** with
the actual current status. The client uses this to show "Photo state has changed —
refreshing queue" and refetches.

The 5-second undo window is **client-side UX only**. The PATCH endpoint imposes no
server-side time limit on status edits — curators can retroactively change any photo's
status at any time. This matches the existing Phase 1.9 catalog photo management pattern
where curators can re-approve or re-reject without time restrictions.

### Tombstoned Uploader Handling

The uploader JOIN uses `LEFT JOIN users u ON ip.uploaded_by = u.id AND u.deleted_at IS NULL`.
This means GDPR-tombstoned users (where `users.deleted_at IS NOT NULL` but the FK is
intact) coerce to `uploader = null` in the API response, identical to the case where
`uploaded_by IS NULL`. The UI shows `[REDACTED — GDPR]` for both. There is no halfway
state where the curator sees a partial record like `{ display_name: null, email: null }`.

### Single-Image Triage, Not a Grid

The default (and v1's only) view is a single hero image with metadata sidebar and
film-strip queue at the bottom. Reasons for not building a grid:

- Curators are doing **judgment**, not **browsing**. Grids invite skimming, which lowers
  decision quality on visual content.
- The "existing photos" sidebar (3 most recent approved photos for the same item) is the
  killer feature. It only fits in a single-image layout — a grid couldn't show it without
  per-card clutter.
- Keyboard-driven flow (A / R-R / 1-6 / S / D) requires a single "active photo" focus.
  Grids force mouse selection.

Grid view can be added as a `?view=grid` opt-in later if curators request it for fast
skim-and-bulk-approve workflows.

### Left-Hand-Only Keyboard Shortcuts

All shortcuts cluster on the left side of a QWERTY keyboard so the curator's right hand
stays free for the mouse (or coffee). The chord pattern for reject (R-R within 500ms)
prevents accidental destructive actions while keeping single-key approve.

| Key | Action |
|---|---|
| `A` | Approve as-intended (uses contributor's `intent` to set visibility) |
| `T` | Approve as **training only** (no-op for `training_only` contributions; **demotes** `catalog_and_training` contributions to `training_only`) |
| `R R` (chord) | Reject (no reason) |
| `1` | Reject — blurry |
| `2` | Reject — wrong item |
| `3` | Reject — NSFW |
| `4` | Reject — duplicate |
| `5` | Reject — poor quality |
| `6` | Reject — other (opens free-text input) |
| `S` | Previous photo |
| `D` | Next photo / skip |
| `Esc` | Close any open overlay |

**Approve vs Approve-as-Training-Only semantics:**

- `A` (approve as-intended) sets `item_photos.visibility = 'public'` if the contributor's
  intent was `catalog_and_training`, OR `'training_only'` if the contributor's intent
  was `training_only`. The contributor's intent is honored.
- `T` (approve as training-only) always sets `item_photos.visibility = 'training_only'`.
  For `training_only`-intent contributions this is a no-op equivalent to `A`. For
  `catalog_and_training`-intent contributions this is a **curator demote** — strictly
  less exposure than the contributor consented to, which is allowed without re-consent.
- There is **no shortcut for promoting `training_only → public`**. Promotion would
  expand exposure beyond consent and requires a re-consent flow that's deferred to a
  follow-up. The dashboard cannot promote.

The keyboard handler:

1. **Ignores any event with a modifier held** (`Ctrl`, `Cmd`, `Alt`, `Shift`). This
   prevents `Cmd+R` (browser refresh) from triggering the R-R chord state.
2. **Ignores keys when focus is in an `<input>` or `<textarea>`**, so the "other"
   free-text box doesn't trigger shortcuts mid-typing.
3. **Ignores keys while a mutation is in flight** for the current photo (so a second
   press of A doesn't fire a duplicate request). Also resets the R-R chord state when a
   mutation starts.
4. **Ignores keys while any overlay is open** (KeyboardShortcutOverlay, RejectReasonOverlay
   "other" input). Esc dismisses the open overlay; A/R/1-6 are inert until it closes.

The chord window is a module-scoped constant `REJECT_CHORD_WINDOW_MS = 500`. Tests
import the constant directly rather than hardcoding the value.

### "Other" Reason — Inline Input Flow

When the curator presses **6** or selects "Other" from the mouse dropdown, an **inline
text input** appears below the action bar (NOT a separate modal). The input is auto-focused.

- **Enter** confirms the rejection with `code='other'` and the typed text (or
  `text=null` if empty)
- **Esc** cancels the entire reject action and returns to the triage view
- The text input has `maxLength={500}` matching the server-side schema constraint
- Keyboard shortcuts are suppressed while the input is focused (per rule 2 above)

### Undo-Last via Sonner Action Button

Mirrors the existing collection delete-undo pattern:

- After every approve/reject mutation, fire a Sonner toast with a 5-second duration and
  an "Undo" action button
- Undo button calls the same `PATCH /admin/photos/:id/status` endpoint with
  `status: 'pending'` (and `rejection_reason_code: null, rejection_reason_text: null`),
  reverting the row to its pre-decision state
- Each toast has a unique `id` so concurrent decisions (curator approves Y while X's
  toast is still visible) don't cross-wire callbacks
- No history view, no audit timeline — undo is the only retroactive action in v1

### File Retention on Reject

Rejected photos **keep their files** in v1. The `item_photos` row stays with
`status='rejected'` and the underlying file is untouched. This:

- Allows undo to fully restore the photo (otherwise undo would leave a dangling row)
- Allows curators to re-review rejected photos manually if they realize a mistake later
- Defers the file-cleanup mechanism to a separate follow-up issue, which will introduce
  a background job that deletes files for `item_photos WHERE status='rejected' AND
  updated_at < NOW() - INTERVAL '30 days'`

### No Pagination, No Polling

- **No pagination**: the pending queue is bounded by curator workload (realistically
  <100). The list endpoint returns up to 200 photos in one response with a `total_count`
  field; the UI displays a warning if `total_count > 200`. The film-strip queue UI relies
  on having the whole batch in memory for instant J/K-style navigation.
- **No interval polling**: the notification dot fetches the count once per browser-tab
  lifecycle (page load / refresh / new tab) via the TanStack Query cache, and invalidates
  after every approve/reject/undo mutation. No `setInterval`, no 60-second refresh.
  Curators are the only audience, see the dot when they care, and get immediate feedback
  after their own actions.

### Role Guard

`requireRole('curator')` on every endpoint. Per the existing role hierarchy, this allows
both `curator` and `admin` users (admin inherits curator). Photo approval is a curator
concern by design; admins get it for free via inheritance.

**An inline comment in `routes.ts` is required** to prevent future maintainers from
"normalizing" the URL prefix `/admin/*` and the role check `requireRole('curator')` to
match (e.g., changing curator to admin). The mismatch is intentional.

### Empty `existing_photos` Behavior

When the underlying item has zero approved photos (e.g., the pending photo is the
first-ever contribution for that item), the `existing_photos` array is empty and the
"Existing Photos" sidebar section is **not rendered at all**. No "No photos yet"
placeholder, no empty heading — the section simply isn't part of the DOM.

### Accessibility

- **Headings**: page = `<h1>Photo Approvals</h1>`, triage view = `<h2>Reviewing {itemName}</h2>`,
  empty state = `<h1>No photos awaiting review</h1>`
- **Keyboard overlay**: `role="dialog"`, `aria-label="Keyboard shortcuts"`, dismissible
  via Esc, focus-trapped while open
- **Live region**: a visually-hidden `<div aria-live="polite">Reviewing photo {n} of {total}</div>`
  on the triage view announces queue position to screen readers on every navigation
- **Existing photos thumbnails**: `alt={`Existing photo for ${itemName}`}` and clickable
  links to the catalog item page
- **Action bar buttons**: have `aria-keyshortcuts="A"`, `"R R"`, etc. so assistive tech
  can announce the shortcuts

## Database — Migration 038

```sql
-- 038_item_photos_rejection_reasons.sql
-- Depends on migration 037 (visibility + intent columns from Phase 1.6 amendment)

ALTER TABLE item_photos
  ADD COLUMN rejection_reason_code TEXT
    CHECK (rejection_reason_code IN
      ('blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other')),
  ADD COLUMN rejection_reason_text TEXT;

ALTER TABLE item_photos
  ADD CONSTRAINT item_photos_rejection_text_only_other CHECK (
    rejection_reason_text IS NULL OR rejection_reason_code = 'other'
  );

ALTER TABLE item_photos
  ADD CONSTRAINT item_photos_rejection_code_only_rejected CHECK (
    rejection_reason_code IS NULL OR status = 'rejected'
  );

CREATE INDEX idx_item_photos_pending_created
  ON item_photos (created_at ASC) WHERE status = 'pending';
```

## API Endpoints

All under `/admin/photos/*`, all gated by `[fastify.authenticate, fastify.requireRole('curator')]`.

### `GET /admin/photos/pending`

Returns the full pending queue (capped at 200) with all metadata needed for the
single-image triage view.

```typescript
{
  photos: Array<{
    id: string;
    item: {
      id: string;
      name: string;
      slug: string;
      franchise_slug: string;
      thumbnail_url: string | null;
    };
    photo: {
      url: string;
      caption: string | null;
      dhash: string;
      visibility: 'public' | 'training_only';  // current visibility (curator may have demoted)
    };
    uploader: {
      id: string;
      display_name: string;
      email: string;
    } | null;  // null = uploaded_by IS NULL OR uploader is GDPR-tombstoned (deleted_at IS NOT NULL)
    contribution: {
      id: string;
      consent_version: string;
      consent_granted_at: string;
      intent: 'training_only' | 'catalog_and_training';  // contributor's locked consent
    } | null;  // null = direct curator upload (no contribution row); rare in v1, may not occur
    existing_photos: Array<{
      id: string;
      url: string;
    }>;  // up to 3 most recent approved photos for the same item
    created_at: string;
  }>;
  total_count: number;  // unbounded count for the "200+" warning
}
```

The query is one big SELECT with:

- `LEFT JOIN users u ON ip.uploaded_by = u.id AND u.deleted_at IS NULL` — tombstoned
  users coerce to `uploader = null`, identical to `uploaded_by IS NULL`
- `LEFT JOIN photo_contributions pc ON pc.item_photo_id = ip.id AND pc.status != 'revoked'`
  — revoked contributions are filtered so the curator never sees orphaned audit trails.
  Additionally, `WHERE pc.file_copied = true OR pc.id IS NULL` excludes contributions
  whose underlying file copy hasn't completed yet (Phase 1.6 crash-recovery state)
- `LEFT JOIN LATERAL (SELECT id, url FROM item_photos WHERE item_id = ip.item_id AND
  status = 'approved' ORDER BY created_at DESC LIMIT 3)` for the existing-photos preview
- `WHERE ip.status = 'pending' ORDER BY ip.created_at ASC LIMIT 200`

### `PATCH /admin/photos/:id/status`

Decide a photo. Body:

```typescript
{
  status: 'approved' | 'rejected' | 'pending';  // 'pending' is the undo path
  expected_status?: 'pending' | 'approved' | 'rejected';  // optimistic concurrency
  visibility?: 'training_only';  // OPTIONAL demote on approve. ONLY accepts 'training_only'.
                                  // Promote ('public') is rejected with 422.
  rejection_reason_code?: 'blurry' | 'wrong_item' | 'nsfw' | 'duplicate' | 'poor_quality' | 'other';
  rejection_reason_text?: string;  // only allowed when code = 'other', max 500 chars
}
```

**Validation**:

- If `status === 'rejected'`, `rejection_reason_code` is **required**
- If `rejection_reason_text` is provided, `rejection_reason_code` MUST be `'other'`
- If `status !== 'rejected'`, the server **clears** `rejection_reason_code` and
  `rejection_reason_text` in the same UPDATE (avoids the transient state that violates
  the `code IS NULL OR status='rejected'` CHECK constraint)
- `rejection_reason_text` `maxLength: 500`
- `visibility` field is **only accepted as `'training_only'`** — it's a one-way demote
  flag. Sending `visibility: 'public'` returns **422 Unprocessable Entity** with an error
  about promotion requiring re-consent. Sending `visibility: 'training_only'` is allowed
  for any approve action (no-op when contributor's intent was already `training_only`,
  demote when intent was `catalog_and_training`).
- `visibility` is only meaningful when `status === 'approved'`. Sending it with
  `'rejected'` or `'pending'` is silently ignored — the column stays at its prior value
  (it's NOT NULL, so it can't be cleared, and changing it would be irrelevant anyway
  since rejected/pending photos aren't displayed to anyone except the curator).

**Behavior**:

- Atomic transaction. The `visibility` column is **path-independent** on approve actions:
  pressing `A` always restores the contributor's intent, pressing `T` always sets
  `training_only`. This means a curator can recover from a mistaken demote+undo cycle
  by pressing `A` again. On non-approve actions (`reject` / `pending`), visibility is
  left unchanged (it's irrelevant when the photo isn't visible anyway).

  The endpoint computes the target visibility server-side **before** the UPDATE, by
  reading the contributor's intent from `photo_contributions`:

  ```typescript
  // Pseudocode for the endpoint handler
  const target_visibility = (status === 'approved')
    ? (request.body.visibility === 'training_only'
        ? 'training_only'                                        // T press: explicit demote
        : (contribution?.intent === 'catalog_and_training'
            ? 'public'                                           // A press, public intent
            : 'training_only'))                                  // A press, training-only intent
    : null;  // reject/pending: visibility unchanged
  ```

  Then the UPDATE:
  ```sql
  UPDATE item_photos
    SET status = $1,
        rejection_reason_code = $2,
        rejection_reason_text = $3,
        visibility = COALESCE($6, visibility),  -- $6 is target_visibility, NULL on undo/reject
        updated_at = NOW()
    WHERE id = $4
      AND ($5::text IS NULL OR status = $5)    -- expected_status guard
  RETURNING id;
  ```

  For direct curator uploads (no `photo_contributions` row), the contribution intent is
  treated as `catalog_and_training` by default, so pressing `A` results in
  `visibility = 'public'`.
  If 0 rows affected → 409 Conflict with `{ error: 'Photo state has changed', current_status: <actual> }`.
  Client refetches the queue.
- Then:
  ```sql
  UPDATE photo_contributions
    SET status = $1, updated_at = NOW()
    WHERE item_photo_id = $2 AND status != 'revoked';
  ```
  Note: filters `!= 'revoked'`, NOT `= 'pending'`, so undo-and-redo flows work correctly.

**Response**: returns the updated base `item_photos` row:
```typescript
{
  id: string;
  item_id: string;
  url: string;
  status: 'approved' | 'rejected' | 'pending';
  visibility: 'public' | 'training_only';
  rejection_reason_code: string | null;
  rejection_reason_text: string | null;
  updated_at: string;
}
```

Client invalidates the `['admin', 'photos', 'pending']` query and the
`['admin', 'photos', 'pending-count']` query on success.

### `GET /admin/photos/pending-count`

Lightweight count for the nav notification dot.

```typescript
{ count: number; }
```

`SELECT COUNT(*) FROM item_photos WHERE status = 'pending'`. No JOINs, no metadata.

## Web Components

| File | Purpose |
|---|---|
| `web/src/admin/photos/PhotoApprovalPage.tsx` | Top-level page; owns active photo state, queue navigation, keyboard shortcuts |
| `web/src/admin/photos/PhotoTriageView.tsx` | Hero image + sidebar layout |
| `web/src/admin/photos/PhotoMetadataPanel.tsx` | Item link, uploader info, contribution audit (with intent badge), current visibility, existing-photos strip |
| `web/src/admin/photos/ActionBar.tsx` | Approve / Approve as Training-Only / Reject / Skip buttons + reason dropdown. The "Approve as Training-Only" button is hidden when contribution intent is already `training_only`. |
| `web/src/admin/photos/RejectReasonOverlay.tsx` | Numeric-keyed reason picker with free-text for "other" |
| `web/src/admin/photos/FilmStripQueue.tsx` | Bottom queue navigation, click-to-jump, position indicator |
| `web/src/admin/photos/KeyboardShortcutOverlay.tsx` | First-visit cheat sheet, dismissible, localStorage-persisted |
| `web/src/admin/photos/usePhotoApprovalKeyboard.ts` | Keyboard handler hook (A, R-R chord, 1-6, S, D, Esc) |
| `web/src/admin/photos/usePhotoApprovals.ts` | TanStack Query hook for `GET /admin/photos/pending` |
| `web/src/admin/photos/usePhotoApprovalMutations.ts` | Approve/reject/undo mutations with toast feedback |
| `web/src/admin/photos/usePendingPhotoCount.ts` | Lightweight count hook for the nav dot |
| `web/src/admin/photos/api.ts` | API client functions |
| `web/src/routes/_authenticated/admin/photo-approvals.tsx` | Route registration |

### Modified files

- `api/src/admin/routes.ts` — register the photos sub-plugin
- `web/src/lib/zod-schemas.ts` — add the schemas below
- Admin sidebar component — add "Photo Approvals" link with notification dot
- `web/playwright.config.ts` — register the new E2E spec

### Zod Schemas (web/src/lib/zod-schemas.ts)

```typescript
export const PhotoApprovalUploaderSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  email: z.string(),
});

export const PhotoApprovalContributionSchema = z.object({
  id: z.string().uuid(),
  consent_version: z.string(),
  consent_granted_at: z.string(),
  intent: z.enum(['training_only', 'catalog_and_training']),
});

export const PhotoApprovalItemSchema = z.object({
  id: z.string().uuid(),
  item: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    franchise_slug: z.string(),
    thumbnail_url: z.string().nullable(),
  }),
  photo: z.object({
    url: z.string(),
    caption: z.string().nullable(),
    dhash: z.string(),
    visibility: z.enum(['public', 'training_only']),
  }),
  uploader: PhotoApprovalUploaderSchema.nullable(),
  contribution: PhotoApprovalContributionSchema.nullable(),
  existing_photos: z.array(z.object({
    id: z.string().uuid(),
    url: z.string(),
  })),
  created_at: z.string(),
});

export const PhotoApprovalListResponseSchema = z.object({
  photos: z.array(PhotoApprovalItemSchema),
  total_count: z.number().int().nonnegative(),
});

export const PhotoApprovalDecisionResponseSchema = z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid(),
  url: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  visibility: z.enum(['public', 'training_only']),
  rejection_reason_code: z.enum([
    'blurry', 'wrong_item', 'nsfw', 'duplicate', 'poor_quality', 'other'
  ]).nullable(),
  rejection_reason_text: z.string().nullable(),
  updated_at: z.string(),
});

export const PhotoApprovalConflictResponseSchema = z.object({
  error: z.string(),
  current_status: z.enum(['pending', 'approved', 'rejected']),
});

export const PhotoApprovalCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export type PhotoApprovalItem = z.infer<typeof PhotoApprovalItemSchema>;
```

## Test Plan

| Layer | Coverage |
|---|---|
| API unit | Query functions: pending list shape, atomic flip, undo, count, validation |
| API integration | Auth (401/403 for non-curator), happy paths, validation rejections (text without code='other', code without status='rejected'), atomic flip across both tables, undo round-trip |
| Web unit | PhotoApprovalPage state machine, ActionBar callbacks, keyboard hook (A, **T (approve-as-training-only)**, R-R chord timing, 1-6, S, D, all four guards: modifier-held, input/textarea focus, in-flight mutation, overlay-open), FilmStripQueue navigation, "other" inline input flow (Enter/Esc), demote-on-approve flow (T on a public-intent photo updates visibility to training_only) |
| E2E | Curator opens dashboard → approves with A → rejects with `1` → undoes via Sonner → demotes a public contribution with T → verifies it's no longer in the public catalog → empty state → notification dot disappears |

Test scenarios in `docs/test-scenarios/E2E_PHOTO_APPROVAL.md` (Gherkin format).

## Risks

- **R1 — `LEFT JOIN LATERAL` performance.** The "existing photos" subquery runs once per
  pending row. Mitigation: it's bounded to LIMIT 3 and the index on `(item_id, status)`
  exists. Realistic v1 queue size (<100) makes this trivial.
- **R2 — Large pending queues (>200).** Out of v1 scope per Q3. UI shows a warning, the
  curator processes a batch, then refreshes for the next 200.
- **R3 — Keyboard handler conflicts.** The handler explicitly skips events with any
  modifier held (`Ctrl`/`Cmd`/`Alt`/`Shift`), so `Cmd+R` (browser refresh) never
  triggers the R-R chord state. It also ignores keys when focus is on an
  `<input>`/`<textarea>`, when an overlay is open, and when a mutation is in flight for
  the current photo.
- **R4 — Undo race condition.** Each toast's undo callback closes over the specific
  `photoId` it acted on, not "the current photo". Sonner's per-toast `id` prevents
  callback cross-wiring. The dashboard does NOT scroll back to the undone photo —
  the user stays on whatever they're currently viewing, and the undone photo
  re-enters the queue at its original position.
- **R5 — Concurrent curator decisions.** Two curators decide the same photo simultaneously.
  Mitigated by the `expected_status` optimistic concurrency check on the PATCH endpoint
  — the second request returns 409 and the client refetches the queue.
- **R6 — Pending photo files publicly served.** `@fastify/static` serves files by URL,
  not by DB status. A user with the URL of a pending photo can view it before approval.
  **This is a known privacy concern that v1 does NOT address** — see "Out-of-Scope
  Followups" below. v1 mitigates by relying on URL un-guessability (UUID-based paths)
  and acknowledging that the surface area is small (only contributions in the queue).
- **R7 — File retention on reject leaks disk.** Acknowledged. Tracked as a follow-up
  cleanup job issue.

## Out-of-Scope Followups

- **Pending photo file access control** (R6): currently `@fastify/static` serves all
  photo files by URL regardless of DB status. A new follow-up issue should restrict
  access to `status='pending'` photos — either by serving them through a gated endpoint
  that checks `requireRole('curator')`, or by storing pending uploads under a separate
  filesystem path that isn't behind `@fastify/static`. The simplest fix is the latter
  — store contributed photos under `pending/` until approved, then move to the public
  path on approval.
- **NSFW auto-moderation** (#71): would auto-flag uploads, dashboard surfaces them
  pre-filtered. Independent feature, this dashboard works without it.
- **Background cleanup of rejected files**: scheduled job that deletes files for rejected
  rows older than 30 days. New issue to be filed when this PR ships.
- **Bulk approve/reject**: shift-click range selection in a grid view. Defer until
  curators ask for it.
- **Approval history / audit log page**: read-only view of past decisions, filterable by
  curator and date. Defer.
- **Reject reason analytics**: dashboard showing "what gets rejected most" to inform
  contributor guidelines. Defer.
- **Self-approval policy**: currently a curator can approve their own contributed photo.
  Acceptable for v1 (audit trail in `photo_contributions.contributed_by` makes any abuse
  visible). Could add a "cannot approve own contribution" guard later if abuse occurs.
