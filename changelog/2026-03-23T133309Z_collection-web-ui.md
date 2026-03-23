# Collection Web UI — Phase 1.8, Slice 2

**Date:** 2026-03-23
**Time:** 13:33:09 UTC
**Type:** Feature
**Phase:** 1.8 (Personal Collection)
**Version:** v0.8.2

## Summary

Implemented the complete Collection Web UI for Issue #103. Users can now browse their personal collection at `/collection`, add items from catalog detail pages, edit condition/notes, and soft-delete with undo. The Dashboard shows collection stats when items exist. MainNav "My Collection" link is enabled.

---

## Changes Implemented

### 1. New Collection Domain Module (`web/src/collection/`)

Full domain module parallel to `catalog/` and `admin/`, following established project patterns.

**Created:**

- `collection/api.ts` — 7 API functions (list, stats, check, add, patch, delete, restore)
- `collection/lib/condition-config.ts` — CONDITION_CONFIG with 7 condition mappings (label, shortCode, Tailwind classes)
- `collection/hooks/useCollectionItems.ts` — TanStack Query hook with `keepPreviousData`
- `collection/hooks/useCollectionStats.ts` — Stats query with 60s stale time
- `collection/hooks/useCollectionCheck.ts` — Lazy batch-check (enabled only when itemIds non-empty)
- `collection/hooks/useCollectionMutations.ts` — 4 mutations (add, patch, remove, restore) with `['collection']` prefix invalidation
- `collection/components/ConditionBadge.tsx` — Color-coded condition labels with collector short codes (MISB, OC, LC, DMG, etc.)
- `collection/components/ConditionSelector.tsx` — Shared single-column condition picker
- `collection/components/NotesField.tsx` — Shared notes textarea with character counter
- `collection/components/CollectionItemCard.tsx` — Horizontal card with thumbnail, info, condition badge, edit button
- `collection/components/CollectionStatsBar.tsx` — Stats with clickable franchise filter chips (amber accent)
- `collection/components/CollectionFilters.tsx` — Inline filter bar (franchise select, condition select, 300ms debounced search)
- `collection/components/CollectionGrid.tsx` — Responsive card grid with skeleton loading
- `collection/components/AddToCollectionButton.tsx` — Ownership-aware button with lazy batch-check
- `collection/components/AddToCollectionDialog.tsx` — Condition selector + notes for new entries
- `collection/components/EditCollectionItemDialog.tsx` — Edit condition/notes + soft-delete with undo toast
- `collection/pages/CollectionPage.tsx` — Main page with stats, filters, grid, pagination, empty state

### 2. Route and Navigation

**Created:**

- `routes/_authenticated/collection.tsx` — Route with Zod-validated search params (franchise, condition, search, cursor)

**Modified:**

- `components/MainNav.tsx` — Added `/collection` to NAV_ITEMS, removed disabled placeholder span

### 3. Catalog Integration

**Modified:**

- `catalog/components/ItemDetailPanel.tsx` — Added AddToCollectionButton with lazy batch-check
- `catalog/pages/ItemDetailPage.tsx` — Added AddToCollectionButton below item title

### 4. Dashboard Enhancement

**Modified:**

- `routes/_authenticated/index.tsx` — Shows collection stats cards (copies, unique items, franchises, mint sealed count) when user has items; retains browse CTA for empty collections

### 5. Shared Utilities

**Created:**

- `lib/photo-url.ts` — Extracted `buildPhotoUrl` + `PHOTO_BASE_URL` from `catalog/photos/api.ts`
- `components/ui/textarea.tsx` — Installed via Shadcn CLI

**Modified:**

- `catalog/photos/api.ts` — Re-exports `buildPhotoUrl` from new shared location
- `lib/zod-schemas.ts` — Added CollectionConditionSchema, CollectionItemSchema, CollectionItemListSchema, CollectionStatsSchema, CollectionCheckResponseSchema and types

### 6. Tests

**Created (6 test files):**

- `collection/components/__tests__/ConditionBadge.test.tsx` — 4 tests
- `collection/components/__tests__/CollectionItemCard.test.tsx` — 7 tests
- `collection/components/__tests__/AddToCollectionButton.test.tsx` — 3 tests
- `collection/components/__tests__/CollectionStatsBar.test.tsx` — 5 tests
- `collection/components/__tests__/CollectionGrid.test.tsx` — 3 tests
- `collection/pages/__tests__/CollectionPage.test.tsx` — 3 tests

**Modified (3 test files):**

- `components/__tests__/MainNav.test.tsx` — Updated disabled span test → active link test + new active state test
- `catalog/components/__tests__/ItemDetailPanel.test.tsx` — Added collection hook mocks
- `catalog/pages/__tests__/ItemDetailPage.test.tsx` — Added collection hook mocks
- `catalog/pages/__tests__/ManufacturerItemsPage.test.tsx` — Added collection hook mocks

---

## Technical Details

### Query Key Strategy

```
['collection', 'items', filters]   — list with pagination
['collection', 'stats']            — summary statistics
['collection', 'check', itemIds]   — batch ownership check
```

All mutations invalidate `{ queryKey: ['collection'] }` (prefix match) to refresh all three query types.

### Amber Accent Differentiation

Collection UI uses amber/gold tones to visually distinguish from catalog's blue/purple primary:
- Stats bar icon and franchise chip active state: `amber-600` / `amber-400` dark
- Add to Collection button: `border-amber-300 text-amber-700`
- Submit button: `bg-amber-600 hover:bg-amber-700`
- "In collection" indicator: `text-amber-600`

### Undo Toast Pattern

Soft-delete uses Sonner's action toast instead of a confirmation dialog:
```tsx
toast('Removed from collection', {
  action: { label: 'Undo', onClick: () => mutations.restore.mutate(id) },
  duration: 8000,
});
```

---

## Validation & Testing

| Module | Tests | Lint | Typecheck | Format | Build |
|--------|-------|------|-----------|--------|-------|
| API    | ✅ 716 passed | ✅ | ✅ | ✅ | ✅ |
| Web    | ✅ 622 passed | ✅ | ✅ | ✅ | ✅ |

---

## Summary Statistics

- **21 source files** created
- **6 test files** created (25 new tests)
- **9 existing files** modified
- **3 existing test files** updated
- **Total web tests:** 622 (was 597)

---

## Next Steps

- Issue #104: E2E tests for collection flows
- Sort options: Add `sort` query param to API, then UI toggle
- Batch-check on catalog list: Ownership indicators on item browse rows

---

## Status

✅ COMPLETE
