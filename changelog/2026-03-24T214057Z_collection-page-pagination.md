# Universal Page-Based Pagination

**Date:** 2026-03-24
**Time:** 23:01:17 UTC
**Type:** Feature
**Phase:** 1.8 Web Collection UI
**Version:** v1.8.2

## Summary

Replaced cursor-based pagination with page/offset pagination across ALL list endpoints — collection, catalog items, characters, manufacturer items, and search. Added a user-configurable per-page size selector (20/50/100) to all browse pages. Renamed the `SearchPagination` component to `Pagination` with a configurable aria-label. Extracted shared pagination constants (`DEFAULT_PAGE_LIMIT`, `pageLimitSchema`, `PAGE_LIMIT_OPTIONS`) and consolidated response schemas via `pageListResponse()` helper.

## Changes Implemented

### API

- **Collection**: `collection/queries.ts`, `schemas.ts`, `routes.ts` — replaced keyset cursor with `LIMIT $4 OFFSET $5`, removed `cursor` param, added `page`/`limit` with enum `[20, 50, 100]`.
- **Catalog items**: `catalog/items/queries.ts`, `schemas.ts`, `routes.ts` — same cursor→offset conversion with dynamic `$N` parameter indexing.
- **Characters**: `catalog/characters/queries.ts`, `schemas.ts`, `routes.ts` — same conversion.
- **Manufacturer items**: `catalog/manufacturers/queries.ts`, `schemas.ts`, `routes.ts` — same conversion.
- **Search**: `catalog/search/schemas.ts` — response schema now uses `pageListResponse(searchResultItem)` instead of inline definition.
- **Shared**: `catalog/shared/schemas.ts` — added `pageListResponse()` helper parallel to `cursorListResponse()`.

### Web

- **`Pagination` component** (renamed from `SearchPagination`): Added `ariaLabel` prop with default `'Pagination'`. File renamed via `git mv`.
- **`PageSizeSelector` component** (new): Shared Radix Select component rendering 20/50/100 options.
- **`pagination-constants.ts`** (new): `PAGE_LIMIT_OPTIONS`, `DEFAULT_PAGE_LIMIT`, `PageLimitOption` type, `pageLimitSchema` (shared Zod validation).
- **All 5 browse pages** (Collection, Items, Characters, ManufacturerItems, Search): Removed `cursorStack` state and prev/next callbacks. Added `Pagination` and `PageSizeSelector`. Filters reset page to 1 on change. Uses `DEFAULT_PAGE_LIMIT` constant instead of magic `20`.
- **4 route schemas**: Collection, items, characters, manufacturer items — all use shared `pageLimitSchema` for limit validation.
- **4 hooks** (`useItems`, `useCharacters`, `useManufacturerItems`, `useSearch`): Replaced `cursor` param with `page`/`limit`, normalized query keys with defaults.
- **Zod schemas**: `CatalogItemListSchema`, `CharacterListSchema`, `CollectionItemListSchema` all changed from `{ next_cursor }` to `{ page, limit }`.

### Tests

- **API integration tests**: Updated assertions across items, characters, manufacturers, and collection route tests. Added page/offset passthrough, invalid limit rejection (400), out-of-bounds page tests.
- **Web component tests**: Updated mock data shapes across all page tests. Added pagination control render tests. Mocked `Pagination` and `PageSizeSelector` in page tests.
- **Hook tests**: Updated `useItems`, `useCharacters`, `useManufacturerItems`, `useSearch` test assertions for page/limit query keys and API call params.
- **E2E tests**: 4 new collection pagination scenarios. Updated catalog browse and detail E2E mocks. Fixed mock route patterns from glob to regex for query string compatibility.

## Technical Details

### Pagination SQL

```sql
-- Before (cursor-based)
AND ($4::text IS NULL OR (i.name, ci.id) > ($4, $5::uuid))
ORDER BY i.name ASC, ci.id ASC
LIMIT $6

-- After (page/offset)
ORDER BY i.name ASC, ci.id ASC
LIMIT $4 OFFSET $5
```

### E2E Mock Pattern Fix

Playwright glob `**/collection` does not match URLs with query strings (`/collection?page=1&limit=20`). Changed to regex: `/\/collection(\?.*)?$/`.

### Response Shape

```json
{
  "data": [...],
  "page": 2,
  "limit": 50,
  "total_count": 243
}
```

## Validation & Testing

- API: 756/756 tests passed, 0 lint warnings
- Web: 685/685 unit tests passed, 0 lint warnings
- E2E: 80/80 passed (1 skipped — pre-existing)
- TypeScript: both API and web build clean

## Impact Assessment

- **UX**: Users can now jump to any page on all browse pages, page state survives browser refresh, consistent pagination with per-page size selector across all paginated views
- **Performance**: Negligible — OFFSET on datasets of thousands of rows with index-backed ORDER BY is fast
- **Breaking**: All list endpoint response shapes changed (`next_cursor` removed, `page`/`limit` added). `cursor` query param replaced by `page`/`limit`. `limit` now restricted to `enum: [20, 50, 100]` on catalog and collection (was `1-100`). No external API consumers exist yet.
- **Dead code**: `cursorListResponse`, `buildCursorPage`, `encodeCursor`, `decodeCursor` in `catalog/shared/pagination.ts` are now unused — can be removed in a cleanup pass

## Summary Statistics

- 55 files changed
- ~650 lines added, ~450 lines removed
- 4 new E2E tests, ~10 new/updated unit tests
- API: 755/755 passed | Web: 684/684 passed | E2E: 80/80 passed

## Status

:white_check_mark: COMPLETE — Closes #107
