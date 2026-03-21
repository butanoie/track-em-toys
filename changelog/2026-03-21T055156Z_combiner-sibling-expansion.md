# Combiner Sibling Expansion — Show All Components on Detail Pages

**Date:** 2026-03-21
**Time:** 05:51:56 UTC
**Type:** Feature
**Phase:** 1.7 Web Catalog UI
**Version:** v0.1.0

## Summary

Expanded combiner relationship display on character detail pages so that viewing a combiner component (e.g., Scrapper) shows all sibling components under the gestalt's name as a clickable heading, rather than just showing the gestalt as a single relationship entry. The current character is included in the list with visually distinct styling. Implements issue #86.

---

## Changes Implemented

### 1. RelationshipSection Interface Extensions

Extended the shared `RelationshipSection` presenter with two additive optional fields:

- `isCurrent?: boolean` on `RelationshipGroupItem` — signals the item represents the currently-viewed character, rendering as a non-interactive `<span>` with `aria-current="true"` and muted styling
- `renderHeading?: () => ReactNode` on `RelationshipGroup` — allows the heading to render as a custom element (e.g., a `<Link>` to the gestalt's page) instead of plain text

**Modified:**

- `web/src/catalog/components/RelationshipSection.tsx` — interface extensions + conditional render logic

### 2. CharacterRelationships Combiner Expansion

Added client-side secondary fetch logic to expand combiner sibling components:

- Detects combiner components via `role === 'gestalt'` in the primary relationships response
- Fires a secondary `useCharacterRelationships` fetch for the gestalt's relationships (suppressed via `enabled` guard when not applicable)
- Replaces the single gestalt entry with the full list of sibling components, sorted alphabetically
- Marks the current character with `isCurrent: true`
- Renders the gestalt's name as a clickable `<Link>` heading
- Falls back to the gestalt-only entry while the secondary fetch loads

**Modified:**

- `web/src/catalog/components/CharacterRelationships.tsx` — secondary fetch, combiner group expansion, `toItem`/`makeCharacterLink` helpers

### 3. Test Coverage

Added 13 new tests across two test files:

- 9 tests in `CharacterRelationships.test.tsx` covering: gestalt heading link, alphabetical sorting, `aria-current` on current character, role display, sibling links, heading replacement, non-combiner group preservation, loading fallback, secondary fetch verification, and gestalt self-view non-regression
- 4 tests in `RelationshipSection.test.tsx` covering: `renderHeading` callback, `isCurrent` styling/aria, role display for current items, and `renderLink` suppression for current items

**Created:**

- `mockComponentRelationships` and `mockGestaltRelationships` fixtures in `catalog-test-helpers.tsx`

**Modified:**

- `web/src/catalog/components/__tests__/CharacterRelationships.test.tsx`
- `web/src/catalog/components/__tests__/RelationshipSection.test.tsx`
- `web/src/catalog/__tests__/catalog-test-helpers.tsx`

### 4. Test Scenarios

Added 7 Gherkin scenarios for the web UI combiner expansion to the existing entity relationships scenario document.

**Modified:**

- `docs/test-scenarios/INT_ENTITY_RELATIONSHIPS.md`
- `docs/test-scenarios/README.md`

---

## Technical Details

### Client-Side Join Pattern

The relationship data model is star-shaped: each combiner component has a single `combiner-component` row pointing to the gestalt. To reconstruct the full team from a component's perspective, the component fires a secondary fetch for the gestalt's relationships, which returns all components as related entities with their body-part roles.

TanStack Query's deduplication ensures multiple component pages for the same gestalt share a single cached fetch. The `staleTime: 60_000` from `useCharacterRelationships` applies to both fetches.

### ARIA Semantics

Used `aria-current="true"` (not `"page"`) because the current item indicator is within a content list, not a navigation landmark. `"page"` is reserved for navigation sets per ARIA 1.1.

---

## Validation & Testing

| Module | Tests | Lint | Typecheck | Format | Build |
|--------|-------|------|-----------|--------|-------|
| API    | ✅ 630 passed | ✅ | ✅ | ✅ | ✅ |
| Web    | ✅ 538 passed | ✅ | ✅ | ✅ | ✅ |

---

## Impact Assessment

- **User experience:** Combiner component pages now show the complete team roster, making it easy to navigate between siblings
- **No API changes:** Purely client-side enhancement using existing endpoints
- **Backward compatible:** `isCurrent` and `renderHeading` are optional fields — `ItemRelationships` and other consumers are unaffected
- **Cache efficient:** Secondary fetches are deduplicated and cached by TanStack Query

---

## Related Files

**Modified:**

- `web/src/catalog/components/CharacterRelationships.tsx`
- `web/src/catalog/components/RelationshipSection.tsx`
- `web/src/catalog/__tests__/catalog-test-helpers.tsx`
- `web/src/catalog/components/__tests__/CharacterRelationships.test.tsx`
- `web/src/catalog/components/__tests__/RelationshipSection.test.tsx`
- `docs/test-scenarios/INT_ENTITY_RELATIONSHIPS.md`
- `docs/test-scenarios/README.md`

---

## Summary Statistics

- 2 production files modified
- 3 test files modified
- 2 documentation files modified
- 13 new tests added (33 total in the 2 test files)
- 7 new Gherkin scenarios
- 0 new production files created

---

## Status

✅ COMPLETE
