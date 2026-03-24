# Collection Export/Import E2E Tests

**Date:** 2026-03-24
**Time:** 19:49:53 UTC
**Type:** Test
**Phase:** 1.10 (CSV Import)
**Issue:** [#118](https://github.com/butanoie/track-em-toys/issues/118)

## Summary

18 Playwright E2E tests covering the full collection export/import feature surface. Smart mock handlers in `MockCollectionState` derive export payloads from live items and resolve import slugs against known catalog items. Reusable interaction helpers extracted for import dialog flows.

---

## Changes Implemented

### 1. Mock Infrastructure — Export/Import Handlers

Added two new route handlers to `MockCollectionState.register()`:

- **GET /collection/export** — Builds a `CollectionExportPayload` from `liveItems`, respects `?include_deleted=true` query param. Returns slug-based items with `franchise_slug`, `item_slug`, `condition`, `notes`, `added_at`, `deleted_at`.
- **POST /collection/import** — Parses import body, resolves each `(franchise_slug, item_slug)` pair against `this._items`. Matched items call `addItem()` (state mutation reflected in subsequent GETs). Unmatched items returned as `unresolved`. Overwrite mode snapshots and soft-deletes all live items before import, reports `overwritten_count`.

### 2. Reusable Test Helpers (`import-helpers.ts`)

- `buildExportPayload(items, overrides?)` — Constructs valid `CollectionExportPayload` from `MockCollectionItem[]`
- `buildExportFileDescriptor(items, overrides?)` — Wraps payload as Playwright buffer file descriptor
- `buildRawFileDescriptor(content, filename?)` — Creates file descriptor from raw string (for error tests)
- `selectImportFile(page, descriptor)` — Sets hidden file input scoped to `[role="dialog"]`
- `waitForFileSelected(page)` — Waits for file-selected phase
- `clickAppend/clickReplace` — Footer button interactions
- `confirmAppendDialog/confirmReplaceDialog/confirmSizeWarningDialog` — AlertDialog action buttons
- `readDownloadJson(download)` — Reads Playwright Download stream as parsed JSON

### 3. E2E Test Spec (18 tests, 6 groups)

| Group | Tests | Coverage |
|-------|-------|----------|
| Export | 3 | Download + content verification, disabled on empty, toast with item count |
| Empty state CTA | 2 | "Import from file" visible, opens dialog |
| Confirmation dialogs | 3 | Append, overwrite, size-warning (10-item vs 4-item) |
| Happy paths | 3 | Append all-success manifest, overwrite with archived count, Done closes dialog |
| Error states | 5 | Invalid JSON, bad schema, bad version, empty items, API 500 |
| Partial success | 2 | Imported/unresolved manifest, retry file download with content verification |

### 4. Playwright Config

Added `collection-export-import.spec.ts` to the `user` project `testMatch` regex.

### 5. Test Scenario Document

`docs/test-scenarios/E2E_COLLECTION_EXPORT_IMPORT.md` — 18 Gherkin scenarios mapping 1:1 to test cases. Added to `docs/test-scenarios/README.md` mapping table.

### 6. Architecture Audit Rule Update

Updated `.claude/rules/doc-gates-task-integration.md` — Architecture Review & Audit gate now uses convergence criterion (run until zero medium+ findings, max 10 passes) instead of fixed 5-pass count.

---

## Quality Review

Three review agents found and fixed 7 issues:

- **Unreliable locator** (`page.getByText('1').first()`) — scoped to `[aria-live="polite"]` region
- **Duplicated mixed-payload setup** — extracted `buildMixedDescriptor()` helper
- **Error-test boilerplate** — extracted `openImportDialog()` shared setup
- **Duplicate `item_id` in overwrite test** — added unique `item_id`/`item_slug` for third item
- **Unsafe stream chunk cast** — changed `as string` to `as Uint8Array`
- **Bare file input selector** — scoped to `[role="dialog"] input[type="file"]`
- **Singular/plural regex** — `confirmAppendDialog` now uses `/Append \d+ items?/i`

---

## Related Files

**Created:**

- `web/e2e/collection-export-import.spec.ts` — 18 E2E test cases
- `web/e2e/fixtures/import-helpers.ts` — Reusable test helpers
- `docs/test-scenarios/E2E_COLLECTION_EXPORT_IMPORT.md` — Gherkin scenarios

**Modified:**

- `web/e2e/fixtures/mock-helpers.ts` — Export/import handlers in `MockCollectionState.register()`
- `web/playwright.config.ts` — `testMatch` for `user` project
- `docs/test-scenarios/README.md` — New mapping table row
- `.claude/rules/doc-gates-task-integration.md` — Convergence-based audit rule

---

## Status

Ready for review. Tests require running API + preview server (`npm run test:e2e`).
