# Photo Approval Dashboard — Plan Amendment

> **Read this alongside** `Photo_Approval_Dashboard_Plan.md`. This amendment captures
> decisions made in the `/feature-dev:feature-dev` architecture phase that refine or
> override the base plan. Where silent, the base plan governs.

## Status

- Base plan: design of record, validated against the post-Phase 1.6-amendment (#148) codebase
- Amendment: fills gaps the base plan did not resolve, locks in implementation shape
- Scope: same feature, same user outcome, two PR delivery

## Decision log

### D1 — Two-PR delivery

Base plan specifies a single PR. **Amendment: split into two PRs.**

- **PR 1** (backend): migration 038, three `/admin/photos/*` endpoints, query functions,
  unit + integration tests. References `Closes #72` only in PR 2.
- **PR 2** (frontend): admin route, page components, keyboard hook wrapper, nav dot,
  Zod schemas, unit + E2E tests. References `Closes #72`.

Why: smaller diffs review better; PR 1 is purely additive (new endpoints nobody uses
yet); PR 2 is purely additive on the web side and only hits main once the API has
landed. Neither PR is user-visible until PR 2 ships.

How to apply: the review, verification, and simplification gates run twice — once
per PR. The Architecture Review & Audit pass runs once, before either PR starts.

### D2 — Admin layout role guard relaxation

Base plan assumes curators can reach `/admin/photo-approvals`. Current code hardcodes
`user.role !== 'admin'` in `AdminLayout` (`web/src/routes/_authenticated/admin.tsx:26-31`).

**Amendment: relax the layout guard to allow `curator | admin`, add explicit
per-page admin-only guards on the existing admin pages.**

Concretely:

1. `AdminLayout` changes `user.role !== 'admin'` to
   `user.role !== 'admin' && user.role !== 'curator'` in both the `useEffect` and the
   synchronous render guard.
2. `MlStatsPage` gets a new `useEffect` + synchronous guard that navigates to
   `/admin/photo-approvals` (not `/`) if `user.role !== 'admin'` — so curators who
   click "ML Stats" bounce to their accessible landing page.
3. `AdminUsersPage` gets the same admin-only per-page guard.
4. The sidebar `NAV_ITEMS` constant becomes role-aware — hide links the user can't
   reach: `{ to, label, icon, roles: ['admin'] }` or similar. Curators only see
   "Photo Approvals" in the sidebar.

Why: component-level guard is already the project convention
(`.claude/rules/web-components.md`). Keeping all guards at the page level (plus
layout-level "is staff at all") is clearer than a route-aware layout guard that
couples the layout to the route table.

### D3 — Role-aware default redirect

`web/src/routes/_authenticated/admin/index.tsx` currently does
`throw redirect({ to: '/admin/ml' })` in `beforeLoad`.

**Amendment: make the redirect role-aware.**

The `beforeLoad` looks up the user's role (via `authStore` since `beforeLoad` runs
outside the React tree) and redirects:

- `admin` → `/admin/ml`
- `curator` → `/admin/photo-approvals`
- anything else → `/` (belt-and-braces; layout guard will bounce them anyway)

If `authStore.getToken()` is null (cold load before silent refresh), fall through
to `/admin/ml` — the layout's React-level guard will resolve state correctly once
auth loads.

### D4 — Self-approval guard (server-side)

Base plan defers self-approval to an audit-trail honor system. **Amendment: enforce
it server-side in the PATCH handler.**

Behavior:

```text
If the target item_photos row has an attached photo_contributions row AND
contribution.contributed_by.toLowerCase() === request.user.sub.toLowerCase(),
return 403 Forbidden with { error: 'Cannot approve your own contribution' }.
```

Both UUIDs are case-normalized to lowercase before comparison, matching the
existing admin guard pattern in `admin/routes.ts:91` (`targetId.toLowerCase()`).
Postgres UUID storage is case-insensitive on read but the JWT `sub` claim may
arrive in either case depending on upstream token issuance.

**Keyboard interaction on `can_decide: false` items:** the curator can still
navigate to and away from a locked item via `S` (previous), `D` (next/skip),
and `?` (overlay). The decision keys `A`, `T`, `R`/`R-R`, and `1-6` are no-ops
(the `usePhotoApprovalKeyboard` adapter receives `enabled: false` for those
specific keys while the locked item is active, via a `canDecide` parameter).
`Esc` still closes any open overlay.

Edge cases handled by the guard:

- **No contribution row** (direct curator upload, shouldn't reach the queue anyway):
  guard passes. No comparison to perform.
- **Tombstoned contributor** (`users.deleted_at IS NOT NULL`): the
  `contributed_by` UUID still matches the actor UUID if the actor is self-deleting
  while logged in — still forbid. Tombstone status is irrelevant; the FK UUID is
  stable.
- **Undo then re-approve**: each PATCH call re-evaluates the guard. A curator can't
  bypass by approving, undoing, and re-approving; it fires both times.
- **Status-agnostic**: the guard applies to `'approved'`, `'rejected'`, and
  `'pending'` (undo) decisions. A curator cannot decide on their own contribution
  at all, in any direction.

Web-side UX (PR 2): the list endpoint includes `can_decide: boolean` in each item
(false when `contribution?.contributed_by.toLowerCase() === currentUser.id.toLowerCase()`).
**`can_decide` ships in PR 1** as part of the `GET /admin/photos/pending` response
shape — PR 2 only consumes it. Adding it retroactively in PR 2 would require an
API change, which breaks the two-PR delivery.

The field is computed server-side in the SELECT:

```sql
(pc.contributed_by IS NULL OR pc.contributed_by::text != LOWER($1::text)) AS can_decide
```

where `$1` is the requesting curator's `sub`. NULL contribution (direct uploads)
coerces to `can_decide = true` because the `OR` short-circuits. PostgreSQL outputs
UUIDs in canonical lowercase, so only the JWT-sourced side needs `LOWER()`. The ActionBar
disables Approve/Reject/Skip and shows "You contributed this photo — another
curator must review" as a replacement message. The film strip still shows the
photo so curators see the queue state; the keyboard handler is disabled (via the
existing `enabled` prop) for that item. Pressing `D`/skip still works.

Why: defense in depth. Audit trails catch abuse after the fact; a server guard
prevents it entirely. The web `can_decide` flag avoids a confusing 403 on
keypress.

### D5 — Queue > 200 behavior

Base plan says "UI shows a warning." **Amendment: show the oldest 200 with a
dismissible banner.**

The `GET /admin/photos/pending` response already includes `total_count` (unbounded).
The web displays `<PendingQueueBanner>` above the triage view when
`total_count > photos.length`:

```text
Showing oldest 200 of N pending photos. Refresh after clearing this batch to see more.
```

The banner has no dismiss action — it's informational and reflects current state on
every query refetch. (Curators dismissing and then forgetting about 1000+ pending
items is the failure mode.)

### D6 — Nav dot refresh policy

**Amendment: mutation + page-load only, no interval polling.** Matches base plan.
No change.

### D7 — Keyboard library: `react-hotkeys-hook`

Base plan described a hand-rolled keyboard handler. **Amendment: use
`react-hotkeys-hook`** (if not already installed, add as a PR 2 dependency).

The wrapper hook `usePhotoApprovalKeyboard` becomes a thin adapter:

- Maps keys to mutation callbacks (`A`, `T`, `R`, `1..6`, `S`, `D`, `?`, `Esc`)
- Handles the `R → R` chord via `useHotkeys('r', ..., { keydown: true })` tracking
  a `lastRPressAt` ref, with a 500ms window (module-scoped constant
  `REJECT_CHORD_WINDOW_MS = 500` for tests)
- Forwards `enabled: boolean` to suppress keys while:
  (a) a mutation is in flight for the current photo
  (b) an overlay is open (KeyboardShortcutOverlay, inline "other" input)
  (c) the user is focused in an input/textarea (`enableOnFormTags: false`, the
  library default)
  (d) the current item has `can_decide: false` (self-approval guard)

The library already handles the modifier-held guard (`Cmd/Ctrl/Alt/Shift` events
don't fire the base shortcut by default). We explicitly verify this in unit tests.

Why: no prior art in the codebase for global keyboard handlers, chord sequences,
or focus guards. Library code is battle-tested for all four concerns. Keeps the
wrapper hook small and testable.

### D8 — Shortcut overlay: first-visit via localStorage, `?` to reopen

`KeyboardShortcutOverlay` uses `localStorage.getItem('photo-approval-shortcuts-seen')`
to decide whether to auto-open on first mount. Dismissing (Esc or close button)
sets the key to `'true'`. The `?` hotkey reopens the overlay at any time and is
the only way to see shortcuts after dismissal.

Storage key name: `photo-approval-shortcuts-seen` (no `trackem:` prefix — it's a
UI preference, not a security flag).

### D8.1 — Shortcut table addition

Add a row to the base plan's shortcut table (lines 200–214):

| Key | Action                                 |
| --- | -------------------------------------- |
| `?` | Open/close the KeyboardShortcutOverlay |

The `?` hotkey works regardless of localStorage state — it's the only escape
hatch after the user dismisses the first-visit overlay.

### D9 — E2E test: real seeded data

E2E uses the existing `POST /auth/test-signin` endpoint to obtain a curator session,
then seeds pending photos via a new test helper that hits the real DB through an
`/admin/test-photos/seed` endpoint (registered in non-production environments only,
mirroring `test-signin.ts`).

The helper:

1. Creates a test user (contributor) via test-signin
2. Creates a collection item + contributes a photo (hits the real contribution flow)
3. Returns the resulting `item_photos.id` for the test to act on

Why: memory says real E2E is needed for photo flows before release
(`project_e2e_real_testing`). Route mocking would skip the atomic flip — the exact
risk this feature introduces.

**Security spec for `POST /admin/test-photos/seed`:**

1. **Registered via dynamic `import()`** in `server.ts` inside the existing
   `if (config.nodeEnv !== 'production') { ... }` block, sibling to `test-signin.ts`.
2. **Throws at plugin registration** if `config.nodeEnv === 'production'` —
   defense in depth beyond the registration guard.
3. **No auth required** — it's test infrastructure. An E2E helper calls it
   before signing in as a curator.
4. **Strict JSON schema validation** on the request body: exact shape
   `{ contributor_email: string (pattern @e2e.test$), item_slug: string,
franchise_slug: string, intent: 'training_only' | 'catalog_and_training' }`.
   Any additional property returns 400. The email pattern matches the
   `test-signin` gate.
5. **Rate-limited** at `max: 50, timeWindow: '1 minute'` — enough for a full E2E
   run but low enough that abuse in a misconfigured staging env is noisy.
6. **Cleanup responsibility** lives with the caller — the endpoint returns the
   `item_photo_id` and `contribution_id` of the seeded row; the E2E fixture's
   `afterEach` deletes them via direct DB access (same helper as collection E2E
   tests). No TTL or GC on the endpoint itself.
7. **Dashboard filter**: seeded rows are regular `item_photos` rows with
   `uploaded_by` pointing to an `@e2e.test` user. No special flag. The
   production-facing dashboard has no `@e2e.test` filter — if staging runs E2E
   against real data, curators will see leftover rows. Mitigation: E2E fixtures
   clean up after themselves; if a test crashes, the rows are visible until
   manually cleaned.

### D10 — Migration 038 `migrate:down` block

Base plan omits the down block. **Amendment: add this exact down block:**

```sql
-- migrate:down
DROP INDEX IF EXISTS public.idx_item_photos_pending_created;
ALTER TABLE public.item_photos
    DROP CONSTRAINT IF EXISTS item_photos_rejection_code_only_rejected;
ALTER TABLE public.item_photos
    DROP CONSTRAINT IF EXISTS item_photos_rejection_text_only_other;
ALTER TABLE public.item_photos DROP COLUMN IF EXISTS rejection_reason_text;
ALTER TABLE public.item_photos DROP COLUMN IF EXISTS rejection_reason_code;
```

Drop order: index first (depends on column), then constraints (depend on columns),
then columns. `IF EXISTS` guards on every statement per project convention
(see migration 037's down block).

### D10.1 — Existing photos sidebar visibility filter

The amendment's pending query's `existing_photos` LATERAL subquery currently
filters `status = 'approved'` only. **Amendment: add `AND visibility = 'public'`**
so the sidebar only shows photos the public catalog would show. Training-only
approved photos are irrelevant for visual duplicate-detection against what the
catalog displays.

```sql
-- In the existing_photos LATERAL subquery:
SELECT id, url FROM item_photos
WHERE item_id = ip.item_id
  AND status = 'approved'
  AND visibility = 'public'   -- added
ORDER BY created_at DESC
LIMIT 3
```

If the item has zero public-approved photos, `existing_photos` is an empty
array and the sidebar section doesn't render (per base plan line 304).

### D10.2 — Uploader tombstone coercion

The pending query's LEFT JOIN on `users` coerces tombstoned users to NULL column
values. The handler **must** collapse the whole `uploader` object to `null` when
`u.id IS NULL` rather than returning `{ id: null, display_name: null, email: null }`.

Query function `listPendingPhotos` returns a row shape where `uploader_*` columns
are all nullable; the route handler maps rows to the API response shape and
explicitly constructs `uploader = row.uploader_id ? { id, display_name, email } : null`.
The Fastify response schema uses `uploader: object | null` (nullable object), not
an object with nullable fields.

### D10.3 — Query function specs

Referenced by the PATCH handler pseudocode:

**`loadPhotoForDecision(client, id)` returns:**

```ts
{
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  visibility: 'public' | 'training_only';
  contribution: { contributed_by: string; intent: 'training_only' | 'catalog_and_training' } | null;
} | null
```

Implementation: one SELECT joining `item_photos` and a LEFT JOIN on
`photo_contributions` with `status != 'revoked' AND file_copied = true`. Returns
null if the photo row doesn't exist.

**`getPhotoStatus(client, id)` returns:**

```ts
'pending' | 'approved' | 'rejected' | null;
```

Implementation: `SELECT status FROM item_photos WHERE id = $1`. Used only on the
409 Conflict path to report the actual current status back to the client. The
return value can be stale between the failed UPDATE and this SELECT — that's
acceptable because the client refetches the whole queue on 409.

**Admin photo column constants (in `api/src/admin/photos/queries.ts`):**

```ts
const ADMIN_PHOTO_DECISION_COLUMNS =
  'id, item_id, url, status, visibility, rejection_reason_code, rejection_reason_text, updated_at';
```

Used by the `decidePhoto` UPDATE's RETURNING clause. Matches the amendment's
`PhotoApprovalDecisionResponseSchema` (base plan line 583).

### D11 — R6 (pending file public serving) deferred to follow-up

Accept R6 for v1. **Amendment: file a separate GitHub issue before merging PR 1
titled "Gate pending photo file access (R6 from Photo Approval Dashboard)" and
link it from the PR body as a known limitation.**

Issue body summarizes the plan's R6 section plus the two candidate fixes
(gated endpoint vs. `pending/` filesystem path) without choosing between them —
that's a separate design call.

### D12 — Small plan confirmations (no-change)

The following base plan decisions stand as-is:

- 6 rejection reason codes (`blurry, wrong_item, nsfw, duplicate, poor_quality, other`)
- `T` key for approve-as-training-only, no promote shortcut
- No bulk actions, no approval history view
- `visibility: 'public'` on PATCH returns 422 (not 400) with a promotion-consent error
- Rejected photo files retained; cleanup is a separate background-job follow-up
- Film strip queue shows whole batch in memory; no scrolling-load pagination

## Architectural ripple effects

### PR 1 shape

**New files:**

- `api/db/migrations/038_item_photos_rejection_reasons.sql` — migration
- `api/src/admin/photos/routes.ts` — sub-plugin registering three endpoints
- `api/src/admin/photos/routes.test.ts` — integration tests
- `api/src/admin/photos/queries.ts` — query functions
- `api/src/admin/photos/queries.test.ts` — unit tests (for query shapes)
- `api/src/admin/photos/schemas.ts` — Fastify JSON schemas
- `api/src/admin/test-photos.ts` — test-only seed endpoint (non-prod guard)

**Modified files:**

- `api/src/admin/routes.ts` — register `adminPhotoRoutes` sub-plugin at `/photos`.
  Add inline comment explaining the curator role check (see D2/plan).
- `api/src/server.ts` — conditionally register `test-photos` plugin in non-prod
  (mirroring existing `test-signin` registration)
- `api/src/types/index.ts` — add types for query row shapes

**Query function naming** (follows `admin/queries.ts` pattern):

```ts
listPendingPhotos(client, { limit: 200 }) → { rows, totalCount }
getPendingPhotoCount(client) → number
decidePhoto(client, { id, status, expectedStatus?, rejectionReasonCode?,
                      rejectionReasonText?, visibility?, actorId }) →
  { updatedPhoto } | { conflict: true, currentStatus } | { forbidden: true }
```

The `decidePhoto` function encapsulates the two-table atomic flip, the
optimistic concurrency check, the target-visibility computation, and the
self-approval guard in one place. The route handler is a thin wrapper that maps
the return shape to HTTP codes (200/409/403).

**Rate limits:**

- `GET /admin/photos/pending` → `adminRateLimitRead` (30/min) — matches existing pattern
- `GET /admin/photos/pending-count` → `adminRateLimitRead` (60/min) — hit on every
  admin page navigation; higher budget
- `PATCH /admin/photos/:id/status` → **new constant** `photoDecideRateLimit`
  `{ max: 120, timeWindow: '1 minute' }` — a curator clearing the queue with
  keyboard shortcuts can sustain ~1 decision per second. The existing
  `adminRateLimitWrite` (20/min) would throttle fast triage. Rate is still
  bounded enough to prevent runaway scripts.
- `POST /admin/test-photos/seed` → `{ max: 50, timeWindow: '1 minute' }` — test
  infra only, non-prod.

**Schema constant location:**

`REJECT_CHORD_WINDOW_MS = 500` lives in `web/src/admin/photos/constants.ts`
(PR 2). `REJECTION_REASON_CODES` tuple lives in `api/src/admin/photos/schemas.ts`
and is re-exported as a `const` array the Fastify schema consumes; the web Zod
schema defines its own enum with identical values (single source of truth is
hard to share across projects without a shared package — acceptable duplication).

### PR 2 shape

**New files:** all under `web/src/admin/photos/` and
`web/src/routes/_authenticated/admin/`:

- `web/src/routes/_authenticated/admin/photo-approvals.tsx` — route declaration
- `web/src/admin/photos/PhotoApprovalPage.tsx` — top-level page
- `web/src/admin/photos/PhotoTriageView.tsx` — hero + sidebar layout
- `web/src/admin/photos/PhotoMetadataPanel.tsx` — sidebar content
- `web/src/admin/photos/ActionBar.tsx` — buttons with aria-keyshortcuts
- `web/src/admin/photos/FilmStripQueue.tsx` — bottom queue nav
- `web/src/admin/photos/RejectReasonPicker.tsx` — inline reason picker + text input
- `web/src/admin/photos/KeyboardShortcutOverlay.tsx` — first-visit cheat sheet
- `web/src/admin/photos/PendingQueueBanner.tsx` — 200+ warning
- `web/src/admin/photos/usePhotoApprovalKeyboard.ts` — react-hotkeys-hook adapter
- `web/src/admin/photos/usePhotoApprovals.ts` — list query hook
- `web/src/admin/photos/usePendingPhotoCount.ts` — count query hook
- `web/src/admin/photos/usePhotoApprovalMutations.ts` — decide/undo mutations
- `web/src/admin/photos/api.ts` — API client functions
- `web/src/admin/photos/constants.ts` — `REJECT_CHORD_WINDOW_MS`, reason code list
- `web/e2e/admin-photo-approvals.spec.ts` — Playwright E2E spec
- `web/e2e/fixtures/pending-photos.ts` — seeds pending photos via test API

**Modified files:**

- `web/src/routes/_authenticated/admin.tsx` — relax role guard (D2), add
  role-aware NAV_ITEMS, add notification dot to the Photo Approvals link
- `web/src/routes/_authenticated/admin/index.tsx` — role-aware default redirect (D3)
- `web/src/admin/ml/MlStatsPage.tsx` — add admin-only per-page guard (D2)
- `web/src/admin/users/AdminUsersPage.tsx` — add admin-only per-page guard (D2)
- `web/src/lib/zod-schemas.ts` — new "Photo Approval" section per base plan
- `web/package.json` — add `react-hotkeys-hook` dependency (if not present)
- `web/playwright.config.ts` — register new E2E spec (auto-discover should handle)

**Test fixtures:**

- `web/src/admin/__tests__/admin-test-helpers.tsx` — add `makeCuratorAuthContext()`
  alongside existing `makeAdminAuthContext()`

## Query — the big pending SELECT

```sql
SELECT
  ip.id,
  ip.url,
  ip.caption,
  ip.dhash,
  ip.visibility,
  ip.created_at,
  i.id            AS item_id,
  i.name          AS item_name,
  i.slug          AS item_slug,
  fr.slug         AS franchise_slug,
  prim.url        AS item_thumbnail_url,
  u.id            AS uploader_id,
  u.display_name  AS uploader_display_name,
  u.email         AS uploader_email,
  pc.id           AS contribution_id,
  pc.consent_version,
  pc.consent_granted_at,
  pc.intent       AS contribution_intent,
  pc.contributed_by,
  ep.photos       AS existing_photos
FROM item_photos ip
INNER JOIN items i ON i.id = ip.item_id
INNER JOIN franchises fr ON fr.id = i.franchise_id
LEFT JOIN LATERAL (
  SELECT url FROM item_photos
  WHERE item_id = ip.item_id
    AND status = 'approved'
    AND visibility = 'public'
    AND is_primary = true
  LIMIT 1
) prim ON true
LEFT JOIN users u ON u.id = ip.uploaded_by AND u.deleted_at IS NULL
-- LEFT JOIN LATERAL caps contributions at 1 row per photo to avoid duplicating
-- the outer row if multiple non-revoked contributions ever point to the same
-- item_photo. The contribute handler guards against this via getActiveContribution,
-- but there's no UNIQUE constraint enforcing it, so we defend at query time.
LEFT JOIN LATERAL (
  SELECT id, contributed_by, consent_version, consent_granted_at, intent
  FROM photo_contributions
  WHERE item_photo_id = ip.id
    AND status != 'revoked'
    AND file_copied = true
  ORDER BY created_at ASC
  LIMIT 1
) pc ON true
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('id', ep.id, 'url', ep.url)) AS photos
  FROM (
    SELECT id, url FROM item_photos
    WHERE item_id = ip.item_id
      AND status = 'approved'
    ORDER BY created_at DESC
    LIMIT 3
  ) ep
) ep ON true
WHERE ip.status = 'pending'
ORDER BY ip.created_at ASC
LIMIT 200;
```

Notes:

- Two `LATERAL` subqueries: one for the item's primary thumbnail (1 row), one for
  the 3 existing approved photos. Both bounded, both use existing indexes.
- `pc.file_copied = true` filters contributions still in the crash-recovery
  transient state (Phase 1.6 pattern). The base plan already calls this out.
- `pc.status != 'revoked'` (NOT `= 'pending'`) per the base plan — supports the
  undo-and-redo flow.
- The existing partial index `idx_item_photos_pending_created` (new in migration 038) accelerates the outer `WHERE status = 'pending' ORDER BY created_at ASC`.
- `json_agg` wrapped in a subquery with its own ORDER BY + LIMIT because
  `json_agg` itself cannot take LIMIT.

Count query for `GET /admin/photos/pending-count`:

```sql
SELECT COUNT(*) FROM item_photos WHERE status = 'pending';
```

Uses the same partial index. No joins.

## PATCH handler pseudocode (PR 1)

```ts
async function handleDecide(request, reply) {
  const { id } = request.params;
  const body = request.body; // already ajv-validated for types + enums
  const actorId = request.user.sub;

  // 1. Early validation — cannot be expressed in ajv
  if (body.status === 'rejected' && !body.rejection_reason_code) {
    return reply.code(400).send({
      error: 'rejection_reason_code is required when status is rejected',
    });
  }
  if (body.rejection_reason_text && body.rejection_reason_code !== 'other') {
    return reply.code(400).send({
      error: "rejection_reason_text is only allowed when rejection_reason_code is 'other'",
    });
  }
  if (body.visibility === 'public') {
    return reply.code(422).send({
      error: 'Cannot promote to public — promotion requires re-consent',
    });
  }

  // 2. Atomic dual-update inside withTransaction
  const result = await withTransaction(async (client) => {
    // 2a. Load the row + any attached contribution (self-approval guard)
    const existing = await adminPhotoQueries.loadPhotoForDecision(client, id);
    if (!existing) throw new HttpError(404, { error: 'Photo not found' });

    // 2b. Self-approval guard
    if (existing.contribution?.contributed_by === actorId) {
      throw new HttpError(403, { error: 'Cannot approve your own contribution' });
    }

    // 2c. Compute target visibility
    const targetVisibility = computeTargetVisibility(
      body.status,
      body.visibility,
      existing.contribution?.intent ?? 'catalog_and_training'
    );

    // 2d. Atomic flip
    const updated = await adminPhotoQueries.decidePhoto(client, {
      id,
      status: body.status,
      expectedStatus: body.expected_status ?? null,
      rejectionReasonCode: body.status === 'rejected' ? body.rejection_reason_code : null,
      rejectionReasonText:
        body.status === 'rejected' && body.rejection_reason_code === 'other'
          ? (body.rejection_reason_text ?? null)
          : null,
      targetVisibility,
    });

    if (!updated) {
      // 0 rows affected → optimistic concurrency conflict
      const current = await adminPhotoQueries.getPhotoStatus(client, id);
      throw new HttpError(409, {
        error: 'Photo state has changed',
        current_status: current ?? 'unknown',
      });
    }

    // 2e. Mirror onto photo_contributions (0 rows affected for direct uploads is fine)
    await adminPhotoQueries.mirrorContributionStatus(client, id, body.status);

    return updated;
  }, actorId);

  return result;
}
```

The `computeTargetVisibility` helper:

```ts
function computeTargetVisibility(
  status: 'approved' | 'rejected' | 'pending',
  requested: 'training_only' | undefined,
  intent: 'training_only' | 'catalog_and_training'
): 'public' | 'training_only' | null {
  if (status !== 'approved') return null; // no-op, visibility left unchanged
  if (requested === 'training_only') return 'training_only'; // explicit demote
  return intent === 'catalog_and_training' ? 'public' : 'training_only';
}
```

The `decidePhoto` query runs:

```sql
UPDATE item_photos
SET status                = $1,
    rejection_reason_code = $2,
    rejection_reason_text = $3,
    visibility            = COALESCE($6::text, visibility),
    updated_at            = NOW()
WHERE id = $4
  AND ($5::text IS NULL OR status = $5::text)
RETURNING id, item_id, url, status, visibility,
          rejection_reason_code, rejection_reason_text, updated_at;
```

The `mirrorContributionStatus` query runs:

```sql
UPDATE photo_contributions
SET status = $1, updated_at = NOW()
WHERE item_photo_id = $2 AND status != 'revoked';
```

Critical: both statements run inside the same `withTransaction` callback. The
`COALESCE` on visibility handles the "leave unchanged" case for reject/pending
decisions. The `($5::text IS NULL OR status = $5)` guard is the project's
established optional-predicate pattern.

## Risks (amendment)

- **A1 — `can_decide: false` can confuse curators who see their own photo in the
  queue.** Mitigation: explicit panel message ("You contributed this photo —
  another curator must review") plus a disabled ActionBar. Alternative considered:
  exclude own-contributions from the list entirely. Rejected because it hides
  queue state from the contributor-curator; they deserve to see what's pending.
- **A2 — Role-aware redirect depends on `authStore` being populated during
  `beforeLoad`.** On cold load, token is null until silent refresh resolves.
  Mitigation: fall through to `/admin/ml`; layout guard resolves post-auth.
  Matches the existing cold-load pattern noted in `web/CLAUDE.md`.
- **A3 — `react-hotkeys-hook` adds a runtime dependency.** Weighed against the
  cost of hand-rolling chord handling, modifier guards, and focus guards from
  scratch with zero prior art. Library is widely used, small bundle, active
  maintenance.
- **A4 — Test seed endpoint (`/admin/test-photos/seed`) is production-attack
  surface if the env guard is ever bypassed.** Mitigation: throw at plugin
  registration if `config.nodeEnv === 'production'`. Same pattern as
  `test-signin.ts`. Include this check in the review pass.

## Out of scope (unchanged from base plan)

See base plan "Out-of-Scope Followups" section. R6 (D11 above) files its own
tracking issue before PR 1 merges.

## D13 — Post-Review Amendments (applied during Phase 6 quality review)

The Phase 6 code review (3 parallel reviewers) and the simplification pass
caught 7 actionable findings that materially improved PR 1 before it shipped.
This section captures the deltas from the original amendment so future readers
do not assume the PATCH handler pseudocode in the "PATCH handler pseudocode"
section above is the latest design.

### D13.1 — Revoked-contribution guard (privacy bug fix)

**Found by:** bugs reviewer (confidence 82). **Fixed in:** PR 1 implementation.

The original design had a silent privacy bug in the undo flow:

1. User contributes → photo `pending`, contribution `pending`.
2. Curator approves → both flip to `approved`.
3. User revokes → contribution `revoked` (photo stays `approved`).
4. Curator hits Undo → handler fires `mirrorContributionStatus` which has
   `WHERE status != 'revoked'` → 0 rows affected, photo flips to `pending`,
   contribution stays `revoked`.
5. Next decision attempt: `loadPhotoForDecision` was filtering revoked rows
   from its LATERAL join, so the contribution read as `null`. The
   self-approval guard had no contributor to compare against, and the photo
   looked like a fresh direct upload. **A curator could approve a photo whose
   contributor had explicitly revoked consent.**

**Fix applied:**

1. `loadPhotoForDecision` now returns the contribution row regardless of
   status (including `revoked`) and regardless of `file_copied`. Filtering
   moved out of the SQL and into the handler.
2. The LATERAL join uses `FOR UPDATE` to lock the contribution row for the
   duration of the transaction, eliminating the race window between load
   and decide. Concurrent revoke operations block until our transaction
   commits.
3. Two new guards in the PATCH handler fire **before** the self-approval guard
   (consolidated into one `if` block during the simplification pass since both
   return identical 409 payloads):
   - `existing.contribution?.status === 'revoked'` → 409
   - `existing.contribution && !existing.contribution.file_copied` → 409
4. Both guards return 409 with the photo's current status. The web client's
   existing 409 handling (refetch the queue, surface "Photo state has
   changed") covers this case automatically.

**Why 409 and not 403:** the curator isn't forbidden — the _photo's state_ is
incompatible with any decision. 409 also matches the optimistic-concurrency
conflict path, so the web client doesn't need new error handling.

**Tests added:**

- `should return 409 when the contribution was revoked (consent withdrawn)` —
  asserts that **neither** `decidePhoto` nor `mirrorContributionStatus` is
  called when the contribution is revoked. This is the canonical regression
  test for the privacy bug.
- `should return 409 when the contribution file copy never finished` — same
  defense for crash-recovery rows.
- `returns a contribution with status=revoked so the handler can guard on it`
  (queries.test.ts) — asserts `loadPhotoForDecision` no longer hides revoked.
- `uses FOR UPDATE to lock the contribution row` (queries.test.ts) — string
  asserts the SQL contains `FOR UPDATE` so a future refactor can't drop it.

### D13.2 — `dhash` removed from API response (privacy convention fix)

**Found by:** convention reviewer (confidence 100). **Fixed in:** PR 1 impl.

`api-routes.md` rule explicitly states: "`item_photos.dhash` stores a 16-char
hex perceptual hash — internal column, **never returned to clients**." Both
the original plan and the amendment listed `dhash` in the
`PhotoApprovalListResponseSchema` photo object. PR 1 incorrectly selected
`ip.dhash` and exposed it through `PendingPhotoRow.dhash`, the response
schema, and the test fixture.

Removed from: query SELECT, `PendingPhotoRow` interface, `mapPendingPhotoRow`
mapper, schema's `pendingPhotoItemSchema.photo.required`/`properties`, and
the test fixture in `routes.test.ts`.

### D13.3 — 409 schema enum mismatch (TOCTOU edge case)

**Found by:** bugs + convention reviewers (confidence 95).

The original PATCH handler pseudocode had:

```ts
const current = await photoQueries.getPhotoStatus(client, id);
throw new HttpError(409, { error: '...', current_status: current ?? 'unknown' });
```

The 409 response schema declared `current_status` as `enum: ['pending',
'approved', 'rejected']`. Sending `'unknown'` violates the schema and breaks
the web client's Zod parse.

**Fix:** when `getPhotoStatus` returns null (the photo row was deleted
between `loadPhotoForDecision` and the failed UPDATE), throw 404 instead of 409. The 409 path now only fires when the row still exists with a different
status — i.e., a true optimistic-concurrency conflict.

### D13.4 — `can_decide` SQL case-normalization fix

**Found by:** bugs reviewer (confidence 88).

The `can_decide` computation in `listPendingPhotos` originally used:

```sql
(pc.contributed_by IS NULL OR pc.contributed_by::text != LOWER($1::text))
```

The parameter side was lowercased but the DB side wasn't. PostgreSQL UUIDs
output canonical lowercase today, so this was correct in practice — but
inconsistent with the transaction-level guard which lowercases both sides.
Fixed by adding `LOWER()` to both sides:

```sql
(pc.contributed_by IS NULL OR LOWER(pc.contributed_by::text) != LOWER($1::text))
```

### D13.5 — Test non-null assertion guards

**Found by:** simplicity reviewer (confidence 85).

`api-testing.md` rule 26 requires every `x!.field` to have a preceding
`expect(x).toBeDefined()`. Three sites in `routes.test.ts` were missing
the guard. Added `expect(body.photos[0]).toBeDefined()` before each.

### D13.6 — Duplicate count SQL extracted to constant

**Found by:** simplicity reviewer (confidence 90).

The string `SELECT COUNT(*)::int AS count FROM item_photos WHERE status = 'pending'`
appeared inline in both `listPendingPhotos` and `getPendingPhotoCount`.
Extracted to a single `PENDING_COUNT_SQL` constant with a comment explaining
why it's the single source of truth.

### D13.7 — Rate limit constant renames (M2)

**Found by:** simplicity reviewer (confidence 82).

`adminRateLimitRead` was defined in both `admin/routes.ts` (parent plugin)
and `admin/photos/routes.ts` (child plugin) with the same name and value but
different intended scopes. Renamed in the child plugin:

- `adminRateLimitRead` → `pendingQueueRateLimit` (30/min, list endpoint)
- `adminRateLimitCount` → `pendingCountRateLimit` (60/min, count endpoint)
- `photoDecideRateLimit` → unchanged (120/min, PATCH endpoint)

### D13.8 — Misc cleanups during simplification pass

- Merged the two adjacent 409 guards (D13.1) into a single `if` block since
  both branches return identical payloads.
- Extracted `findDataCall()` helper inside `queries.test.ts` to replace 6
  copies of the `mock.calls.find(...)` boilerplate.
- Dropped redundant `::text` cast on `$6` in the `decidePhoto` UPDATE
  (`COALESCE($6::text, visibility)` → `COALESCE($6, visibility)`).
- Added a missing admin-role-inheritance test for `GET /pending-count` to
  match the symmetric test on the other two endpoints.

### Findings rejected after review

- **I2 (`QueryOnlyClient` import path)**: convention reviewer claimed the
  canonical source is `db/pool.ts` per `api-routes.md`. Rejected because
  `db/queries.ts` defines its own narrower `QueryOnlyClient` interface
  specifically to bypass the void-callback overload that breaks vitest mocks
  (the inline comment at `db/queries.ts:25-28` says exactly this), and
  `admin/queries.ts` already imports from `db/queries.ts`. The cited rule
  applies to test mock declarations (`satisfies pool.QueryOnlyClient`), not
  function signature parameter types. Kept the existing import path to match
  established convention.

### Findings deferred (M3, M4)

- **M3 — `test-photos/seed` unauthenticated in staging**: known architectural
  trade-off matching the `test-signin.ts` pattern. If hardening is needed,
  a shared `requireTestHeader` preHandler is the right fix and should land in
  a separate PR that touches both endpoints.
- **M4 — `consent_granted_at` Date-vs-string typing**: project-wide
  convention. Fixing locally would create inconsistency with existing admin
  queries. Belongs in a project-wide audit, not this PR.

## D14 — PR 2 (web UI) design and review

PR 2 implements the curator-facing dashboard against the PR 1 API. Decisions
locked during the second `/feature-dev:feature-dev` cycle:

### D14.1 — Locked design decisions

1. **Admin layout role guard**: relax to `curator | admin`. Page-level
   admin-only guards on `MlStatsPage` and `AdminUsersPage` (render fallback,
   sit above any `useQuery` calls). Sidebar `NAV_ITEMS` becomes role-aware —
   curators see only "Photo Approvals". `/admin` index redirect reads
   `sessionStorage.getItem('trackem:user')` in `beforeLoad` and routes
   `curator → /admin/photos`, `admin → /admin/ml`.
2. **Pending-count badge**: `refetchOnWindowFocus: true` override on the
   count query only. First use of focus-refetch in the codebase. No interval
   timer. `usePendingPhotoCount` lives in `web/src/admin/hooks/` (not
   `admin/photos/`) so the layout import direction stays correct.
3. **Keyboard layer**: `react-hotkeys-hook` for the simple bindings (`A`,
   `T`, `1-6`, `S`, `D`, `Esc`); custom `useRejectChord` adapter for the R-R
   500ms chord. Both gated by a shared `enabled` flag (false when mutation
   in flight, any overlay open, focus in input/textarea, or `can_decide ===
   false` for the decision keys; navigation keys `S/D/?` use a separate
   looser gate). `enableOnFormTags` left at `react-hotkeys-hook`'s default
   `false` to satisfy the input-focus guard for free.
4. **Self-approval**: ineligible photos (`can_decide: false`) are **shown**
   in the queue. ActionBar buttons render disabled with a tooltip ("You
   contributed this photo — another curator must review it"). Decision
   keystrokes are inert. The 403 from PR 1's server-side guard is treated as
   a defensive fallback that surfaces an `ErrorBanner` if it ever fires.
   `can_decide` is read directly from the API response — never re-derived
   client-side.
5. **E2E cleanup**: new `POST /admin/test-photos/cleanup` endpoint (sibling
   of seed) takes `{ item_photo_ids: string[] }` and runs
   `DELETE FROM item_photos WHERE id = ANY($1) AND url LIKE 'test-pending/%'`
   inside `withTransaction` (contributions first, then item_photos). The
   url-prefix guard is mandatory — without it, an unauthenticated cleanup
   endpoint in non-prod could delete arbitrary photos.
6. **Page state**: 4× `useState` (`activeIndex`, `overlayOpen`,
   `rejectOverlayOpen`, `conflictBannerVisible`). No reducer — codebase has
   zero `useReducer` usage and the state machine is shallow enough.
7. **409 conflict handling**: `decidePhoto()` in `admin/photos/api.ts` uses
   `apiFetch` (not `apiFetchJson`) and branches on `response.status === 409`,
   returning a typed `DecideResult` discriminated union. Preserves
   `current_status` in the type system (would otherwise be stripped by
   `ApiErrorSchema`). Mirrors the `gdprPurgeUser` pattern.
8. **Helper extraction**: `isBannerError` and `getMutationErrorMessage`
   move from `web/src/admin/users/types.ts` to a new
   `web/src/admin/lib/api-errors.ts`. PR 2 needs them, so the extraction is
   timing-justified, not speculative. `users/types.ts` re-exports for the
   one existing import site.
9. **Schema location**: append the photo approval section to the existing
   `web/src/lib/zod-schemas.ts` (no sub-file split). Follows every other
   domain's convention.

### D14.2 — Architecture review findings (medium severity)

Four medium findings caught in the self-review pass before implementation:

1. **`activeIndex` clamp on refetch**: when the queue refetches after a
   decision, the new array may be shorter than the previous `activeIndex`.
   `PhotoApprovalPage` runs a `useEffect` on `data` that clamps
   `activeIndex` to `Math.max(0, data.photos.length - 1)` whenever the index
   exceeds the new length.
2. **No auto-advance on success**: the page must NOT increment `activeIndex`
   in the mutation `onSuccess` callback. The refetch implicitly removes the
   decided photo from the array, so the existing `activeIndex` already
   points at what *was* the next photo. Auto-advancing would skip a photo.
3. **409 conflict banner with keyboard gate**: when a 409 fires, render an
   inline `ErrorBanner` ("Photo state has changed — queue refreshed") and
   set `conflictBannerVisible: true` to disable the keyboard. Banner has a
   "Dismiss" button. Without this gate, a 409 in a fast-keyboard workflow
   can cause an unintended decision when the queue refetches and the user's
   next keystroke acts on a different photo than they were looking at.
4. **Cleanup endpoint url-prefix guard**: covered in D14.1 #5 above. The
   `url LIKE 'test-pending/%'` check is mandatory for an unauthenticated
   non-prod endpoint.

### D14.3 — Low-severity decisions applied during implementation

- localStorage key for the keyboard shortcut overlay:
  `trackem:admin:photo-approvals:shortcuts-seen` (matches the project
  `trackem:` namespace prefix from web `CLAUDE.md`).
- Helpers extraction destination: `web/src/admin/lib/api-errors.ts` (more
  specific than `errors.ts`).
- Empty queue state and >200 warning banner are inlined in
  `PhotoApprovalPage` — not extracted to separate components. ~10 lines of
  JSX each, single call site.
- R-R chord state resets on `activeIndex` change (the page calls
  `resetChord()` in S/D navigation handlers).
- Page-level admin guards in `MlStatsPage` and `AdminUsersPage` sit at the
  top of the component, before any `useQuery` calls — prevents data fetches
  before the role check.
- `react-hotkeys-hook` added to `web/package.json` `dependencies` (runtime
  library, ships to production).
- New test scenarios doc: `docs/test-scenarios/E2E_PHOTO_APPROVAL.md`,
  index updated in `docs/test-scenarios/README.md`.

### D14.4 — Out of scope for PR 2

Confirmed deferred to follow-up issues, NOT in PR 2:

- R6: gate `@fastify/static` for pending photo files (separate issue).
- NSFW auto-mod (#71), bulk approve, audit log, file-cleanup background
  job, approval history view.
- Admin-only sidebar reorganization beyond the conditional hide of ML/Users
  for curators.
