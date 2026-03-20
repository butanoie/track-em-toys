# Character Browsing by Continuity — Franchise Hub Toggle & Browse Page

**Date:** 2026-03-19
**Time:** 23:29:01 UTC
**Type:** Feature
**Phase:** 1.7 (Web Catalog Browsing UI)
**Version:** v0.1.0

## Summary

Added character browsing functionality to the catalog, enabling users to browse characters within a franchise organized by continuity family, faction, and sub-group. The franchise hub page now features an Items/Characters toggle, and the character browse page mirrors the existing item browse pattern with a three-column faceted layout.

---

## Changes Implemented

### 1. API — Character Filters & Facets

Added filter support to the existing character list endpoint and a new character facets endpoint for cross-filtered facet counts.

- `GET /catalog/franchises/:franchise/characters` now accepts `continuity_family`, `faction`, `character_type`, and `sub_group` query params
- `GET /catalog/franchises/:franchise/characters/facets` returns cross-filtered counts for factions, character types, and sub-groups
- Sub-group filter uses `EXISTS` subquery (avoids Cartesian products from many-to-many junction table)
- Sub-group facet uses `JOIN` + `COUNT(DISTINCT c.id)` for correct many-to-many counts

**Modified:**

- `api/src/catalog/characters/queries.ts` — Added `CharacterFilters`, `buildCharactersQuery()`, `getCharacterFacets()`; refactored `listCharacters()` to use shared query builder
- `api/src/catalog/characters/schemas.ts` — Added `characterListQuerystring`, `characterFiltersQuerystring`, `getCharacterFacetsSchema`
- `api/src/catalog/characters/routes.ts` — Added filter extraction, `GET /facets` route (registered before `/:slug`)
- `api/src/catalog/characters/routes.test.ts` — Added 6 integration tests for filters and facets

### 2. Web — Character Browse Page

Full three-column browse page mirroring the items browse pattern.

**Created:**

- `web/src/routes/_authenticated/catalog/$franchise/characters/index.tsx` — Route file with Zod search schema
- `web/src/catalog/pages/CharactersPage.tsx` — Page component with facet sidebar, character list, detail panel
- `web/src/catalog/components/CharacterList.tsx` — Accessible listbox with keyboard navigation
- `web/src/catalog/hooks/useCharacters.ts` — TanStack Query hook for character list
- `web/src/catalog/hooks/useCharacterFacets.ts` — TanStack Query hook for character facets

### 3. Web — Franchise Hub Toggle

Items/Characters toggle on the franchise hub page with URL-driven state.

**Modified:**

- `web/src/routes/_authenticated/catalog/$franchise/index.tsx` — Added `view` search param to route schema
- `web/src/catalog/pages/FranchiseHubPage.tsx` — Added view toggle, `ItemsHubView` and `CharactersHubView` sub-components

### 4. Shared — Zod Schemas & API Client

**Modified:**

- `web/src/lib/zod-schemas.ts` — Added `CharacterListItemSchema`, `CharacterListSchema`, `CharacterFacetsSchema` and derived types
- `web/src/catalog/api.ts` — Added `CharacterFilters`, `listCharacters()`, `getCharacterFacets()`; widened `buildFilterParams` type

---

## Technical Details

### Sub-group Facet Pattern

The sub-group facet requires special handling due to the many-to-many `character_sub_groups` junction table:

- **Filtering**: Uses `EXISTS (SELECT 1 FROM character_sub_groups csg JOIN sub_groups sg ON sg.id = csg.sub_group_id WHERE csg.character_id = c.id AND sg.slug = $N)` — avoids row multiplication that would inflate counts
- **Facet counting**: Uses `JOIN character_sub_groups` + `COUNT(DISTINCT c.id)` — the JOIN is needed to access `sg.slug`/`sg.name` for GROUP BY, and DISTINCT prevents over-counting

### URL Structure

- `/catalog/$franchise` — Hub page with `?view=characters` toggle
- `/catalog/$franchise/characters` — Character browse with filters in search params
- `/catalog/$franchise/characters/$slug` — Character detail (pre-existing)

---

## Validation & Testing

### New Tests

- **API**: 6 new integration tests (filter params, combined filters with cursor, facets endpoint, cross-filtering, empty state)
- **Web**: 19 new unit tests (useCharacters hook: 5, useCharacterFacets hook: 5, CharacterList component: 9)

### Full Suite Results

- API: 597 tests passed, lint clean, typecheck clean
- Web: 276 tests passed (37 files), lint clean, typecheck clean, build succeeds

---

## Impact Assessment

- Users can now browse characters by continuity family, faction, character type, and sub-group
- The franchise hub page provides a clear entry point for both item and character exploration
- No database migrations required — uses existing tables and indexes

---

## Related Files

**Created (8):**

- `web/src/routes/_authenticated/catalog/$franchise/characters/index.tsx`
- `web/src/catalog/pages/CharactersPage.tsx`
- `web/src/catalog/components/CharacterList.tsx`
- `web/src/catalog/hooks/useCharacters.ts`
- `web/src/catalog/hooks/useCharacterFacets.ts`
- `web/src/catalog/hooks/__tests__/useCharacters.test.ts`
- `web/src/catalog/hooks/__tests__/useCharacterFacets.test.ts`
- `web/src/catalog/components/__tests__/CharacterList.test.tsx`

**Modified (9):**

- `api/src/catalog/characters/queries.ts`
- `api/src/catalog/characters/schemas.ts`
- `api/src/catalog/characters/routes.ts`
- `api/src/catalog/characters/routes.test.ts`
- `web/src/lib/zod-schemas.ts`
- `web/src/catalog/api.ts`
- `web/src/routes/_authenticated/catalog/$franchise/index.tsx`
- `web/src/catalog/pages/FranchiseHubPage.tsx`

---

## Status

✅ COMPLETE
