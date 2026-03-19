# ADR: Catalog Browsing UI Design (Phase 1.7)

**Date:** 2026-03-18
**Status:** Accepted (with audit revisions)
**Depends on:** Phase 1.5 (Catalog API), Phase 1.5b (User Roles & Admin)
**Blocks:** Phase 1.9 (Photo Upload UI)
**GitHub Issue:** #36

---

## Context

Phase 1.7 replaces the placeholder dashboard with a real catalog browser. The primary audience is **serious toy collectors** who need to efficiently browse, filter, and compare items across franchises. The data model is deeply franchise-scoped, with items linked through continuity families, manufacturers, toy lines, and characters.

### Requirements

- Browse franchises as the top-level entry point
- View franchise overview with continuity families and manufacturers
- Browse items with filtering and detail inspection
- Keyboard-navigable item browsing (no full-page transitions)
- Search across the catalog
- Responsive design (desktop-primary, mobile-functional)

---

## Design Decisions

### 1. Franchise-First Navigation

**Decision:** Franchise is the top-level entry point. All browsing is franchise-scoped.

**Why:** The data model is deeply franchise-scoped -- characters, items, factions, and continuity families all FK to a franchise. This mirrors how collectors think ("I collect Transformers") and keeps API calls clean (all subsequent routes use `/catalog/franchises/:slug/...`).

**URL structure:**

| Route                       | Purpose                           |
| --------------------------- | --------------------------------- |
| `/catalog`                  | Franchise grid (entry point)      |
| `/catalog/:franchise`       | Franchise overview hub            |
| `/catalog/:franchise/items` | Items list with faceted filtering |
| `/catalog/search`           | Global search (cross-franchise)   |

**Rejected alternative:** Flat `/catalog/items` with franchise as a filter. This loses the natural scoping and produces unnecessarily complex filter state for what is fundamentally a hierarchical domain.

---

### 2. Franchise List: Tile Grid with Table Toggle

**Decision:** Default tile grid with toggle to table view. View preference persisted to localStorage.

#### Tile Grid

- Responsive grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`
- Each tile: ~200px tall, franchise name + item count
- Logo area: centered monogram lettermark until actual logos are uploaded (Phase 1.9+)
- Hover: card lifts with shadow transition (`hover:shadow-md transition-all duration-200`)
- Click: navigates to franchise overview page

```
 ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
 │              │  │              │  │              │
 │   [LOGO]     │  │   [LOGO]     │  │   [LOGO]     │
 │              │  │              │  │              │
 │ Transformers │  │   G.I. Joe   │  │  Star Wars   │
 │   156 items  │  │   42 items   │  │   89 items   │
 └──────────────┘  └──────────────┘  └──────────────┘
```

#### Table View

| Column        | Description                                          |
| ------------- | ---------------------------------------------------- |
| Franchise     | Name (link to overview)                              |
| Items         | Total item count                                     |
| Continuities  | Number of continuity families                        |
| Manufacturers | Number of manufacturers with items in this franchise |
| Notes         | Franchise notes/description (truncated)              |

**Why grid as default:** With only 4 franchises currently, a grid is more visually engaging and scannable than a table. The table toggle exists for users who want the denser data view, and becomes more useful as franchises grow.

---

### 3. Franchise Overview Hub Page

**Decision:** The franchise detail page is an overview hub -- not a redirect to items. It provides context and multiple navigation paths into the catalog.

#### Layout

```
 ┌─────────────────────────────────────────────────────────────┐
 │  < Back to Catalog                                          │
 │                                                             │
 │  TRANSFORMERS                                    156 items  │
 │  The flagship Hasbro/Takara franchise...                    │
 ├─────────────────────────────────────────────────────────────┤
 │                                                             │
 │  CONTINUITY FAMILIES                                        │
 │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
 │  │Generation 1│ │ Beast Era  │ │ Movieverse  │              │
 │  │  84 items  │ │  23 items  │ │  31 items   │              │
 │  └────────────┘ └────────────┘ └────────────┘              │
 │                                                             │
 │  MANUFACTURERS                                              │
 │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
 │  │   Hasbro   │ │Takara Tomy │ │  Fanstoys   │              │
 │  │  Official  │ │  Official  │ │  3rd Party  │              │
 │  │  89 items  │ │  34 items  │ │  12 items   │              │
 │  │  5 lines   │ │  3 lines   │ │   2 lines   │              │
 │  └────────────┘ └────────────┘ └────────────┘              │
 │                                                             │
 │  QUICK STATS                                                │
 │  Characters: 94  |  Toy Lines: 11  |  Factions: 4          │
 │                                                             │
 │  [ Browse All Items -> ]                                    │
 └─────────────────────────────────────────────────────────────┘
```

#### Sections

| Section             | Content                                                                         | Click behavior                                           |
| ------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Continuity Families | Card per family with item count                                                 | Navigate to items list pre-filtered by continuity family |
| Manufacturers       | Card per manufacturer with official/3rd-party badge, item count, toy line count | Navigate to items list pre-filtered by manufacturer      |
| Quick Stats         | Character count, toy line count, faction count                                  | Each stat links to its respective browse view (future)   |
| Browse All Items    | CTA button                                                                      | Navigate to unfiltered items list                        |

**Why a hub page?** Both continuity families and manufacturers lead to the same destination (items list) but with different filter presets. The hub gives collectors a bird's-eye view of what's available and multiple entry points. It answers the question "what does this franchise contain?" before diving into specifics.

**Additional information at this level:**

- Item counts broken down by continuity family and manufacturer
- Official vs. 3rd-party badge on manufacturer cards
- Toy line count per manufacturer

---

### 4. Items List: Three-Column Master-Detail with Faceted Navigation

**Decision:** A three-column layout with faceted filters (left), item list (center), and detail panel (right). This is the core browsing experience.

#### Layout

```
 ┌────────────────┬────────────────────────────┬──────────────────────────┐
 │  FACETS        │  ITEMS             156 total│  ITEM DETAIL            │
 │                │                             │                         │
 │  Continuity    │  ┌─────────────────────────┐│  MP-44 Optimus Prime    │
 │  [x] G1 (84)  │  │ * MP-44 Optimus Prime   ││  ──────────────────     │
 │  [ ] Beast(23) │  │   Takara Tomy - Leader   ││                         │
 │  [ ] Movie(31) │  │   2019                   ││  ┌───────────────────┐  │
 │                │  └─────────────────────────┘│  │  [Photo Gallery]  │  │
 │  Manufacturer  │  ┌─────────────────────────┐│  └───────────────────┘  │
 │  [ ] Hasbro    │  │   Legacy Bulkhead       ││                         │
 │  [x] Takara    │  │   Hasbro - Voyager      ││  Character: Optimus P.  │
 │  [ ] Fanstoys  │  │   2023                   ││  Continuity: G1         │
 │                │  └─────────────────────────┘│  Toy Line: Masterpiece  │
 │  Size Class    │  ┌─────────────────────────┐│  Manufacturer: Takara   │
 │  [ ] Deluxe    │  │   ER Optimus Prime      ││  Size Class: Leader     │
 │  [ ] Voyager   │  │   Takara Tomy - Voyager ││  Year: 2019             │
 │  [ ] Leader    │  │   2020                   ││  Product Code: MP-44    │
 │                │  └─────────────────────────┘│  Status: Verified       │
 │  Toy Line      │                             │                         │
 │  [ ] Masterp.  │                             │  Description:           │
 │  [ ] Legacy    │                             │  Masterpiece-scale...   │
 │                │                             │                         │
 │  Year          │                             │  Sub-groups: Autobot    │
 │  2019-2024 ──  │        < 1 2 3 ... 8 >     │  Cars                   │
 │                │                             │                         │
 │  3rd Party     │                             │                         │
 │  [ ] Yes (21)  │                             │                         │
 │  [ ] No (135)  │                             │                         │
 ├────────────────┴────────────────────────────┴──────────────────────────┤
 │  Up/Down: Navigate  |  Enter: Open  |  Esc: Close  |  Left/Right: Pg │
 └────────────────────────────────────────────────────────────────────────┘
```

#### Faceted Navigation (Faceted Search)

The filter UI pattern described in the requirements -- where filter choices are generated from the metadata available in the result set -- is called **faceted navigation** (also: faceted search, faceted filtering). This is the pattern used by Amazon, eBay, and most catalog/ecommerce platforms.

**Available facets:**

| Facet             | Type                           | Source                                    |
| ----------------- | ------------------------------ | ----------------------------------------- |
| Continuity Family | Checkbox list with counts      | `continuity_families` table via character |
| Manufacturer      | Checkbox list with counts      | `manufacturers` table via item FK         |
| Size Class        | Checkbox list with counts      | `items.size_class` column                 |
| Toy Line          | Checkbox list with counts      | `toy_lines` table via item FK             |
| Year Released     | Range slider or min/max inputs | `items.year_released` column              |
| 3rd Party         | Toggle (yes/no)                | `items.is_third_party` column             |
| Faction           | Checkbox list with counts      | `factions` table via character FK         |
| Data Quality      | Checkbox list                  | `items.data_quality` column               |

**Facet behavior:**

- Phase 1.7: **Static facets** -- counts based on full dataset, not reactive to other active filters
- Future enhancement: **Dynamic facets** -- counts update as filters change (requires aggregate query support or search engine)
- Active filters shown as removable chips above the item list
- "Clear all filters" action
- Filter state persisted in URL search params for shareability

**Facet sidebar placement:**

- Desktop (`lg+`): Fixed left sidebar, always visible
- Tablet (`md`): Collapsible sidebar or toggle drawer
- Mobile (`< md`): Full-screen filter sheet triggered by "Filters" button

#### Item List (Center Column)

- Each row shows: item name, manufacturer, size class, year released
- Active/selected item has highlighted background
- Hover state distinct from selected state
- Cursor-based pagination at bottom (matches API pagination)
- Total count displayed at top
- Empty state when no items match filters

#### Detail Panel (Right Column)

- Opens when an item is selected (click or Enter key)
- Shows full item detail without page navigation
- Content: name, photo gallery placeholder, all metadata fields, character info, toy line, manufacturer, description
- Closeable (Escape key or close button)
- On mobile: slides in full-width, replacing the list view with back navigation

**Why panel instead of page?** Collectors browse linearly, comparing items side by side. Full-page navigation for each item breaks browsing flow and adds load time. The panel pattern (like Gmail's reading pane, Jira's detail panel, or Finder's preview column) keeps the list context visible while showing detail. This also naturally supports the keyboard navigation requirement.

---

### 5. Keyboard Navigation

**Decision:** Full keyboard navigation for the items list, matching the experience of navigating search results or email inboxes.

| Key                        | Action                                    |
| -------------------------- | ----------------------------------------- |
| `ArrowUp` / `ArrowDown`    | Move selection through item list          |
| `Enter`                    | Open detail panel for selected item       |
| `Escape`                   | Close detail panel, return focus to list  |
| `ArrowLeft` / `ArrowRight` | Previous/next page                        |
| `/`                        | Focus search input (when not in an input) |

**Implementation approach:** Custom `useKeyboardNavigation` hook that manages a `selectedIndex` state and listens for keydown events. The hook attaches to the items list container and only activates when the list has focus.

**Why keyboard-first?** This matches the stated requirement of navigating up/down through items like search results. Power users (serious collectors) expect keyboard shortcuts for efficient browsing.

---

### 6. Catalog Search

**Decision:** Global search accessible from the header, with results grouped by entity type.

#### Search UX

- Search input in the main app header (always visible)
- Typing triggers debounced search (300ms)
- Results page at `/catalog/search?q=...`
- Results grouped by type: Characters, Items (with counts per group)
- Item results use the same detail panel pattern as the items list

```
 ┌─────────────────────────────────────────────────────────────┐
 │  Search: "optimus prime"                        23 results  │
 │                                                             │
 │  CHARACTERS (4)                                             │
 │  Optimus Prime - Transformers - G1 - Autobot               │
 │  Optimus Prime - Transformers - Beast Era - Maximal        │
 │  Optimus Prime - Transformers - Movieverse - Autobot       │
 │  Optimus Primal - Transformers - Beast Era - Maximal       │
 │                                                             │
 │  ITEMS (19)                                                 │
 │  MP-44 Optimus Prime - Takara Tomy - Leader - 2019         │
 │  Legacy Optimus Prime - Hasbro - Voyager - 2023            │
 │  FT-44 Thomas - Fanstoys - Leader - 2022                   │
 │  ...                                                        │
 └─────────────────────────────────────────────────────────────┘
```

**Backend note:** The API does not currently have a search endpoint. Phase 1.7 needs either:

- A new `/catalog/search?q=...` endpoint with basic `ILIKE` search across entity names
- Or client-side filtering on pre-fetched data (only viable for small catalogs)

The API endpoint approach is preferred for scalability.

---

### 7. Browsing Hierarchy Clarification

**Decision:** Both continuity family and manufacturer browsing paths converge on the items list. There is no missing intermediate level.

```
Continuity Family -> Items list (filtered by continuity family)
Manufacturer -> Items list (filtered by manufacturer, grouped by toy line)
```

The hierarchy through the UI is:

```
/catalog                              Franchise grid
  /catalog/:franchise                 Franchise hub (overview)
    /catalog/:franchise/items         Items list (with filters + detail panel)
```

Characters are not a separate browsing level in Phase 1.7. They appear as metadata on items and as search results. A dedicated character browser (`/catalog/:franchise/characters`) is deferred to a future phase.

**Why no character browse page?** The primary collecting activity is item-centric (physical toys), not character-centric. Characters provide context but collectors browse by what they can buy/own. Character pages make more sense when the ML photo classification is live (Phase 4.0) and users want to see "all Optimus Prime toys."

---

### 8. Visual Design: Collector's Archive Aesthetic

**Decision:** Clean, editorial-inspired design. Muted backgrounds, strong typography hierarchy, tactile card surfaces. Premium reference guide feel -- not ecommerce.

#### Color Approach (audit revision)

Use existing semantic tokens (`bg-card`, `bg-accent`, `text-foreground`, `bg-muted`, etc.) which already support dark mode. Do NOT add custom catalog CSS variables -- they would break dark mode without corresponding `.dark` definitions. The existing palette is sufficient for cards, hover states, selected states, and badges.

#### Typography

| Element               | Style                                                                |
| --------------------- | -------------------------------------------------------------------- |
| Franchise name (tile) | `text-xl font-semibold tracking-tight`                               |
| Section headers       | `text-lg font-semibold`                                              |
| Item name (list row)  | `text-sm font-medium`                                                |
| Item metadata         | `text-xs text-muted-foreground`                                      |
| Detail panel labels   | `text-xs font-medium uppercase tracking-wider text-muted-foreground` |
| Detail panel values   | `text-sm`                                                            |
| Counts and stats      | `tabular-nums` for column alignment                                  |

#### Card Styling

```
border border-border/50 rounded-lg
hover:shadow-md hover:border-border transition-all duration-200
selected: ring-2 ring-primary/50 bg-accent
```

#### Badges

| Badge        | Colors                 | Usage                          |
| ------------ | ---------------------- | ------------------------------ |
| Official     | Green bg, green text   | `is_official_licensee: true`   |
| 3rd Party    | Purple bg, purple text | `is_third_party: true`         |
| Verified     | Green outline          | `data_quality: 'verified'`     |
| Needs Review | Amber outline          | `data_quality: 'needs_review'` |
| Size classes | Secondary variant      | Deluxe, Voyager, Leader, etc.  |

---

### 9. Responsive Breakpoints

| Breakpoint      | Franchise Grid | Items Browse Layout                                                       |
| --------------- | -------------- | ------------------------------------------------------------------------- |
| `< sm` (mobile) | 2 columns      | Facets: filter sheet. List: full-width. Detail: replaces list (slide-in). |
| `sm` - `md`     | 3 columns      | Facets: collapsible drawer. List + detail stacked vertically.             |
| `md` - `lg`     | 3 columns      | 2-column: list + panel. Facets in collapsible drawer.                     |
| `lg+` (desktop) | 4 columns      | 3-column: facets sidebar + list + detail panel.                           |

Mobile item detail uses a slide-in from right, full-width, with a back button to return to the list.

---

### 10. Future Enhancements (Out of Scope for Phase 1.7)

These were considered during design but deferred:

| Enhancement                                     | Phase    | Why deferred                                                                  |
| ----------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| Dynamic facet counts (reactive to filter state) | Slice 1  | Implemented via cross-filtering: each facet dimension excludes its own filter |
| Character browse page                           | Post-1.7 | Item-centric browsing is the priority; characters are metadata                |
| Franchise logos                                 | 1.9+     | Requires photo upload infrastructure                                          |
| Year timeline visualization                     | Post-1.7 | Nice-to-have, not critical for browsing                                       |
| Data completeness indicators                    | Post-1.7 | Useful for curators, not primary browsing                                     |
| Saved filters / bookmarked searches             | Post-1.7 | Requires user preferences storage                                             |
| Toy line detail pages                           | Post-1.7 | Items list filtered by toy line is sufficient initially                       |

---

## Component Architecture

```
web/src/
  catalog/
    components/
      FranchiseGrid.tsx          # Tile grid view of franchises
      FranchiseTable.tsx         # Table view of franchises
      FranchiseCard.tsx          # Single franchise tile
      ViewToggle.tsx             # Grid/Table toggle button group
      FranchiseOverview.tsx      # Hub page layout and sections
      ItemList.tsx               # Scrollable item list (center column)
      ItemRow.tsx                # Single item in the list
      ItemDetailPanel.tsx        # Right detail panel
      FacetSidebar.tsx           # Left sidebar with facet groups
      FacetGroup.tsx             # Single facet: label + checkbox list + counts
      FacetRangeSlider.tsx       # Year range facet
      ActiveFilters.tsx          # Chips showing active filters with remove
      CatalogSearch.tsx          # Search input and results grouping
      EmptyState.tsx             # No results / empty catalog state
    hooks/
      useFranchises.ts           # TanStack Query: franchise list
      useFranchiseDetail.ts      # TanStack Query: single franchise with counts
      useItems.ts                # TanStack Query: paginated items with filter params
      useItemDetail.ts           # TanStack Query: single item by slug
      useFacets.ts               # TanStack Query: facet value counts
      useCatalogSearch.ts        # TanStack Query: search across entity types
      useKeyboardNavigation.ts   # Keyboard event handler for list navigation
      useViewPreference.ts       # localStorage-backed grid/table toggle
    api.ts                       # API client functions for catalog endpoints
    types.ts                     # Zod schemas and TypeScript types for catalog data
  routes/
    _authenticated/
      catalog/
        index.tsx                # /catalog -- franchise list page
        search.tsx               # /catalog/search -- search results
        $franchise/
          index.tsx              # /catalog/:franchise -- franchise hub
          items.tsx              # /catalog/:franchise/items -- item browsing
```

---

## Backend Enhancements Required

Phase 1.7 frontend requires these API additions:

| Enhancement                           | Priority | Description                                                                                                               |
| ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Aggregate counts on franchise list    | High     | Return item count, continuity family count, manufacturer count per franchise                                              |
| Filter params on items list           | High     | Add query params: `continuity_family`, `manufacturer`, `size_class`, `toy_line`, `year_min`, `year_max`, `is_third_party` |
| Facet counts endpoint                 | Medium   | Return counts per facet value for the items within a franchise                                                            |
| Search endpoint                       | Medium   | `/catalog/search?q=...` with `ILIKE` across entity names, returning grouped results                                       |
| Manufacturer list scoped to franchise | Medium   | Manufacturers that have items in a given franchise (via toy_lines JOIN)                                                   |

---

## Accessibility (WCAG 2.2 Level AA)

All UI must comply with WCAG 2.2 Level AA.

### ARIA & Landmarks

- `<nav aria-label="Main navigation">` for MainNav with `aria-current="page"` on active link
- `<nav aria-label="Catalog filters">` for facet sidebar
- `<main>` for item list content area
- `<aside role="complementary" aria-label="Item detail">` for detail panel
- `aria-expanded` on collapsible facet groups
- `role="search"` on search form

### Keyboard Navigation

- Roving tabindex pattern for item list (not `role="listbox"`)
  - Active item: `tabIndex={0}`, receives focus
  - All other items: `tabIndex={-1}`
  - Arrow keys move active item and shift tabIndex
- `Escape` closes detail panel, returns focus to list
- `/` focuses search input (when not in an input)
- Tab order: facets sidebar -> item list -> detail panel (logical left-to-right flow)

### Facet Groups

- Each facet dimension wrapped in `<fieldset>` with `<legend>`
- Each value has explicit `<label>` wrapping `<input type="checkbox">`
- Counts included in `aria-label` for screen reader context

### Touch Targets

- All interactive elements meet minimum 24x24px target size (WCAG 2.5.8)
- Facet checkboxes and item rows have sufficient padding

### Live Regions

- `aria-live="polite"` region announces filter result changes ("Showing 42 items")
- Screen reader users get feedback when facet selections change results

### Motion

- Respect `prefers-reduced-motion` for hover/transition animations
- Use `motion-safe:` Tailwind prefix for non-essential animations

### Color Contrast

- All text meets 4.5:1 contrast ratio against its background
- UI components (badges, borders, focus rings) meet 3:1 contrast ratio
- Verify with existing oklch semantic tokens in both light and dark mode

---

## Implementation Plan (Vertical Slices)

### Slice 1: Browse by Franchise (current scope)

Pages: `/catalog`, `/catalog/:franchise`, `/catalog/:franchise/items`

API additions:

- `GET /catalog/franchises/stats` -- aggregate counts via GROUP BY
- `GET /catalog/franchises/:franchise/items` -- extended with filter query params
- `GET /catalog/franchises/:franchise/items/facets` -- cross-filtered facet counts

### Slice 2: Browse by Manufacturer (future)

Pages: `/catalog/manufacturers`, `/catalog/manufacturers/:slug`

### Slice 3: Search (future)

Pages: `/catalog/search`
Enriched search results with manufacturer, toy line, size class info.

---

## Architecture Audit Revisions

The following changes were made after 4 rounds of architecture review:

### High Severity Fixes

1. **Stats SQL JOIN chain:** Corrected from `franchises -> characters` to `franchises -> items -> characters -> continuity_families`. Counts must reflect entities that have items, not just entities that exist.

2. **Route file naming:** Use `$franchise/index.tsx` + `$franchise/items.tsx` directory structure (not `$franchise.tsx` as both leaf and layout). Avoids TanStack Router layout/leaf ambiguity.

3. **Home page:** Do NOT redirect `/` to `/catalog`. This would break 9 existing E2E tests. Keep dashboard with CTA link to catalog. Add MainNav bar.

4. **Cursor reset on filter change:** `setFilter()` must clear `cursor` and `selected` URL params to avoid invalid keyset pagination position.

### Medium Severity Fixes

5. **Dynamic param builder:** Cursor + filter params require dynamic `$N` indexing. Use shared WHERE clause builder for data and count queries to ensure identical filter conditions.

6. **Unified facet value shape:** All facets use `{ value: string, label: string, count: number }` regardless of source (slug-based, free-text, or boolean).

7. **Keyboard nav pattern:** Roving tabindex instead of `role="listbox"`. Simpler, better supported.

8. **MainNav placement:** Component composition per page (AppHeader + MainNav as siblings), not a layout route restructure.

9. **Invalid franchise slug:** Pages that use `:franchise` param must handle 404 from `GET /franchises/:slug`.

10. **Schema composition:** `paginationQuery` has `additionalProperties: false` -- cannot be extended. Create new `itemsListQuerystring` schema with pagination + filter fields copied in.

11. **Dark mode:** Use existing semantic tokens. No custom catalog CSS variables.

12. **Cursor pagination:** Forward-only for Slice 1. No "Previous" button -- use "Next" only or cursor stack later.

### Improvements Found

13. **Hub page data:** Only 2 API calls needed (franchise detail + facets endpoint), not 3. Facets provides manufacturer counts.

14. **Facet implementation:** 5 parallel queries via `Promise.all`, not multi-CTE. Simpler, equally performant.

15. **Nullable fields in facets:** Exclude NULL manufacturers and NULL size_classes from facet counts.
