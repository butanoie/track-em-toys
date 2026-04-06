# Search Aliases for Acronyms and Alternate Names

**Date:** 2026-04-02
**Time:** 19:46:35 UTC
**Type:** Feature
**Phase:** 5.0 Polish & Expansion
**Version:** v0.1.0

## Summary

Added `search_aliases TEXT` column to `characters` and `items` tables, included in the `search_vector` generated column expression. This enables full-text search to match acronym expansions (H.I.S.S. -> "hiss"), nicknames ("Convoy" for Optimus Prime), and alternate names without any query-side changes. Resolves issue #126.

---

## Changes Implemented

### 1. Database Migration (035)

Added `search_aliases TEXT` nullable column to both `characters` and `items` tables. Rebuilt the `search_vector GENERATED ALWAYS AS ... STORED` columns to include `COALESCE(search_aliases, '')` in the tsvector expression. GIN indexes dropped and recreated. Full `migrate:down` reversal included.

**Created:**

- `api/db/migrations/035_search_aliases.sql` — migration with up/down for both tables

### 2. Seed Data Pipeline

Threaded `search_aliases` through the complete seed data pipeline: types, ingest, and bidirectional sync (push and pull).

**Modified:**

- `api/db/seed/seed-types.ts` — added `search_aliases?: string | null` to `CharacterRecord` and `ItemRecord`
- `api/db/seed/ingest.ts` — added `search_aliases` to character and item INSERT/ON CONFLICT ($10 parameter)
- `api/db/seed/sync.ts` — added to push INSERT/ON CONFLICT, pull SELECT queries, and pull record reconstruction for both entities

### 3. Sample Data

Added example aliases to sample seed characters for development and testing.

**Modified:**

- `api/db/seed/sample/characters/sample-characters.json` — Optimus Prime: "convoy", Bumblebee: "goldbug"

### 4. TypeScript Types

**Modified:**

- `api/src/types/index.ts` — added `search_aliases: string | null` to `Character` and `Item` interfaces

### 5. Tests

**Modified:**

- `api/src/catalog/search/queries.test.ts` — 2 new unit tests for acronym collapsing (H.I.S.S. -> hiss, H.I.S.S. Tank -> hiss tank)
- `api/src/catalog/search/routes.test.ts` — 1 new integration test for alias-based search + fixed pre-existing missing `continuity_family` mock fields

---

## Technical Details

### Why DROP + re-ADD for search_vector

PostgreSQL does not support `ALTER COLUMN` on `GENERATED ALWAYS AS` columns. The only way to change the expression is to drop the column (and its GIN index) and recreate both.

### Column Design: TEXT vs TEXT[]

Chose `TEXT` (space-separated terms) over `TEXT[]` (array) because `to_tsvector('simple', ...)` naturally tokenizes space-separated words. An array would require `array_to_string()` in the generated expression for no benefit.

### Zero Query Changes

The `search_vector @@ to_tsquery('simple', ...)` queries in `search/queries.ts` and `ml-export/queries.ts` work unchanged because they operate on the stored generated column, not the expression.

---

## Validation & Testing

| Check           | Result                 |
| --------------- | ---------------------- |
| API Tests       | 809 passed, 42 skipped |
| API Lint        | 0 warnings             |
| API Typecheck   | Clean (main + seed)    |
| API Build       | Clean                  |
| Web Tests       | 758 passed             |
| Web Lint        | Clean                  |
| Web Typecheck   | Clean                  |
| Web Build       | Clean                  |
| Seed Validation | 66 passed              |

---

## Impact Assessment

- Unblocks search for punctuated acronyms in G.I. Joe seed data (H.I.S.S., V.A.M.P., A.W.E. Striker, etc.)
- Enables nickname/alternate name search for any character or item
- No API response changes — `search_aliases` is internal only
- No breaking changes to existing search behavior

---

## Related Files

**Created:** `api/db/migrations/035_search_aliases.sql`
**Modified:** `api/db/seed/seed-types.ts`, `api/db/seed/ingest.ts`, `api/db/seed/sync.ts`, `api/db/seed/sample/characters/sample-characters.json`, `api/src/types/index.ts`, `api/src/catalog/search/queries.test.ts`, `api/src/catalog/search/routes.test.ts`

---

## Next Steps

- Add `search_aliases` to real seed data in the private repo for G.I. Joe acronym vehicles
- Run migration 035 on the development database
- Consider character nicknames (e.g., "Baroness" for Anastasia DeCobray)

---

## Status

COMPLETE
