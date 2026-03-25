# Decision: Replace Inline Detail Panels with Sheet Overlays

**Date:** 2026-03-25
**Status:** Approved
**Scope:** web/ — Catalog browse and search pages

## Context

The catalog browse pages (Items, Characters, Search) use a 3-column layout with a permanently reserved 380px right column for detail panels. This wastes screen real estate when nothing is selected and is too narrow to show full detail content, requiring a separate "full page" detail route for the complete view.

## Decision

Replace the inline right-column detail panels with Shadcn Sheet overlays that slide in from the right side of the viewport.

### Key Design Choices

| Choice | Decision | Rationale |
|--------|----------|-----------|
| Sheet width | `sm:max-w-3xl` (768px) | Wide enough for photos + fields + character section without feeling cramped |
| Modal behavior | `modal={false}` | No focus trap, no backdrop — list behind the sheet stays interactive |
| Shared shell | `DetailSheet` component | Prevents duplicating loading/error/header/close chrome across Item and Character sheets |
| "View full details" link | Dropped | Sheet shows full content; `ShareLinkButton` provides URL sharing |
| Character section in item sheet | Included below item fields | Matches the standalone `ItemDetailPage` layout |
| Photo management sheet width | Updated to `sm:max-w-3xl` (768px) | Consistent width with detail sheets |
| URL state | `?selected=slug` (unchanged) | Bookmarkable, browser back/forward works |

### Non-Modal Sheet Behavior

- No backdrop overlay (page content visible behind sheet)
- No focus trap (list keyboard navigation works while sheet is open)
- No scroll lock (page behind sheet remains scrollable)
- Escape key still closes the sheet (Radix built-in)
- Clicking outside does NOT auto-dismiss

### Implementation Approach

- **New components**: `DetailSheet` (shared shell), `ItemDetailSheet`, `CharacterDetailSheet`
- **Assembly pattern**: `DetailSheet` uses `SheetPortal` + `SheetPrimitive.Content` directly, skipping `SheetContent` to omit `SheetOverlay`
- **Export `sheetVariants`** from `sheet.tsx` for reuse (one-line addition)
- **`aria-label`** on `SheetPrimitive.Content` for E2E selector compatibility

### Layout Changes

| Page | Before | After |
|------|--------|-------|
| ItemsPage | `grid-cols-[240px_1fr_380px]` | `grid-cols-[240px_1fr]` |
| CharactersPage | `grid-cols-[240px_1fr_380px]` | `grid-cols-[240px_1fr]` |
| SearchPage | `grid-cols-[1fr_380px]` | Single column |

### Files Affected

**Create:** `DetailSheet.tsx`, `ItemDetailSheet.tsx`, `CharacterDetailSheet.tsx` + test files
**Modify:** `ItemsPage.tsx`, `CharactersPage.tsx`, `SearchPage.tsx`, `PhotoManagementSheet.tsx`, `sheet.tsx`
**Delete:** `DetailPanelShell.tsx`, `ItemDetailPanel.tsx`, `CharacterDetailPanel.tsx` + test files
**Update:** E2E specs (`catalog-browse.spec.ts`, `catalog-search.spec.ts`) — `role="complementary"` → `role="dialog"`

### Collection Page Integration

The collection page's catalog links were also converted to open the `ItemDetailSheet` as an overlay, rather than navigating to the standalone item detail page. The collection page owns the sheet state via `useState` (not URL params) since the sheet is transient context, not a bookmarkable view.

- `CollectionItemCard` and `CollectionTable` replaced `<Link>` with an Eye icon `<Button>` + `onViewCatalog` callback
- `CollectionStatsBar` gained an `actions` slot for the `ExportImportToolbar` (moved from the toolbar row)
- `Archive` icon removed from copies count in the stats bar

## Consequences

- Browse list gets more horizontal space (~380px recovered)
- Mobile users can now see item/character details (sheets are full-width on mobile; old panels were `hidden lg:block`)
- Standalone detail pages (`ItemDetailPage`, `CharacterDetailPage`) remain for direct URL access
- The "panel preview → full page" two-step is eliminated for in-app browsing
- Collection page users can view full catalog details without leaving the collection context
