# Fix: Search misses third-party items with alternative character names

**Date:** 2026-03-19
**Time:** 18:38:00 UTC
**Type:** Bug Fix
**Phase:** 1.7 (Web Catalog Browsing UI)
**Version:** v0.7.4

## Summary

Fixed a search bug where third-party items using alternative names (e.g., Fans Toys "Sovereign" for Galvatron) were not returned when searching by character name. The item FTS `search_vector` only indexed `name || description || product_code || sku`, missing the linked character's name entirely.

## Changes Implemented

- Modified the item UNION branch's WHERE clause to also match on the character's `search_vector`: `(i.search_vector @@ tsquery OR ch.search_vector @@ tsquery)`
- Updated item ranking to use `GREATEST(ts_rank(i.search_vector, ...), ts_rank(ch.search_vector, ...))` so items matched via character name rank equally
- Updated the count query with the same `JOIN characters` and OR condition to keep counts accurate
- Added regression test verifying third-party items are returned when searching by character name

## Technical Details

Query-time fix using bitmap OR of two GIN index scans. No migration needed — the `characters.search_vector` GIN index already exists (migration 018). The `characters` JOIN already existed in the enriched query from Slice 3.

## Validation & Testing

- API: 589 tests passed (1 new regression test)
- Web: 252 unit tests passed, 36 E2E tests passed
- All checks green: lint, typecheck, format, build

## Related Files

### Modified

- `api/src/catalog/search/queries.ts` — WHERE clause, GREATEST rank, count query
- `api/src/catalog/search/routes.test.ts` — regression test for character-name matching

## Status

✅ COMPLETE
