# Component Characters for Combined Forms

**Date:** 2026-03-19
**Time:** 22:43:31 UTC
**Type:** Bug Fix
**Phase:** 1.7 Web Catalog Browsing UI
**Issue:** #65

## Summary

Added component character listing to combined form (gestalt) character detail pages. Previously, component characters like Mixmaster linked up to their combined form (Devastator), but the reverse relationship was not displayed. Devastator's page now shows all its component characters with names, combiner roles, and alt-modes.

---

## Changes Implemented

### 1. API: Conditional Component Characters Query

Added a reverse lookup query to `getCharacterBySlug` that fetches characters whose `combined_form_id` points to the current character. The query only executes when `is_combined_form` is true — non-gestalt characters use `Promise.resolve` to skip the DB call entirely, preserving existing performance. Returns `{ slug, name, combiner_role, alt_mode }` sorted alphabetically.

### 2. API: Response Schema Update

Added `component_characters` array to `characterDetail` Fastify response schema with a new `componentCharacterItem` schema. All fields are in `required` per project convention (Fastify silently drops unrequired nullable fields).

### 3. Web: Zod Schema & UI

Added `ComponentCharacterRefSchema` to `zod-schemas.ts` and `component_characters` to `CharacterDetailSchema`. The `CharacterDetailContent` component renders a "Component Characters" section below the "Combined Form" badge when the array is non-empty, with each component name linked to its character page and combiner role / alt-mode shown inline.

---

## Technical Details

### Query Design

The component characters query uses the existing partial index `idx_characters_combined_form` on `combined_form_id WHERE combined_form_id IS NOT NULL`, making the reverse lookup efficient. The query is added to the existing `Promise.all` alongside sub-groups and appearances — no sequential waterfall.

### Conditional Fetch Pattern

```typescript
base.is_combined_form
  ? pool.query<ComponentCharacterRef>(
      `SELECT slug, name, combiner_role, alt_mode FROM characters WHERE combined_form_id = $1 ORDER BY name ASC`,
      [base.id]
    )
  : Promise.resolve({ rows: [] as ComponentCharacterRef[] });
```

---

## Validation & Testing

### Unit Tests

- `routes.test.ts` — Added gestalt test with 3 component characters, verified response shape. Updated existing happy-path test to assert `component_characters: []`. 11 character route tests pass.
- `useCharacterDetail.test.ts` — Updated fixture with `component_characters: []`. 5 tests pass.

### E2E Tests

- `catalog-detail-pages.spec.ts` — Added Devastator gestalt fixture, mock route, and dedicated related-items mock. New test verifies Combined Form badge, Component Characters label, component links with correct hrefs, and inline combiner role/alt-mode text.
- `catalog-search.spec.ts` — Updated character fixture with `component_characters: []`.

### Quality Checks

- TypeScript: zero errors (both modules)
- ESLint: zero errors, zero warnings
- Prettier: all files formatted
- Build: successful (both modules)
- API: 590 tests pass, Web: 257 tests pass

---

## Related Files

**Modified (API):**

- `src/catalog/characters/queries.ts` — Added `ComponentCharacterRef`, conditional query in `getCharacterBySlug`
- `src/catalog/characters/schemas.ts` — Added `componentCharacterItem`, `component_characters` to `characterDetail`
- `src/catalog/characters/routes.ts` — Added `component_characters` to `formatDetail`
- `src/catalog/characters/routes.test.ts` — Added gestalt test, updated comment and assertion

**Modified (Web):**

- `src/lib/zod-schemas.ts` — Added `ComponentCharacterRefSchema`, `component_characters` to `CharacterDetailSchema`
- `src/catalog/components/CharacterDetailContent.tsx` — Render component characters list
- `src/catalog/hooks/__tests__/useCharacterDetail.test.ts` — Updated fixture
- `e2e/catalog-detail-pages.spec.ts` — Added gestalt fixture, mock, and test
- `e2e/catalog-search.spec.ts` — Updated fixture

**Modified (Docs):**

- `docs/test-scenarios/E2E_CATALOG_DETAIL_PAGES.md` — Added 2 new Gherkin scenarios

---

## Status

✅ COMPLETE — Implementation ready for PR creation.
