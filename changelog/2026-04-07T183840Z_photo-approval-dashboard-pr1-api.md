# Photo Approval Dashboard — PR 1 (API + Migration)

**Date:** 2026-04-07
**Time:** 18:38:40 UTC
**Type:** Feature
**Phase:** 1.9b (Photo Approval Dashboard, GitHub issue #72)
**Version:** v0.1.0

## Summary

Backend implementation of the curator Photo Approval Dashboard. Adds three `/admin/photos/*` endpoints (list pending, count, decide), migration 038 with rejection reason columns, and a non-production test seed endpoint for the upcoming PR 2 E2E suite. Includes a server-side guard against approving photos whose contributors have explicitly revoked consent — a privacy bug caught during the Phase 6 architecture review.

---

## Changes Implemented

### 1. Database Migration

**Created:**

- `api/db/migrations/038_item_photos_rejection_reasons.sql` — adds `rejection_reason_code TEXT` (enum-like CHECK), `rejection_reason_text TEXT`, two cross-field CHECK constraints (`text only when code='other'`, `code only when status='rejected'`), and a partial index `idx_item_photos_pending_created` accelerating the pending queue listing.

### 2. API Endpoints

**Created (under `api/src/admin/photos/`):**

- `queries.ts` — six query functions: `listPendingPhotos`, `getPendingPhotoCount`, `loadPhotoForDecision` (with `FOR UPDATE` lock on the contribution row), `getPhotoStatus`, `decidePhoto`, `mirrorContributionStatus`. Plus row-shape interfaces and the `REJECTION_REASON_CODES` tuple.
- `schemas.ts` — Fastify JSON schemas for all three endpoints, including the 6-code rejection reason enum, the curator decision response shape, and the typed 409 conflict response.
- `routes.ts` — three endpoint handlers (`GET /pending`, `GET /pending-count`, `PATCH /:id/status`) plus the `computeTargetVisibility` and `mapPendingPhotoRow` helpers.

**Modified:**

- `api/src/admin/routes.ts` — registers `adminPhotoRoutes` as a sub-plugin at `/photos`, mounted before any `/:id`-style parameterized routes. Added an inline comment explaining the intentional `requireRole('curator')` despite the `/admin/*` URL prefix.

### 3. Test Seed Endpoint (Non-Production Only)

**Created:**

- `api/src/admin/test-photos.ts` — `POST /admin/test-photos/seed` for the upcoming PR 2 E2E test fixture. Throws at registration in production (defense in depth beyond the conditional dynamic import). Schema-constrains `contributor_email` to `@e2e.test`. Inserts a real `item_photos` + `photo_contributions` row pair for the dashboard to triage.

**Modified:**

- `api/src/server.ts` — registers `testPhotosRoutes` inside the existing non-production block via dynamic import, mirroring the `testSigninRoutes` pattern.

### 4. Tests

**Created:**

- `api/src/admin/photos/queries.test.ts` — 19 unit tests covering SQL shapes, parameter passing, the `loadPhotoForDecision` row mapping (including the new revoked/file_copied fields), and a string assertion that the SQL contains `FOR UPDATE` so a future refactor cannot drop the lock.
- `api/src/admin/photos/routes.test.ts` — 32 integration tests via `fastify.inject()` covering happy paths, 401/403 auth gating, validation 400, semantic 422 (promotion attempt), self-approval 403 with case-insensitive UUID match, optimistic concurrency 409, the new revoked-contribution and crash-recovery 409 guards, the TOCTOU 404 fallback, undo flow, visibility demote, and admin role inheritance for all three endpoints.
- `api/src/admin/test-photos.test.ts` — 6 tests covering schema validation paths plus the production registration guard.

### 5. Documentation

**Created:**

- `docs/plans/Photo_Approval_Dashboard_Plan_Amendment.md` — architecture amendment doc capturing 16 design decisions plus a D13 post-review delta section documenting all 7 review fixes.

**Modified:**

- `docs/plans/Photo_Approval_Dashboard_Plan.md` — added a forward-pointer note at the `mirrorContributionStatus` block warning future readers about the load-time filter trap and pointing to D13.1 in the amendment.
- `.claude/rules/api-database.md` — added a new "Mirroring Status Across Two Tables" section with a 5-step protocol generalizing the C3/I3 lesson for any future status-mirror feature.

---

## Technical Details

### Atomic Decision Flow

The PATCH handler runs six guards in order before touching the database:

1. **Pre-transaction validation** (cross-field rules ajv cannot express): rejection reason required when status is rejected, text only allowed with code=other, visibility=public returns 422.
2. **404 Not Found**: photo row doesn't exist.
3. **409 Revoked Contribution**: the contributor explicitly withdrew consent (load query returns revoked rows so this check is reachable; `FOR UPDATE` lock prevents concurrent revoke from racing through).
4. **409 Crash Recovery**: the contribution row exists but `file_copied = false` (Phase 1.6 partial-copy state).
5. **403 Self-Approval**: the curator is the original contributor (case-insensitive UUID comparison).
6. **409 Optimistic Concurrency**: `expected_status` mismatch on the UPDATE.

After the guards, the atomic dual-table flip runs inside `withTransaction`:

```sql
UPDATE item_photos
SET status                = $1,
    rejection_reason_code = $2,
    rejection_reason_text = $3,
    visibility            = COALESCE($6, visibility),
    updated_at            = NOW()
WHERE id = $4
  AND ($5::text IS NULL OR status = $5::text)
RETURNING ...;

UPDATE photo_contributions
SET status = $1, updated_at = NOW()
WHERE item_photo_id = $2 AND status != 'revoked';
```

### Privacy Bug Fix (D13.1 — caught in Phase 6 review)

The original design filtered `status != 'revoked'` on **both** the load query (`loadPhotoForDecision`) and the mirror UPDATE (`mirrorContributionStatus`). A curator could:

1. Approve a contributed photo.
2. The contributor revokes their contribution (status → `revoked`).
3. The curator hits Undo → the mirror UPDATE silently no-ops (0 rows affected because the row is now `revoked`).
4. `item_photos` flips back to `pending` while `photo_contributions` stays `revoked`.
5. On the next decision attempt, the load query filters the revoked row → `contribution = null` → self-approval guard has no contributor to compare against → **a curator can approve a photo whose contributor revoked consent**.

Fixed by:

- Removing the `status != 'revoked' AND file_copied = true` filter from `loadPhotoForDecision` so revoked rows are visible to the handler.
- Adding `FOR UPDATE` to the LATERAL join on `photo_contributions` to lock the row for the duration of the transaction.
- Adding two new explicit 409 guards in the handler that fire **before** the self-approval guard and refuse any decision when the contribution is in a `revoked` or `file_copied = false` state.

### Rate Limits

- `pendingQueueRateLimit` (30/min) — list endpoint
- `pendingCountRateLimit` (60/min) — count endpoint, hit on every admin page nav
- `photoDecideRateLimit` (120/min) — PATCH endpoint, sized for keyboard-driven triage at ~1-2 decisions/sec sustained

### `can_decide` Server-Side Computation

Computed in the SQL via:

```sql
(pc.contributed_by IS NULL OR LOWER(pc.contributed_by::text) != LOWER($1::text)) AS can_decide
```

Both sides lowercased so the result is consistent with the transaction-level self-approval guard, even if a UUID is ever stored in mixed case.

---

## Validation & Testing

### Test Results

```
Test Files  48 passed | 1 skipped (49)
Tests       899 passed | 42 skipped (941)
```

**Net new tests for PR 1: 57** (32 integration + 19 query unit + 6 test-photos schema).

### Verification Gate

| Check                        | Status                                   |
| ---------------------------- | ---------------------------------------- |
| `npm run typecheck`          | ✅ clean (0 errors)                      |
| `npm test` (vitest + eslint) | ✅ 899 passed, 0 failed, 0 lint warnings |
| `npm run build`              | ✅ clean                                 |

### Code Review Findings

3 parallel code-reviewer agents in Phase 6 caught 7 actionable issues:

- **3 critical** (all fixed): `dhash` exposed in API response; 409 sent `'unknown'` outside schema enum; revoke-mid-undo race allowed approving photos whose contributors revoked consent.
- **4 important** (all fixed): `can_decide` SQL case normalization; non-null assertions missing preceding `expect`; duplicate count SQL constant; rate limit constant rename.
- **1 important rejected**: convention reviewer suggested importing `QueryOnlyClient` from `db/pool.ts`, but the existing `admin/queries.ts` pattern uses `db/queries.ts` (which has a hand-rolled interface specifically to bypass the void-callback overload that breaks vitest mocks).
- **5 minor** (3 applied during simplification, 2 deferred): admin role-inheritance test for `pending-count` added (M1), rate limit constant rename (M2), redundant `::text` cast dropped (M5), staging exposure of test-seed endpoint deferred (M3, matches existing `test-signin.ts` pattern), `Date | string` typing deferred (M4, project-wide convention).

---

## Impact Assessment

### Unblocks

- **PR 2 (web UI)** — the next work cycle for Phase 1.9b. Stable API contracts (`can_decide`, the 6 reason codes, the visibility semantics, the 409 conflict shape) are now tested and ready to consume.
- **#72 Photo Approval Dashboard** — the GitHub issue this work addresses. PR 2 will reference `Closes #72`.

### Does Not Affect

- The public catalog photo list (`listPhotos` query) is unchanged. Catalog readers continue to see only `status='approved' AND visibility='public'` photos.
- The user collection photo flow is unchanged. Contributing a photo still creates `photo_contributions.status='pending'` rows that the dashboard now triages.
- The existing admin user-management endpoints are unchanged. The new sub-plugin is mounted alongside them with no shared state.

### Privacy / Consent Posture

- Contributors who revoke their contribution **cannot** have their photo silently re-approved by an undo flow (closes the D13.1 privacy bug).
- The `dhash` perceptual hash is no longer exposed in the API response (closes the D13.2 convention violation).

---

## Related Files

### Created (10)

- `api/db/migrations/038_item_photos_rejection_reasons.sql`
- `api/src/admin/photos/queries.ts`
- `api/src/admin/photos/queries.test.ts`
- `api/src/admin/photos/schemas.ts`
- `api/src/admin/photos/routes.ts`
- `api/src/admin/photos/routes.test.ts`
- `api/src/admin/test-photos.ts`
- `api/src/admin/test-photos.test.ts`
- `docs/plans/Photo_Approval_Dashboard_Plan_Amendment.md`
- `changelog/2026-04-07T183840Z_photo-approval-dashboard-pr1-api.md` (this file)

### Modified (4)

- `api/src/admin/routes.ts` (sub-plugin registration + intentional curator-role comment)
- `api/src/server.ts` (test-photos dynamic import in non-prod block)
- `docs/plans/Photo_Approval_Dashboard_Plan.md` (D13.1 forward-pointer note)
- `.claude/rules/api-database.md` (new "Mirroring Status Across Two Tables" rule)

---

## Status

✅ **COMPLETE** — PR 1 is functionally and documentationally ready to ship.

## Next Steps

1. **Open PR 1** with `Closes #72` deferred to PR 2 (the web UI). Link to project board per `.claude/rules/pr-project-linking.md`.
2. **File the R6 follow-up issue** before merge — "Gate pending photo file access (`@fastify/static` serves pending files publicly by URL)" per amendment D11.
3. **PR 2** — separate work cycle: admin route, page components, `usePhotoApprovalKeyboard` adapter (using `react-hotkeys-hook`), nav notification dot, mutation hooks, Zod schemas, unit + Playwright E2E tests. Re-runs phases 5–11 against the web codebase.

## References

- **Architecture amendment**: `docs/plans/Photo_Approval_Dashboard_Plan_Amendment.md` — 16 decisions + D13 post-review delta
- **Base plan**: `docs/plans/Photo_Approval_Dashboard_Plan.md` — original design of record (with D13.1 forward-pointer)
- **Generalized rule**: `.claude/rules/api-database.md` — "Mirroring Status Across Two Tables" section
- **GitHub issue**: #72 (deferred to PR 2 for closing reference)
- **Predecessor**: PR #149 (Phase 1.6 amendment #148, commit b89c743) — added the `photo_contributions.intent` and `item_photos.visibility` columns this PR builds on
