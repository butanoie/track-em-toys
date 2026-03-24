# Phase 1.7 — Catalog UI Component Tests

**Date:** 2026-03-20
**Time:** 02:06:58 UTC
**Type:** Test Improvement
**Phase:** 1.7 Web Catalog UI
**Issue:** #66

## Summary

Added comprehensive component-level unit tests for all Phase 1.7 catalog UI components. These components previously only had E2E coverage via Playwright. 251 new tests across 24 test files, plus 1 shared test helper file, bringing the web test suite from 215 to 466 tests.

---

## Changes Implemented

### 1. Shared Test Infrastructure

Created `catalog-test-helpers.tsx` with typed mock fixtures for all catalog Zod schema types and a `createCatalogTestWrapper()` factory matching the existing `admin-test-helpers.tsx` pattern.

**Created:**

- `web/src/catalog/__tests__/catalog-test-helpers.tsx` — Mock fixtures for FranchiseStatsItem, FranchiseDetail, CatalogItem, CatalogItemDetail, CharacterDetail, ManufacturerStatsItem, ManufacturerDetail, facets, and test wrapper factory

### 2. Tier 1 — Pure Presentational Component Tests (12 files)

Components that receive all data via props with no hooks or context dependencies. Only TanStack Router `Link` mock needed where components render links.

**Created:**

- `web/src/catalog/components/__tests__/DetailField.test.tsx` (4 tests)
- `web/src/catalog/components/__tests__/AppearancesTable.test.tsx` (7 tests)
- `web/src/catalog/components/__tests__/ShareLinkButton.test.tsx` (6 tests)
- `web/src/catalog/components/__tests__/DetailPanelShell.test.tsx` (9 tests)
- `web/src/catalog/components/__tests__/FranchiseTileGrid.test.tsx` (6 tests)
- `web/src/catalog/components/__tests__/FranchiseTable.test.tsx` (5 tests)
- `web/src/catalog/components/__tests__/ManufacturerTileGrid.test.tsx` (5 tests)
- `web/src/catalog/components/__tests__/ManufacturerTable.test.tsx` (4 tests)
- `web/src/catalog/components/__tests__/ItemList.test.tsx` (12 tests)
- `web/src/catalog/components/__tests__/FacetSidebar.test.tsx` (8 tests)
- `web/src/catalog/components/__tests__/PhotoGallery.test.tsx` (11 tests)
- `web/src/components/__tests__/MainNav.test.tsx` (5 tests)

### 3. Tier 2 — Content & Panel Component Tests (4 files)

Components that use hooks for data fetching, mocked at the module boundary.

**Created:**

- `web/src/catalog/components/__tests__/CharacterDetailContent.test.tsx` (14 tests)
- `web/src/catalog/components/__tests__/ItemDetailContent.test.tsx` (14 tests)
- `web/src/catalog/components/__tests__/ItemDetailPanel.test.tsx` (6 tests)
- `web/src/catalog/components/__tests__/CharacterDetailPanel.test.tsx` (6 tests)

### 4. Tier 3 — Page Component Tests (8 files)

Full mock stack: hooks, Route file, TanStack Router, AppHeader/MainNav stubs.

**Created:**

- `web/src/catalog/pages/__tests__/FranchiseListPage.test.tsx` (8 tests)
- `web/src/catalog/pages/__tests__/ManufacturerListPage.test.tsx` (7 tests)
- `web/src/catalog/pages/__tests__/FranchiseHubPage.test.tsx` (7 tests)
- `web/src/catalog/pages/__tests__/ManufacturerHubPage.test.tsx` (9 tests)
- `web/src/catalog/pages/__tests__/ItemsPage.test.tsx` (9 tests)
- `web/src/catalog/pages/__tests__/CharactersPage.test.tsx` (7 tests)
- `web/src/catalog/pages/__tests__/ManufacturerItemsPage.test.tsx` (5 tests)
- `web/src/catalog/pages/__tests__/CharacterDetailPage.test.tsx` (6 tests)
- `web/src/catalog/pages/__tests__/ItemDetailPage.test.tsx` (6 tests)

---

## Technical Details

### 3-Tier Mocking Strategy

| Tier                | Provider Needed        | Mock Scope                                                  |
| ------------------- | ---------------------- | ----------------------------------------------------------- |
| Pure presentational | None                   | Link mock only (or none)                                    |
| Content/Panel       | QueryClient for panels | Hook mocks + Link mock                                      |
| Pages               | QueryClient wrapper    | All hooks + Route mock + navigate + AppHeader/MainNav stubs |

### Key Architecture Finding

`AppHeader` has a transitive `useAuth()` → `AuthContext` dependency. All page components import `AppHeader`, meaning page tests crash without `AuthContext`. Resolution: mock `AppHeader` and `MainNav` at module level in page tests.

### CharacterDetailPage Special Case

Uses an inline `useQuery` (not a custom hook) for related items. Mock strategy: mock `listCatalogItems` from `@/catalog/api`, wrap in `createCatalogTestWrapper()` with a real `QueryClient`.

---

## Validation & Testing

```
Test Files  62 passed (62)
Tests       466 passed (466)
Lint:       0 errors
Typecheck:  clean
Format:     clean
Build:      success
```

---

## Summary Statistics

| Metric            | Before | After |
| ----------------- | ------ | ----- |
| Test files        | 38     | 62    |
| Total tests       | 215    | 466   |
| New tests added   | —      | 251   |
| New files created | —      | 25    |

---

## Status

✅ COMPLETE
