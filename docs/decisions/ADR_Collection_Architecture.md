# ADR: Personal Collection Architecture (Phase 1.8)

**Date:** 2026-03-23
**Status:** Accepted
**Issue:** [#100 — Phase 1.8: Personal Collection (Slice 1)](https://github.com/butanoie/track-em-toys/issues/100)

---

## Context

The app needs personal collection tracking — the core value proposition for collectors. Users add catalog items to their collection, tracking condition and notes per physical copy. This is the first user-private, RLS-protected feature in the app.

### Key Requirements

- Users can own **multiple copies** of the same catalog item (different conditions)
- Each copy tracks **condition** (7-value enum) and **notes** (free text)
- **Soft delete** with restore — collectors don't want accidental permanent deletion
- **RLS isolation** — users can only see their own collection data
- API supports the future Web UI: list with filters, batch-check for catalog integration, stats for dashboard

### Constraints

- All user FKs use `ON DELETE RESTRICT` (GDPR tombstone pattern — user rows are never hard-deleted)
- First RLS-protected table — establishes patterns for all future user-private data
- Must integrate with existing catalog infrastructure (items, franchises, photos, FTS)

---

## Decision: One Row Per Physical Copy with RLS

### Data Model

```
collection_items
├── id (UUID PK)
├── user_id (FK → users, ON DELETE RESTRICT)
├── item_id (FK → items, ON DELETE RESTRICT)
├── condition (item_condition ENUM)
├── notes (TEXT, app-enforced 2000 char limit)
├── deleted_at (TIMESTAMPTZ, soft-delete marker)
├── created_at
└── updated_at
```

**No UNIQUE(user_id, item_id)** — collectors often own multiple copies of the same item in different conditions. Each row represents one physical copy.

**No quantity column** — instead of "3 mint_sealed", the user has 3 separate rows. This avoids the complexity of per-unit condition tracking within a single row.

### Alternatives Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| UNIQUE + quantity | Simpler count, fewer rows | Can't track per-copy condition/notes | Rejected |
| UNIQUE + separate units table | Per-unit tracking | Extra table, complex queries | Rejected |
| One row per copy (chosen) | Per-copy condition/notes, simple queries | More rows for bulk collectors | **Accepted** |

### Condition Enum

7 values chosen to distinguish **packaging status** (opened vs loose) from **completeness**:

| Value | Packaging | Parts |
|-------|-----------|-------|
| `mint_sealed` | Factory sealed | N/A |
| `opened_complete` | Retained | All present |
| `opened_incomplete` | Retained | Missing parts |
| `loose_complete` | No packaging | All present |
| `loose_incomplete` | No packaging | Missing parts |
| `damaged` | N/A | Significant damage |
| `unknown` | N/A | Not assessed (default) |

The "opened" vs "loose" distinction matters to collectors: an opened figure with its original box is worth significantly more than a loose one.

---

## RLS Pattern

### First RLS-Protected Table

`collection_items` establishes the RLS pattern for all future user-private tables:

1. **`ENABLE ROW LEVEL SECURITY`** — activates policies for non-owner connections
2. **`FORCE ROW LEVEL SECURITY`** — ensures even the table owner (migration runner) is subject to policies
3. **Four policies** (SELECT, INSERT, UPDATE, DELETE) all using `(SELECT current_app_user_id())` wrapper for initPlan caching
4. **All queries use `withTransaction(fn, request.user.sub)`** — reads AND writes — to set the `app.user_id` session variable

### Why withTransaction for Reads

Catalog reads use `pool.query()` directly (no transaction, no RLS context). Collection reads need RLS, which requires the `app.user_id` session variable. `withTransaction` is the only existing mechanism that sets this variable. The ~0.2ms overhead from BEGIN/COMMIT on reads is negligible.

A lightweight `withRlsContext` alternative was considered and rejected — it would introduce a new abstraction for marginal performance gain. `withTransaction` is simple, consistent, and well-tested.

### Cross-User Access

RLS makes other users' rows invisible (returns 0 rows, not a permission error). This means cross-user access attempts receive **404**, not **403** — no information leakage about whether the item exists.

---

## Soft Delete

### Design

- `deleted_at TIMESTAMPTZ` column — `NULL` means active, non-NULL means soft-deleted
- `DELETE /collection/:id` sets `deleted_at = now()` (UPDATE, not SQL DELETE)
- `POST /collection/:id/restore` clears `deleted_at` (idempotent — returns 200 if already active)
- All list/stats/check queries filter `WHERE deleted_at IS NULL`
- GET/PATCH on soft-deleted items return 404 (restore first, then edit)
- Hard purge of expired soft-deleted items deferred to a future cleanup job

### Why Soft Delete

Collectors accumulate items over years. Accidental permanent deletion would be devastating. Soft delete with restore provides a safety net. The `deleted_at` column also supports future "recently removed" UI features.

### Partial Indexes

Indexes use `WHERE deleted_at IS NULL` to keep the active-item index small and match the actual query patterns:

```sql
CREATE INDEX idx_collection_items_user_active ON collection_items (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_collection_items_user_item ON collection_items (user_id, item_id) WHERE deleted_at IS NULL;
```

---

## API Design

### Module Structure

```
api/src/collection/
  routes.ts      — Plugin with 8 route handlers + Content-Type enforcement
  queries.ts     — All SQL (receives PoolClient, never imports pool)
  schemas.ts     — Fastify JSON schemas
  routes.test.ts — 48 integration tests
```

Registered as a top-level module at `/collection` (parallel to `/catalog`, `/admin`, `/auth`).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /collection | List with franchise/condition/FTS filters + cursor pagination |
| POST | /collection | Add catalog item (multiple copies allowed) |
| GET | /collection/stats | Single CTE: total_copies, unique_items, by_franchise, by_condition |
| GET | /collection/check | Batch check item_ids (max 50) — used by catalog UI |
| GET | /collection/:id | Single entry (404 if soft-deleted) |
| PATCH | /collection/:id | Update condition/notes (FOR UPDATE locking) |
| DELETE | /collection/:id | Soft-delete |
| POST | /collection/:id/restore | Restore (idempotent for active items) |

### Key API Decisions

1. **Stats: single CTE query** — not 3 separate queries. PostgreSQL's `READ COMMITTED` isolation means each statement in a transaction sees a different snapshot. A single CTE guarantees `total_copies == sum(by_condition[].count)`.

2. **PATCH/DELETE: FOR UPDATE locking** — `lockCollectionItem` acquires a row lock before mutation to prevent TOCTOU races (e.g., PATCH updating a row that DELETE has already soft-deleted).

3. **PATCH notes detection: `Object.hasOwn(body, 'notes')`** — distinguishes "notes key absent" (don't change) from `{ notes: null }` (clear notes). Fastify's `additionalProperties: false` strips absent keys, so `body.notes === undefined` is unreliable.

4. **Check endpoint: comma-separated UUIDs** — validated pre-transaction with UUID regex and max-50 limit. Empty strings from trailing commas are filtered out.

5. **Search: FTS via `items.search_vector`** — leverages existing STORED generated column. Word-order independent, supports stemming. `websearch_to_tsquery('simple', $N)`.

6. **Cursor: `(i.name, ci.id)`** — item name for sort order, collection entry UUID for tiebreaker. Aliased as `name`/`id` for `buildCursorPage` compatibility.

---

## Future Slices (Not Yet Implemented)

| Slice | Phase | Description |
|-------|-------|-------------|
| Web UI | 1.8 | Collection page, add-to-collection button, filters |
| E2E Tests | 1.8 | Playwright tests for collection flows |
| Purchase Price | 3.0 | Price paid, current value tracking |
| CSV Import | 1.10 | Bulk import from spreadsheet |
| Reporting | 1.11 | Collection value reports, stats |
| User Collection Photos | Future | Private photos per collection entry (separate from catalog photos) |
| Tags | Future | Custom labels/categories for organizing |

---

## Revision History

- **2026-03-23:** Initial — Slice 1 (DB + API) accepted and implemented
