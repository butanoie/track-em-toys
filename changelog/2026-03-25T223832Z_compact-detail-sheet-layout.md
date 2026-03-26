# Compact Detail Sheet Layout, Sheet Dismiss Fix, Collection Share Links

**Date:** 2026-03-25
**Time:** 22:38:32 UTC
**Type:** Feature

## Summary

Redesigned item and character detail sheet layouts for better information density using 2-column CSS grids, reorganized header areas with tag chips and collection status, and fixed a Radix Dialog bug where non-modal sheets would close when list items received focus. Also made franchise/manufacturer table rows fully clickable and migrated collection page item selection to URL search params for shareable links.

---

## Changes Implemented

### 1. Multi-Column Property Grids

Replaced single-column `space-y-3` stacked layouts with `grid grid-cols-2 gap-x-6 gap-y-3` CSS grids in both item and character detail sheets, roughly halving vertical space for properties.

- **Item grid columns:** Appearance | Manufacturer, Size Class | Toy Line, Year Released | Product Code
- **Character grid columns:** Faction | Character Type, Sub-Groups (comma text) | Alt Mode
- Year Released and Size Class always display (em dash when empty)
- Description spans full width via `col-span-2`

### 2. Sheet Header Reorganization

Lifted metadata out of property grids into the sheet header area:

- **Item sheet:** Title shows item name with character name as subtitle; data quality badge (now title-cased) and third-party badge as tag chips; "In Collection (N)" badge grouped with Add to Collection button, right-aligned via new `tagAction` slot
- **Character sheet:** Franchise + Continuity + Combined Form as tag chips below the heading (in both standalone sheet and embedded section within item sheet)
- **Character detail page:** Same tag chips below heading, above separator
- `DetailField` gained `className` prop for grid spanning; `DetailSheet` gained `subtitle`, `tags`, `tagAction` props
- `AddToCollectionButton` simplified — inline "In collection" text removed (moved to header badge)
- `CharacterDetailContent` gained `hideTags` prop to avoid duplication when parent renders chips

### 3. Bug Fix: Non-Modal Sheet Closing on Outside Focus

**Root cause:** Radix Dialog's `DismissableLayer` with `modal={false}` fires `onDismiss` when focus moves outside the dialog. The `CharacterList` `useEffect` calls `el.focus()` on the selected `<li>` when character data loads. If the selected character appeared in the filtered list, focus moved outside the sheet, triggering dismissal.

**Symptom:** URLs like `?sub_group=headmasters&selected=fangry` would load the page, briefly open the sheet, then immediately close it and strip `selected` from the URL. Only happened when the selected character was present in the current filtered results.

**Fix:** Added `onFocusOutside` and `onInteractOutside` with `preventDefault()` on `SheetPrimitive.Content` in `DetailSheet`. This is correct for non-modal side panels where the list behind should remain interactive. Close button and Escape key still work.

### 4. Appearances Table Improvements

- Year formatting simplified: single year shown without hyphen when start == end or only one year present (was `1984–` / `–1985` / `1986–1986`)
- First column uses `ps-0` for flush-left alignment; Name column `w-1/2` to align Source with the right property column

### 5. Two-Column Lists

- `RelationshipSection` items (combiner components, partners, rivals) now use 2-column grid
- Related Items list in character detail uses 2-column grid

### 6. Clickable Table Rows

`FranchiseTable` and `ManufacturerTable` rows are now fully clickable (entire row navigates), matching item and character list behavior. Previously only the name text was a link.

### 7. Collection Page Shareable Links

Migrated collection page item selection from React state (`useState`) to URL search params (`selected` + `selected_franchise`). The "Copy link" button now produces a URL that includes the selected item, making collection item detail sheets shareable and bookmarkable.

**Modified:**

- `web/src/catalog/components/AppearancesTable.tsx` — year formatting, column alignment
- `web/src/catalog/components/CharacterDetailContent.tsx` — 2-col grid, tag chips, `hideTags` prop
- `web/src/catalog/components/CharacterDetailSheet.tsx` — header tags for franchise/continuity/combined form
- `web/src/catalog/components/DetailField.tsx` — `className` prop
- `web/src/catalog/components/DetailSheet.tsx` — `subtitle`, `tags`, `tagAction` props; focus-outside fix
- `web/src/catalog/components/FranchiseTable.tsx` — clickable rows via `useNavigate`
- `web/src/catalog/components/ItemDetailContent.tsx` — 2-col grid, badges removed
- `web/src/catalog/components/ItemDetailSheet.tsx` — header tags, collection badge, subtitle, tagAction
- `web/src/catalog/components/ManufacturerTable.tsx` — clickable rows via `useNavigate`
- `web/src/catalog/components/RelationshipSection.tsx` — 2-col grid
- `web/src/catalog/pages/CharacterDetailPage.tsx` — tag chips below heading
- `web/src/collection/components/AddToCollectionButton.tsx` — removed inline "In collection" text
- `web/src/collection/pages/CollectionPage.tsx` — URL-based item selection
- `web/src/routes/_authenticated/collection.tsx` — `selected`, `selected_franchise` search params

**Tests updated:**

- `web/src/catalog/components/__tests__/AppearancesTable.test.tsx` — year formatting tests updated, same-year case added
- `web/src/catalog/components/__tests__/FranchiseTable.test.tsx` — link test replaced with row click navigation test
- `web/src/catalog/components/__tests__/ItemDetailContent.test.tsx` — removed character link and badge tests (moved to sheet)
- `web/src/catalog/components/__tests__/ItemDetailSheet.test.tsx` — added collection badge, data quality badge, third party badge, title/subtitle tests
- `web/src/catalog/components/__tests__/ManufacturerTable.test.tsx` — link test replaced with row click navigation test
- `web/src/catalog/pages/__tests__/FranchiseListPage.test.tsx` — added `useNavigate` mock for table component
- `web/src/catalog/pages/__tests__/ManufacturerListPage.test.tsx` — added `useNavigate` mock for table component
- `web/src/collection/components/__tests__/AddToCollectionButton.test.tsx` — removed "In collection" text assertion

---

## Technical Details

### CSS Grid for Property Layout

```tsx
<dl className="grid grid-cols-2 gap-x-6 gap-y-3">
  <DetailField label="Faction" value={data.faction?.name} />
  <DetailField label="Character Type" value={data.character_type} />
  ...
</dl>
```

CSS Grid auto-placement fills cells left-to-right, top-to-bottom. When optional fields are absent (`DetailField` returns `null`), remaining fields flow naturally without empty gaps.

### Radix DismissableLayer Fix

```tsx
<SheetPrimitive.Content
  onFocusOutside={(e) => e.preventDefault()}
  onInteractOutside={(e) => e.preventDefault()}
>
```

Radix Dialog's `Content` component exposes `onFocusOutside` and `onInteractOutside` handlers that fire before the dismiss logic. Calling `preventDefault()` suppresses the dismissal while preserving all other Radix behavior (Escape key, close button, `onOpenChange`).

---

## Validation & Testing

```
> eslint .          ✅ 0 errors
> tsc -b            ✅ clean
> vitest run        ✅ 91 files, 687 tests passed
```

- Sheet dismiss fix verified with Playwright: `?sub_group=headmasters&selected=fangry` now keeps the sheet open
- Tests updated across 8 test files (new badge tests, navigation tests, year format tests)

---

## Impact Assessment

- **Information density:** Item and character sheets show properties in roughly half the vertical space
- **Navigation consistency:** Franchise/manufacturer tables now match item/character list click behavior
- **Shareability:** Collection page item detail links are now bookmarkable and shareable
- **Bug fix:** Eliminates a class of Radix Dialog dismiss bugs for all non-modal detail sheets

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Files changed | 22 |
| Lines added | 274 |
| Lines removed | 180 |
| Tests passing | 687 |
| Test files | 91 |

---

## Status

✅ COMPLETE — Lint, typecheck, and all tests passing.
