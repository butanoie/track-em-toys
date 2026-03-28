# Collection Export/Import — UI Design Specification

**Date:** 2026-03-24
**Issue:** [#116 — Collection data export/import with cross-purge portability](https://github.com/butanoie/track-em-toys/issues/116)
**Status:** Architecture reviewed, implementation in progress
**Prototype:** `web/design-prototypes/collection-export-import.html`

---

## Design Direction

**Aesthetic:** Archival utility with collector warmth — structured, clear status reporting, with the confidence of knowing exactly what happened to each item. Extends the collection module's existing amber accent system.

**Key principle:** Export/import is a data management utility, not a primary browse flow. Export should be frictionless (one click). Import should build confidence through progressive disclosure: file → preview → results. The import results manifest is the hero moment — it feels like checking items off an inventory sheet.

---

## 1. Toolbar Integration — Export/Import Button Group

### Placement

Inside the existing `CollectionPage.tsx` toolbar row (line 149), between `ViewToggle` and pagination controls. The buttons are grouped into a single `border` container matching the ViewToggle's visual style.

```
┌──────────────────────────────────────────────────────┐
│ 47 items            [↓ Export | ↑ Import] [⊞|☰] [◀▶]│
└──────────────────────────────────────────────────────┘
```

### Styling

- Grouped button pair with shared border (`border border-border rounded-lg overflow-hidden`)
- Divider between buttons (`border-r border-border`)
- Amber text (`text-amber-700 dark:text-amber-300`) — signals data operation, distinct from neutral browse controls
- Hover: `bg-amber-50 dark:bg-amber-950`
- Icons: Lucide `Download` and `Upload`, 14px, left of label
- Font: `text-sm font-medium`

### Visibility

- Export button: visible when collection has items (`stats.total_copies > 0`)
- Import button: always visible (users may import into an empty collection)
- Both buttons hidden in the empty state (the "Your collection is empty" view) — but Import could optionally appear there as a secondary CTA

### Rationale

> **Why a button group instead of a dropdown menu?** Both actions are equally likely — collectors export before a DB purge, then import after. Neither is subordinate. A dropdown hides the less-used action behind an extra click. The button group makes both discoverable without cluttering the toolbar.

---

## 2. Export Flow — Instant Download

### Interaction

1. User clicks "Export" button
2. `GET /collection/export` fires (authenticated)
3. Response is a JSON blob — create a `Blob` URL and trigger download via a temporary `<a>` element
4. Sonner toast confirms: "Collection exported — 47 items saved to file"
5. No dialog, no preview, no confirmation step

### Filename

`collection-export-{YYYY-MM-DD}.json` — date-stamped for easy identification. The API sets `Content-Disposition: attachment; filename="collection-export-2026-03-24.json"` but the client-side blob download also uses this pattern as a fallback.

### Toast Design

- Green check icon in a circular emerald badge
- Title: "Collection exported"
- Description: "{count} items saved to file"
- Filename in amber monospace below the description
- Standard Sonner duration (4s)

### Error Handling

- Network error → `toast.error("Could not export collection. Please try again.")`
- Empty collection → export button is disabled (guarded by stats check)

### Rationale

> **Why no dialog for export?** Export is a read-only, non-destructive operation. The user already knows what they're exporting (their entire collection). Adding a confirmation dialog would be friction without value. The toast provides feedback that the action succeeded.

---

## 3. Import Flow — Multi-Step Dialog

The import dialog uses a state machine with five states:

```
idle → file-selected → importing → complete
  ↓         ↓              ↓
error     error          error
```

### State: `idle` — File Drop Zone

The dialog opens with a drag-and-drop target area.

**Drop zone styling:**

- Dashed amber border (SVG `stroke-dasharray` via `background-image` — avoids CSS border-style limitations for rounded corners with custom dash patterns)
- Light amber background: `bg-amber-50/50 dark:bg-amber-950/20`
- Archive box icon (Lucide `Archive`) centered, 56px container with `bg-amber-100 dark:bg-amber-900/60`
- "Drop your export file here" primary text + "or click to browse" secondary
- `.json` file type hint in monospace
- Hover: scale-up on icon (`group-hover:scale-105`), slightly deeper amber background
- Active drag: border thickens (3px), background deepens

**Hidden file input:** `<input type="file" accept=".json" />` triggered by drop zone click. The drop zone has `role="button"` with Enter/Space keyboard activation.

**Footer:** Cancel button (ghost) + Import button (disabled, muted).

### State: `file-selected` — Preview

After file selection, the drop zone is replaced by a preview card.

**Selected file chip:**

- File icon + filename (monospace, truncated) + file size
- "Replace" link button (amber text) to re-open file picker
- Rounded card with muted background

**Manifest summary card:**

- Amber-tinted border and background (`border-amber-200 bg-amber-50/50`)
- Header row: schema version badge (`v1` in amber monospace pill) + "Exported {date}" right-aligned
- Stats row: item count (large bold number) + franchise pills with counts
- Franchise pills: `bg-amber-200/60 text-amber-700` rounded-full badges

**Info note:**

- Light muted background with info icon
- Explains: items matched by slug, unresolved items reported, import adds new entries

**Footer:** Cancel button (ghost) + "Import {N} items" button (amber primary, enabled).

**Client-side validation (before showing preview):**

| Check                   | Error message                                                                  |
| ----------------------- | ------------------------------------------------------------------------------ |
| Not valid JSON          | "The file could not be parsed as JSON"                                         |
| Missing `version` field | "Invalid export format — missing schema version"                               |
| `version` > server max  | "Unsupported schema version (v{N}), server supports up to v{max}"              |
| `items` array empty     | "No items to import" (warning, not blocking — shows amber info, not red error) |
| `items` not an array    | "Invalid export format — items field is not an array"                          |

### Rationale

> **Why client-side pre-validation?** The file is parsed in the browser immediately on selection. This catches structural errors (bad JSON, wrong schema) instantly without a network round-trip. Only slug resolution requires the server — that's the import API's job.

> **Why show franchise breakdown in preview?** It gives the user a quick sanity check: "Yes, this is my Transformers + GI Joe collection from last week, not some random file." The numbers should match their mental model.

### State: `importing` — Loading

- Centered spinner with amber accent (`border-amber-600 border-t-amber-600`)
- "Processing {N} items" title
- "Matching franchise and item slugs..." pulsing subtitle
- Subtle scan-line animation across the container (gradient shimmer)
- Cancel button disabled during import

### State: `complete` — Results Manifest

The hero screen. Two variants:

**Variant A: Mixed results (some failures)**

Header:

- "Import Complete" title
- Summary counters: green pill "{N} imported" + red pill "{N} unresolved"
- Counters use `aria-live="polite"` for screen readers

Manifest (scrollable, max-height 360px):

- **Unresolved section first** — red section header, items show:
  - Red X circle icon
  - "Unknown Item" label (since the item doesn't exist in catalog, we can't show its name)
  - Franchise slug / item slug in red monospace
  - "Slug not found" right-aligned status
- **Imported section** — green section header, items show:
  - Green check circle icon (with pop animation on first render)
  - Item name (resolved from catalog)
  - Franchise slug / item slug in muted monospace
  - ConditionBadge (reuses existing component) right-aligned
- Manifest rows use bottom-border lines (ledger style)
- If >10 successful items: show first 6 + "+ {N} more items imported successfully" footer

Footer: "Items added as new entries to your collection" note + "Done" button (amber primary).

**Variant B: All successful**

Compact celebration view instead of full manifest:

- Large green check icon with pop animation (64px circle)
- "All items imported" heading
- Large count number in emerald
- "{N} items added to your collection" subtitle
- Franchise breakdown pills
- "Done" button

### Rationale

> **Why show unresolved items first?** Unresolved items are actionable — the user needs to know which catalog items are missing (perhaps they need to be re-added to the seed data after a purge). Successful items are confirmation, not actionable. "Errors first" follows the same UX principle as form validation.

> **Why collapse to compact view on full success?** When everything works, a 47-item manifest is just noise. The user wants confirmation, not a ledger to read. The big green check + count is faster to process.

> **Why show the slug path for unresolved items?** After a DB purge, the user may need to check if a catalog item was removed or renamed. The `franchise_slug / item_slug` path gives them a debugging reference — they can search the catalog or check seed data.

### State: `error` — Inline Errors

Errors display within the dialog body (replacing the drop zone or preview), not as separate error dialogs or toasts.

- Red-tinted border and background
- Warning triangle icon in red circular badge
- Error title + description
- "Choose a different file" or "Retry import" link button

Four error types:

1. **Invalid file format** — JSON parse failure
2. **Unsupported schema version** — version number too high
3. **Empty collection** — zero items (amber warning, not red error)
4. **API error** — network failure or server error during import

### Rationale

> **Why inline errors instead of toasts?** The error is contextual to the import flow — the user needs to take action within the dialog (choose a different file, retry). A toast would dismiss itself and leave the dialog in an ambiguous state.

---

## 4. Data Flow

### Export

```
[Export Button] → GET /collection/export
                        ↓
              Response JSON blob
                        ↓
              Blob URL → <a download> → browser save dialog
                        ↓
              toast.success("Collection exported")
```

### Import

```
[Import Button] → Dialog opens (idle state)
                        ↓
[File dropped/selected] → FileReader.readAsText()
                        ↓
              JSON.parse() → client-side validation
                        ↓
              Preview shown (file-selected state)
                        ↓
[Confirm Import] → POST /collection/import { body: parsed JSON }
                        ↓
              API response: { imported: [...], unresolved: [...] }
                        ↓
              Results manifest (complete state)
                        ↓
[Done] → Dialog closes → invalidate ['collection'] queries
```

---

## 5. New Components

| Component                | Location                 | Purpose                                                |
| ------------------------ | ------------------------ | ------------------------------------------------------ |
| `ExportImportToolbar`    | `collection/components/` | Button group — triggers export and opens import dialog |
| `ImportCollectionDialog` | `collection/components/` | Multi-step dialog shell with state machine             |
| `ImportDropZone`         | `collection/components/` | Drag-and-drop file target with validation              |
| `ImportPreview`          | `collection/components/` | File summary: version, date, franchise breakdown       |
| `ImportResultsManifest`  | `collection/components/` | Scrollable success/failure ledger                      |

### Reused Components

- `ConditionBadge` — condition short codes on manifest items
- `Dialog` / `DialogContent` / `DialogHeader` / `DialogFooter` — Shadcn dialog shell
- `Button` — standard button variants
- `toast` (Sonner) — export confirmation

### New API Functions

| Function                            | File                | Endpoint                  |
| ----------------------------------- | ------------------- | ------------------------- |
| `exportCollection(includeDeleted?)` | `collection/api.ts` | `GET /collection/export`  |
| `importCollection(data)`            | `collection/api.ts` | `POST /collection/import` |

### New Hooks

| Hook                    | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `useCollectionExport()` | Triggers download, handles loading/error state                                     |
| `useCollectionImport()` | `useMutation` wrapping `importCollection`, invalidates `['collection']` on success |

---

## 6. Accessibility

| Element           | Requirement                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Drop zone         | `role="button"`, `tabIndex={0}`, activates on Enter/Space, `aria-label="Select export file to import"` |
| File input        | Visually hidden (`sr-only`), `accept=".json"`, linked via drop zone click                              |
| Import button     | `aria-disabled="true"` when no file selected, `aria-busy="true"` during import                         |
| Summary counters  | `aria-live="polite"` on the imported/unresolved count region                                           |
| Error messages    | `role="alert"` for validation failures                                                                 |
| Manifest sections | `<h3>` headings for "Unresolved" and "Imported" sections                                               |
| Manifest scroll   | `tabIndex={0}` on scroll container for keyboard scrolling, `aria-label="Import results"`               |

---

## 7. Schema Version Upgrade Path

The export format includes `version: N` (integer). When the collection schema evolves:

1. Bump the export version number
2. Add a migration function: `v1 → v2` (e.g., add `purchase_price: null` default)
3. Server maintains a migration chain: import applies migrations sequentially
4. Client preview shows the detected version and whether upgrade will be applied

Example: If v2 adds `purchase_price`, importing a v1 file shows:

> "This file uses schema v1. Missing fields will use default values (purchase_price: none)."

This is documented in the issue requirements — the UI simply surfaces the version information and lets the user know if an upgrade migration will be applied.

---

## 8. Empty Collection State

When the collection is empty, the existing empty state ("Your collection is empty — Browse Catalog") does not show the toolbar. Two options:

**Option A (recommended):** Add an "Import" link/button to the empty state as a secondary CTA:

```
Your collection is empty
Start building your collection by browsing the catalog
and adding items you own.

[Browse Catalog →]    or    [Import from file]
```

**Option B:** Always show the toolbar, even on empty state. Simpler but clutters the empty state with controls that are mostly irrelevant (Export is useless on empty).

### Rationale

> Option A is preferred because after a DB purge, a user's first action is to import their backup — they shouldn't have to add a dummy item just to see the Import button. The "or Import from file" secondary CTA makes the restore path discoverable from the very first screen.

---

## 9. Architecture Decisions (from review audit)

### API Architecture

| Decision              | Choice                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Slug resolution       | `batchGetItemIdsBySlugs` — single UNNEST query resolving up to 500 pairs in one round-trip            |
| Partial success       | SAVEPOINT per insert inside one transaction (PostgreSQL aborts entire tx on error without savepoints) |
| Export query          | Single query, no pagination — collections are small enough                                            |
| Version guard         | `minimum: 1, maximum: 1` in Fastify schema — schema-level rejection                                   |
| Rate limits           | Export: 20/min, Import: 10/min                                                                        |
| `added_at` on import  | Accepted in schema but ignored — new rows get `created_at = now()`                                    |
| Stats `deleted_count` | Added to `GET /collection/stats` to support pre-export deleted-items prompt                           |

### Web Architecture

| Decision                 | Choice                                                                           |
| ------------------------ | -------------------------------------------------------------------------------- |
| State machine            | `useState` with discriminated union tag (matches existing collection patterns)   |
| Export hook              | `useState`-based, not `useMutation` (produces blob download, not cache mutation) |
| Import hook              | `useMutation` with `['collection']` prefix invalidation                          |
| Retry file               | Client constructs from unresolved items (no server-side retry file generation)   |
| Pre-export deleted check | `AlertDialog` when `stats.deleted_count > 0`                                     |

### Audit Findings (resolved)

1. Web `ExportItemSchema` must include `added_at` and `deleted_at` fields
2. Web `ImportedItemSchema` must NOT include `collection_item_id` (not in API response)
3. Stats API/schema needs `deleted_count` addition (3-layer change)
4. `batchGetItemIdsBySlugs` handles empty input with early return
5. Duplicate slugs in import payload both succeed (multiple copies allowed — no UNIQUE constraint)
