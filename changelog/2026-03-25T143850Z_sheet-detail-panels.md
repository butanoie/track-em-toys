# Sheet-Based Detail Panels — Replace Inline Panels with Slide-Out Sheets

**Date:** 2026-03-25
**Time:** 14:38:50 UTC
**Type:** Feature
**Version:** v0.7.0

## Summary

Replaced the inline 380px right-column detail panels on all catalog browse and search pages with non-modal Sheet overlays (768px wide). This recovers screen real estate for the item/character list, provides a richer detail view, and enables mobile users to see details (previously hidden below `lg` breakpoint). Also wired the collection page's catalog links to open the same sheet overlay, and reorganized the collection stats bar.

---

## Changes Implemented

### 1. New Sheet Components

Created a shared `DetailSheet` shell component and two entity-specific sheets that compose it.

**Created:**

- `web/src/catalog/components/DetailSheet.tsx` — Non-modal Sheet shell using `SheetPortal` + `SheetPrimitive.Content` (bypasses `SheetContent` to omit overlay). Handles loading/error states, header with title + actions + close button.
- `web/src/catalog/components/ItemDetailSheet.tsx` — Item detail overlay with photo gallery, detail fields, character section, collection button, and curator photo management.
- `web/src/catalog/components/CharacterDetailSheet.tsx` — Character detail overlay with fields, relationships, appearances.

### 2. Page Layout Changes

All browse pages switched from 3-column to 2-column grid. Search page switched from 2-column to single column.

**Modified:**

- `web/src/catalog/pages/ItemsPage.tsx` — `grid-cols-[240px_1fr_380px]` → `grid-cols-[240px_1fr]`
- `web/src/catalog/pages/CharactersPage.tsx` — Same
- `web/src/catalog/pages/ManufacturerItemsPage.tsx` — Same
- `web/src/catalog/pages/SearchPage.tsx` — Removed grid wrapper, single column + sheets

### 3. Width Update

- `web/src/catalog/photos/PhotoManagementSheet.tsx` — `sm:max-w-lg` → `sm:max-w-3xl` (768px)

### 4. Removed Components

- `web/src/catalog/components/DetailPanelShell.tsx`
- `web/src/catalog/components/ItemDetailPanel.tsx`
- `web/src/catalog/components/CharacterDetailPanel.tsx`
- Corresponding test files (3 files)

### 5. Test Updates

- Created 3 new test files (24 tests total) for DetailSheet, ItemDetailSheet, CharacterDetailSheet
- Updated 3 page test files to mock sheet components instead of detail hooks
- Updated 2 E2E spec files (`catalog-search.spec.ts`, `catalog-browse.spec.ts`) — `role="complementary"` → `role="dialog"`

### 6. Collection Page Integration

The collection page's "View in catalog" / "Catalog" text links were replaced with Eye icon buttons that open the `ItemDetailSheet` overlay directly on the collection page — no navigation required.

**Modified:**

- `web/src/collection/components/CollectionItemCard.tsx` — `<Link>` → Eye icon `<Button>` with `onViewCatalog` callback
- `web/src/collection/components/CollectionTable.tsx` — Same change for table view
- `web/src/collection/components/CollectionGrid.tsx` — Passes callback through to cards
- `web/src/collection/pages/CollectionPage.tsx` — Owns `catalogItem` state, renders `ItemDetailSheet`

### 7. Collection Stats Bar Reorganization

- Removed `Archive` icon from copies count in `CollectionStatsBar`
- Moved `ExportImportToolbar` into `CollectionStatsBar` via a new `actions` slot (aligned right with `sm:ml-auto`)

### 8. Documentation

- Architecture decision: `docs/decisions/2026-03-25_sheet_detail_panels.md`
- Test scenarios: `docs/test-scenarios/UNIT_CATALOG_DETAIL_SHEETS.md` (new), updated E2E scenarios
- Updated `web/CLAUDE.md` conventions for sheet pattern

---

## Technical Details

### Non-Modal Sheet Pattern

The `DetailSheet` component uses `<Sheet modal={false}>` which removes focus trap, backdrop overlay, and scroll lock from Radix Dialog. This allows the browse list behind the sheet to remain interactive. The sheet bypasses `SheetContent` and renders via `SheetPortal` + `SheetPrimitive.Content` to avoid rendering `SheetOverlay`.

### Accessibility

- `aria-label` on `SheetPrimitive.Content` provides the accessible name for E2E selectors
- `SheetDescription` with `sr-only` class suppresses Radix console warnings
- Escape key handled by Radix Dialog built-in (fires `onOpenChange(false)`)

---

## Validation & Testing

| Check      | Result                        |
| ---------- | ----------------------------- |
| Unit tests | 91 files, 685 tests, all pass |
| Lint       | ✅ Pass                       |
| Typecheck  | ✅ Pass                       |
| Format     | ✅ Pass                       |
| Build      | ✅ Pass                       |

---

## Summary Statistics

- **Files created:** 6 (3 sheet components + 3 test files)
- **Files modified:** 18 (4 catalog pages + 4 collection components + 1 collection page + 7 test files + 2 E2E specs + 1 photo sheet)
- **Files deleted:** 6 (3 panel components + 3 panel test files)
- **Net tests:** 685 (old panel tests replaced by new sheet tests, 1 page test removed due to toolbar relocation)
- **Documentation:** 6 files created/updated

---

## Status

✅ COMPLETE
