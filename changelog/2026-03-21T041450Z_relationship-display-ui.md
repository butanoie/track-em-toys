# Relationship Display UI — Character & Item Detail Pages

**Date:** 2026-03-21
**Time:** 04:14:50 UTC
**Type:** Feature
**Phase:** 1.7 (Web Catalog Browsing UI)
**Version:** v0.1.0
**GitHub Issue:** #85

## Summary

Wired the existing relationship API endpoints into the web UI, displaying character-to-character and item-to-item relationships on both detail pages and sidebar panels. Implemented a three-layer clean architecture: pure utility module, generic renderer component, and entity-specific integration components that own their own data fetch.

---

## Changes Implemented

### 1. Pure Utility Module

Created `web/src/catalog/lib/relationship-utils.ts` with four exported functions for data transformation — no React dependencies, independently unit-testable.

- `formatRelationshipType()` — converts type slugs to human-readable headings (e.g., `combiner-component` → "Combiner Components")
- `isRedundantCharacterRole()` — detects redundant roles for symmetric types (`rival`, `sibling`) where the role matches the type name
- `groupByType()` — groups relationship arrays by type, preserving insertion order
- `getGroupSubtype()` — detects uniform subtypes across a group for badge placement

### 2. Generic Display Component

Created `web/src/catalog/components/RelationshipSection.tsx` — a router-agnostic renderer that accepts pre-grouped data with `renderLink` callbacks. Self-guards per-item subtype badges when a group-level badge is shown.

### 3. Integration Components

Created `CharacterRelationships.tsx` and `ItemRelationships.tsx` — each owns its own TanStack Query fetch, transforms data using utilities, and renders via `RelationshipSection`. Embedded directly in content components; no prop threading through panels required.

### 4. TanStack Query Hooks

Created `useCharacterRelationships` and `useItemRelationships` hooks following the established pattern: `enabled` guard on `slug !== undefined && franchise !== ''`, 60s staleTime.

### 5. API Layer

Added `getCharacterRelationships()` and `getItemRelationships()` to `web/src/catalog/api.ts` using existing `apiFetchJson` + Zod schema validation pattern.

### 6. Wiring

- `CharacterDetailContent.tsx` — embedded `<CharacterRelationships />` between Sub-Groups and Appearances sections
- `ItemDetailContent.tsx` — embedded `<ItemRelationships />` after the description list

**Created:**

- `web/src/catalog/lib/relationship-utils.ts`
- `web/src/catalog/components/RelationshipSection.tsx`
- `web/src/catalog/components/CharacterRelationships.tsx`
- `web/src/catalog/components/ItemRelationships.tsx`
- `web/src/catalog/hooks/useCharacterRelationships.ts`
- `web/src/catalog/hooks/useItemRelationships.ts`
- `web/src/catalog/lib/__tests__/relationship-utils.test.ts`
- `web/src/catalog/components/__tests__/RelationshipSection.test.tsx`
- `web/src/catalog/components/__tests__/CharacterRelationships.test.tsx`
- `web/src/catalog/components/__tests__/ItemRelationships.test.tsx`
- `web/src/catalog/hooks/__tests__/useCharacterRelationships.test.ts`
- `web/src/catalog/hooks/__tests__/useItemRelationships.test.ts`
- `docs/decisions/ADR_Relationship_Display_UI.md`

**Modified:**

- `web/src/catalog/api.ts` — added 2 relationship fetch functions + imports
- `web/src/catalog/components/CharacterDetailContent.tsx` — embedded CharacterRelationships
- `web/src/catalog/components/ItemDetailContent.tsx` — embedded ItemRelationships
- `web/src/catalog/__tests__/catalog-test-helpers.tsx` — added relationship mock fixtures
- `web/src/catalog/components/__tests__/CharacterDetailContent.test.tsx` — added vi.mock
- `web/src/catalog/components/__tests__/ItemDetailContent.test.tsx` — added vi.mock
- `web/src/catalog/components/__tests__/CharacterDetailPanel.test.tsx` — added vi.mock
- `web/src/catalog/components/__tests__/ItemDetailPanel.test.tsx` — added vi.mock
- `web/src/catalog/pages/__tests__/ItemDetailPage.test.tsx` — added vi.mock

---

## Technical Details

### Relationship Types

Character: combiner-component, partner-bond, vehicle-crew, rival, sibling, mentor-student, evolution
Item: mold-origin, gift-set-contents, variant

### Symmetric Role Detection

Only character types `rival` and `sibling` are symmetric. Item relationships have NO symmetric types — `variant` uses `base`/`variant` asymmetric roles. Symmetric role omission: when `role === type` (e.g., `role: "rival"` under `type: "rival"`), the role is suppressed as redundant under the group heading.

### Subtype Badge Logic

- Uniform subtype across group → single Badge on heading
- Mixed subtypes → per-item Badges
- `RelationshipSection` self-guards: `!group.groupSubtype && item.subtype`

### Query Key Structure

- `['catalog', 'characters', franchise, slug, 'relationships']`
- `['catalog', 'items', franchise, slug, 'relationships']`

Appends `'relationships'` as a fifth segment — no collision with detail keys.

---

## Validation & Testing

### Test Results

```
Test Files  68 passed (68)
Tests  523 passed (523)
```

50 new tests across 6 new test files + 2 new tests in modified files.

### Quality Checks

| Check | Result |
|-------|--------|
| Unit tests | ✅ 523 passing |
| ESLint | ✅ 0 errors |
| TypeScript | ✅ 0 errors |
| Prettier | ✅ All formatted |
| Build | ✅ Clean |

---

## Impact Assessment

- Collectors can now see character relationships (combiners, partner bonds, rivalries, etc.) and item relationships (mold origins, variants) directly on detail pages
- Both sidebar panels and full detail pages show relationships — no prop threading needed
- Integration components fetch independently, enabling future reuse in other views

---

## Summary Statistics

- 12 new files created
- 9 existing files modified
- 50 new tests added (523 total)
- 3-layer architecture: utils → renderer → integration
- 0 new npm dependencies

---

## Status

✅ COMPLETE
