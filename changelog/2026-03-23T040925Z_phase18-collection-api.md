# Phase 1.8 — Personal Collection API (Slice 1: DB + API)

**Date:** 2026-03-23
**Time:** 04:09:25 UTC
**Type:** Feature
**Phase:** 1.8 Collection
**Version:** v0.1.0

## Summary

Implemented the first RLS-protected feature in the app — a personal collection API that lets authenticated users add catalog items to their collection, track condition and notes per physical copy, and manage entries with soft delete + restore. This covers issues #101 (DB schema) and #102 (API endpoints) under epic #100.

---

## Changes Implemented

### 1. Database Schema (Migration 028)

Created `item_condition` PostgreSQL ENUM (7 values: mint_sealed, opened_complete, opened_incomplete, loose_complete, loose_incomplete, damaged, unknown) and `collection_items` table with RLS.

Key design decisions:
- No UNIQUE(user_id, item_id) — multiple copies of the same item allowed
- Soft delete via `deleted_at` column
- `FORCE ROW LEVEL SECURITY` — even the table owner is subject to policies
- Partial indexes on `WHERE deleted_at IS NULL` for efficient active-only queries
- ON DELETE RESTRICT on both FKs (tombstone pattern)

**Created:**
- `api/db/migrations/028_collection_items.sql`

### 2. Collection API Module

8 endpoints under `/collection`, all requiring authentication and using `withTransaction` for RLS context:

| Method | Path | Description |
|--------|------|-------------|
| GET | /collection | List with franchise/condition/FTS search filters + cursor pagination |
| POST | /collection | Add catalog item to collection |
| GET | /collection/stats | Summary stats (total_copies, unique_items, by_franchise, by_condition) |
| GET | /collection/check | Batch check which item_ids are in collection (max 50) |
| GET | /collection/:id | Get single entry (404 if soft-deleted) |
| PATCH | /collection/:id | Update condition/notes (404 if soft-deleted, FOR UPDATE locking) |
| DELETE | /collection/:id | Soft-delete (set deleted_at) |
| POST | /collection/:id/restore | Restore (idempotent: 200 if already active) |

**Created:**
- `api/src/collection/schemas.ts` — Fastify JSON schemas for all endpoints
- `api/src/collection/queries.ts` — All SQL queries with typed row interfaces
- `api/src/collection/routes.ts` — Route handlers with Content-Type enforcement
- `api/src/collection/routes.test.ts` — 48 integration tests

**Modified:**
- `api/src/types/index.ts` — Added `ItemCondition` type, `CollectionItem` interface
- `api/src/server.ts` — Registered collection routes at `/collection` prefix

---

## Technical Details

### RLS Pattern (First Usage)

All collection queries use `withTransaction(fn, request.user.sub)` which sets the `app.user_id` PostgreSQL session variable. RLS policies on `collection_items` enforce that users can only see and modify their own rows. This is the first module to use RLS — catalog routes use `pool.query()` directly (no RLS), and admin routes use `withTransaction` but on non-RLS tables.

### Stats Query — Single CTE

Stats use a single CTE query for snapshot consistency at READ COMMITTED isolation:
```sql
WITH active AS (
  SELECT ci.item_id, ci.condition, i.franchise_id
  FROM collection_items ci JOIN items i ON i.id = ci.item_id
  WHERE ci.deleted_at IS NULL
)
SELECT (SELECT COUNT(*)::int FROM active) AS total_copies, ...
```

### FOR UPDATE Locking

PATCH and DELETE handlers use `SELECT ... FOR UPDATE` on the collection item before mutation to prevent TOCTOU races between concurrent PATCH/DELETE requests.

### Search

Uses existing `items.search_vector` (STORED generated tsvector column) via `websearch_to_tsquery('simple', $N)` — leverages existing FTS infrastructure for word-order-independent search.

---

## Validation & Testing

### Test Results

```
Test Files  34 passed | 1 skipped (35)
Tests       704 passed | 42 skipped (746)
```

48 new tests covering:
- Happy paths for all 8 endpoints
- 401 (no auth), 403 (role check), 400 (validation), 404 (not found)
- Soft-delete visibility, idempotent restore
- RLS cross-user isolation (user B sees 404 for user A's items)
- Content-Type enforcement (415)
- Multiple copies of same item
- Empty body guard on PATCH
- Update failure rowCount check

### All Checks Pass

| Check | Result |
|-------|--------|
| API Tests + Lint | ✅ 704 passed |
| API Typecheck | ✅ |
| API Format | ✅ |
| API Build | ✅ |
| Web Tests | ✅ 592 passed |
| Web Lint | ✅ |
| Web Typecheck | ✅ |
| Web Format | ✅ |
| Web Build | ✅ |

---

## Impact Assessment

- First RLS-protected feature establishes patterns for all future user-private data
- Collection API is immediately usable by the Web UI (Phase 1.8 Web, issue #103)
- No breaking changes to existing catalog or admin endpoints
- No changes to web module (Web UI deferred to separate session with /frontend-design)

---

## Related Files

**Created:**
- `api/db/migrations/028_collection_items.sql`
- `api/src/collection/schemas.ts`
- `api/src/collection/queries.ts`
- `api/src/collection/routes.ts`
- `api/src/collection/routes.test.ts`

**Modified:**
- `api/src/types/index.ts`
- `api/src/server.ts`
- `api/db/schema.sql` (auto-generated by dbmate)

---

## Next Steps

1. Run `/frontend-design` for collection Web UI design
2. Implement Web UI via `/feature-dev` (issue #103)
3. E2E tests (issue #104)
4. Update GH project board: #101 → Done, #102 → Done

---

## Status

✅ COMPLETE — DB schema and API endpoints implemented and tested
