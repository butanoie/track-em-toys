# ADR: Collection UI Design (Phase 1.8 Slice 2)

**Date:** 2026-03-24 (backfilled)
**Status:** Accepted (implemented)
**Depends on:** Phase 1.8 Slice 1 (Collection API, PR #104)
**GitHub Issue:** #100

---

## Context

Phase 1.8 Slice 2 adds the personal collection browsing UI — the first user-private feature in the web app. The API (Slice 1) is complete with 8 endpoints: list with filters, add, stats, batch check, get, update, soft-delete, and restore. This slice needs to provide collectors with an efficient way to browse, filter, and manage their owned items.

### Requirements

- Browse collection with franchise, condition, and text search filters
- Dual view modes (grid cards and table) with persistence
- Stats overview showing total copies, unique items, and franchise breakdown
- Add items from catalog detail pages
- Edit condition/notes and remove items with undo capability
- Empty state guiding new users to the catalog
- Responsive design (desktop-primary, mobile-functional)

### Constraints

- Collection data is RLS-protected — all reads go through `withTransaction` for session context
- Items can have multiple copies (no UNIQUE on user_id + item_id) — UI must distinguish copies
- Soft-delete with restore means the delete UX should be low-friction with easy undo
- Must visually differentiate from the catalog UI to reinforce "this is mine" vs "this is the catalog"

---

## Design Decisions

### 1. Amber Accent Color System

**Decision:** Collection UI uses an amber/gold accent color (`amber-600`/`amber-400` dark) throughout, distinct from the catalog's neutral/blue palette.

**Where it appears:**

| Element                      | Light Mode                        | Dark Mode                         |
| ---------------------------- | --------------------------------- | --------------------------------- |
| Stats bar icon               | `text-amber-600`                  | `text-amber-400`                  |
| Franchise pills (selected)   | `bg-amber-100 text-amber-800`     | `bg-amber-900 text-amber-200`     |
| Action buttons (Add, Browse) | `bg-amber-600 hover:bg-amber-700` | `bg-amber-500 hover:bg-amber-600` |
| "In collection" indicator    | `text-amber-600`                  | —                                 |
| Active pill borders          | `border-amber-300`                | —                                 |

**Why amber?** Collectors mentally separate "the reference catalog" from "my stuff." A distinct accent reinforces this boundary at a glance. Amber/gold also connotes value and ownership — appropriate for a personal collection. The catalog uses Shadcn's default neutral tokens, so amber creates clear visual separation without requiring a custom theme.

**Rejected alternative:** Sharing the catalog's color scheme with a subtle "owned" badge. This was too easy to miss, especially when scrolling quickly through a mixed catalog+collection workflow.

---

### 2. Stats Bar with Franchise Pills

**Decision:** A persistent stats bar at the top of the collection page showing aggregate counts and clickable franchise filter pills.

```
┌────────────────────────────────────────────────────────────────┐
│  📦 42 copies  │  28 unique items                              │
│                                                                │
│  [All]  [Transformers (31)]  [G.I. Joe (11)]                  │
└────────────────────────────────────────────────────────────────┘
```

**Stats displayed:**

- Total copies (Archive icon, amber accent) — large bold number
- Unique items count
- Vertical separator between stats (visible on `sm+` screens)

**Franchise pills behavior:**

- "All" pill shown first (amber highlight when no franchise filter active)
- Per-franchise pills with counts from the stats endpoint
- Click toggles the franchise filter; clicking already-selected pill clears it
- Selected state uses `aria-pressed` for accessibility

**Why a stats bar instead of a sidebar?** The collection page has far fewer filter dimensions than the catalog (no faceted search, no size class, no year range). A full sidebar would waste space. The stats bar provides at-a-glance counts AND serves as the primary franchise filter in a compact horizontal layout.

**Data source:** Single `GET /collection/stats` CTE query returns `total_copies`, `unique_items`, and `by_franchise[]` in one round-trip, guaranteeing consistent counts.

---

### 3. Simplified Filter Bar (Not Faceted Navigation)

**Decision:** Three inline filters (franchise select, condition select, text search) in a horizontal bar — NOT the faceted sidebar pattern used by the catalog.

```
┌──────────────────────────────────────────────────────────────────┐
│  [All Franchises ▾]  [Any Condition ▾]  [🔍 Search your...]  [✕] │
└──────────────────────────────────────────────────────────────────┘
```

**Components:**
| Filter | Type | Width | Details |
| --- | --- | --- | --- |
| Franchise | Radix Select | 180px | Shows `{name} ({count})`, aria-label "Filter by franchise" |
| Condition | Radix Select | 200px | 7 condition values with full labels (not short codes) |
| Search | Debounced text input | max `sm` (24rem) | 300ms debounce, Search icon, aria-label "Search collection" |
| Clear | Ghost button | auto | Only visible when any filter is active, X icon |

**Layout:** `flex flex-wrap items-center gap-3 mb-6`

**Why not faceted navigation?** The collection has only 3 filter dimensions (franchise, condition, text), compared to the catalog's 8+ facets. A sidebar would be empty space. The inline bar is compact, scannable, and sufficient for the collection's simpler data model. If future phases add tags, price ranges, or custom categories, the filter bar can grow or switch to a sidebar pattern.

**Rejected alternative:** Reusing `FacetSidebar` from the catalog. The abstraction doesn't fit — collection filters are all single-select or text search, not checkbox-list facets with counts.

---

### 4. Dual View Modes: Grid Cards and Table

**Decision:** Toggle between a card grid view and a table view, persisted to localStorage.

#### Grid View (default)

Horizontal cards in a responsive grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4`

```
┌──────────────────────────────────────────────────┐
│  ┌──────┐  Optimus Prime MP-44              [OC] │
│  │ photo│  Transformers · Masterpiece       [✏️] │
│  │      │  "Box has shelf wear"                   │
│  └──────┘  Added 3 days ago     View in catalog → │
└──────────────────────────────────────────────────┘
```

**Card layout:**

- Thumbnail (left): 20x20 box, rounded, lazy-loaded image or Package icon placeholder
- Content (center): item name (h3, truncate), franchise + toy line (text-xs muted), notes in quotes (italic, line-clamp-2), relative date, "View in catalog" link (hover-visible on `lg+`)
- Actions (right): ConditionBadge + Edit button (Pencil icon)

**Card styling:** `border rounded-lg p-4 hover:shadow-md hover:border-lighter transition-all duration-200`

#### Table View

Standard Shadcn Table with 6 columns:

| Column    | Visibility             | Details                                         |
| --------- | ---------------------- | ----------------------------------------------- |
| Item      | Always                 | Thumbnail + name/franchise                      |
| Toy Line  | `hidden md:table-cell` | Text only                                       |
| Condition | Always                 | ConditionBadge                                  |
| Notes     | `hidden md:table-cell` | Truncated, max-w-48                             |
| Added     | Always                 | Relative date, `tabular-nums whitespace-nowrap` |
| Actions   | Always                 | Edit button + "Catalog" link, right-aligned     |

**Empty state (table):** Package icon + "No items match your filters."
**Loading state:** 6 skeleton rows with `animate-pulse`

#### View Toggle

- `role="radiogroup"` with `aria-label="View mode"`
- LayoutGrid icon (left) + List icon (right), grouped buttons with shared border
- Selected state: `bg-accent text-foreground`
- **Persistence:** localStorage key `trackem:collection-view`

**Why both views?** Grid cards are better for visual scanning when photos are available. Tables are more efficient for collectors with large collections who need to scan condition/notes quickly. The catalog uses a similar dual-view pattern at the franchise list level, so collectors are already familiar with the toggle.

---

### 5. Condition Badge with Collector Short Codes

**Decision:** 7 condition values displayed as compact badges using collector-standard abbreviations.

| Value             | Short Code | Light Mode        | Dark Mode   |
| ----------------- | ---------- | ----------------- | ----------- |
| Mint Sealed       | MISB       | Emerald bg + text | Emerald     |
| Opened Complete   | OC         | Sky bg + text     | Sky         |
| Opened Incomplete | OI         | Light sky         | Light sky   |
| Loose Complete    | LC         | Slate bg + text   | Slate       |
| Loose Incomplete  | LI         | Light slate       | Light slate |
| Damaged           | DMG        | Red bg + text     | Red         |
| Unknown           | ?          | Zinc gray         | Zinc gray   |

**Why short codes in badges, full labels in dropdowns?** Badges appear in dense list/table contexts where space is precious. "MISB" and "OC" are universally understood by collectors. Dropdowns (filter selects, condition selector in dialogs) use full labels because new users may not know the abbreviations.

**Color logic:** Condition quality degrades from green (mint) through blue (opened) to gray (loose) to red (damaged). This maps to collectors' intuitive value hierarchy.

---

### 6. Soft Delete with Undo Toast (Not Confirmation Dialog)

**Decision:** Removing an item shows an undo toast for 8 seconds. No confirmation dialog.

**Flow:**

1. User clicks Remove in the edit dialog
2. Item immediately disappears from the list (optimistic or mutation-driven)
3. Toast appears: "Removed from collection" with [Undo] action button (8s duration)
4. If user clicks Undo → `POST /collection/:id/restore` → toast: "Restored to collection"
5. If toast expires → item stays soft-deleted

**Why not a confirmation dialog?** The collection API uses soft delete — nothing is permanently destroyed. A confirmation dialog adds friction to a reversible action. The undo pattern (Gmail, Slack) is faster for power users who remove items frequently. The 8-second window is generous enough for "oops" moments while being short enough to feel responsive.

**Rejected alternative:** Swipe-to-delete (mobile-only, no desktop equivalent). Double-click to delete (undiscoverable). Confirmation dialog (too much friction for a reversible action).

---

### 7. Add to Collection from Catalog Detail

**Decision:** "Add to Collection" button appears on catalog item detail pages. Opens a Shadcn Dialog (`sm:max-w-md`).

**Dialog variants:**

- **First copy:** Title "Add to Collection"
- **Additional copies:** Title "Add Another Copy" (when item already in collection)

**Form fields:**

- Condition selector (button group, required, defaults to "unknown")
- Notes field (optional textarea with character counter)

**Footer buttons:**

- Cancel (ghost variant)
- Add to Collection (amber: `bg-amber-600`, disabled during mutation, shows "Adding..." while submitting)

**Success:** Toast "_{itemName}_ added to your collection" + query cache invalidation

**Why a dialog, not inline?** The add action happens in the catalog browsing context. A dialog keeps the catalog page visible underneath, preserving browsing state. The dialog is simple (2 fields) so it doesn't warrant a full page transition.

---

### 8. Edit Collection Item Dialog

**Decision:** Edit dialog mirrors the add dialog but includes a destructive "Remove" action.

**Layout:**

- Title: "Edit Collection Entry"
- Description: Item name
- Form: Same condition selector + notes field
- Footer (3 buttons):
  - Remove (destructive variant, Trash2 icon) — pushed left with `mr-auto`
  - Cancel (ghost)
  - Save Changes (primary, disabled unless condition or notes changed)

**Delta tracking:** Only sends PATCH if condition or notes differ from the original values (`Object.hasOwn` for notes detection, matching the API contract).

**Why Remove in the edit dialog?** Collectors access the edit dialog to manage a specific copy. Having Remove there is contextually appropriate — they're already focused on that copy. A separate "manage" menu would add an extra interaction step.

---

### 9. Cursor-Based Pagination with Client-Side Stack

**Decision:** Forward/backward pagination using the API's cursor-based pagination, with a client-maintained cursor stack for "Previous" support.

**Behavior:**

- "Next" pushes the current cursor onto the stack, navigates to `next_cursor`
- "Previous" pops the last cursor from the stack, navigates to it
- Filter changes reset the cursor stack (fresh first page)
- Cursor is stored in URL search params (`?cursor=...`) for shareability

**Controls:**

- Previous/Next buttons (outline, small) — only shown when there's a cursor stack or `next_cursor`
- Item count displayed with `aria-live="polite"` and `tabular-nums`

**Why cursor stack, not page numbers?** The API uses keyset cursor pagination (more efficient than offset for large datasets). Cursors are opaque — there's no way to calculate "page 3" without traversing. The stack pattern preserves "Previous" functionality while keeping the API contract simple.

**Rejected alternative:** Offset/page-number pagination (requires COUNT(\*) and is O(n) for deep pages). Infinite scroll (loses position on filter change, harder to navigate large collections).

---

### 10. Empty State Design

**Decision:** When the collection is empty AND no filters are active, show a centered onboarding state.

```
         ┌────────────────────┐
         │     📦 (amber)     │
         │   20x20 circle bg  │
         └────────────────────┘
       Your collection is empty

  Start building your collection by
  browsing the catalog and adding
         items you own.

      [ Browse Catalog → ]
```

**Elements:**

- Amber circle background (20x20) with cabinet/archive SVG icon (10x10)
- Heading: "Your collection is empty"
- Supporting text with max-width `sm`
- CTA: "Browse Catalog" button (amber) linking to `/catalog`

**When shown:** `total_count === 0 && !franchise && !condition && !search` — ensures filtered-but-empty results show the table/grid empty state instead ("No items match your filters").

**Why a CTA to catalog?** New users need guidance on how to populate their collection. The catalog is the only entry point for adding items, so the CTA creates a clear next step.

---

### 11. URL-Driven Filter State

**Decision:** All filter state lives in URL search params, not React state.

**URL shape:** `/collection?franchise=transformers&condition=mint_sealed&search=optimus&cursor=abc123`

**Benefits:**

- Bookmarkable filtered views
- Survives page refresh
- Shareable (though collection data is per-user, the filter configuration transfers)
- Back/forward browser navigation works correctly
- No `useState` ↔ URL sync bugs

**Implementation:** TanStack Router's `Route.useSearch()` reads typed search params. `updateSearch()` callback navigates with merged params, removing empty values. This matches the catalog's URL-driven filter pattern.

---

### 12. Accessibility

**ARIA patterns used:**

| Element           | ARIA                                    | Purpose                                      |
| ----------------- | --------------------------------------- | -------------------------------------------- |
| Franchise pills   | `aria-pressed`                          | Toggle state on filter pills                 |
| Stats count       | `aria-live="polite"`                    | Announces count changes during filtering     |
| View toggle       | `role="radiogroup"` + `role="radio"`    | Two-option exclusive toggle                  |
| Condition buttons | `aria-label` per button                 | Full condition name for screen readers       |
| Edit buttons      | `aria-label={`Edit ${item.item_name}`}` | Identifies which item the edit applies to    |
| Search input      | `aria-label="Search collection"`        | Labels the search field                      |
| Filter selects    | `aria-label` per select                 | "Filter by franchise", "Filter by condition" |

**E2E coverage:** Playwright tests verify all ARIA attributes, ensuring they're not just documented but actually rendered.

---

### 13. Responsive Behavior

| Breakpoint      | Grid View | Table View              | Stats Bar                |
| --------------- | --------- | ----------------------- | ------------------------ |
| `< md` (mobile) | 1 column  | Toy Line + Notes hidden | Stats stack vertically   |
| `md` - `xl`     | 2 columns | All columns             | Stats + pills horizontal |
| `xl+` (desktop) | 3 columns | All columns             | Full horizontal layout   |

Filter bar uses `flex-wrap` to stack gracefully on narrow screens.

---

## Component Architecture

```
web/src/collection/
  api.ts                            # 7 API functions for /collection endpoints
  components/
    AddToCollectionDialog.tsx        # Dialog for adding items from catalog
    CollectionFilters.tsx            # Franchise/condition/search filter bar
    CollectionGrid.tsx               # Grid layout wrapper for cards
    CollectionItemCard.tsx           # Single item card (grid view)
    CollectionStatsBar.tsx           # Stats + franchise pills
    CollectionTable.tsx              # Table view with 6 columns
    ConditionBadge.tsx               # Colored short-code badge
    ConditionSelector.tsx            # Button group for condition selection (shared)
    EditCollectionItemDialog.tsx     # Edit/remove dialog
    NotesField.tsx                   # Textarea with character counter (shared)
    ViewToggle.tsx                   # Grid/table toggle
  hooks/
    useCollectionCheck.ts            # Batch check item ownership (catalog integration)
    useCollectionItems.ts            # Paginated list with filters
    useCollectionMutations.ts        # Add, update, remove, restore mutations
    useCollectionStats.ts            # Stats endpoint
  lib/
    condition-config.ts              # Condition enum → label, short code, colors
    format-date.ts                   # Relative date formatting
  pages/
    CollectionPage.tsx               # Main page: stats + filters + view + pagination
```

**Route file:** `src/routes/_authenticated/collection.tsx`

---

## Revision History

- **2026-03-24:** Backfilled — UI decisions documented from implemented Slice 2 code
