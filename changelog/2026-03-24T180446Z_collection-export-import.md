# Collection Export/Import — Cross-Purge Portability

**Date:** 2026-03-24
**Time:** 18:04:46 UTC
**Type:** Feature
**Phase:** 1.10 (CSV Import)
**Issue:** [#116](https://github.com/butanoie/track-em-toys/issues/116)

## Summary

Full-stack implementation of collection export/import with cross-purge portability. Users can export their collection as a slug-based JSON file (no UUIDs), back it up, and re-import after database purges. The import endpoint resolves slugs to current UUIDs, supports partial success with detailed results reporting, and uses PostgreSQL SAVEPOINTs for per-item error isolation.

---

## Changes Implemented

### 1. API — Export Endpoint (`GET /collection/export`)

Slug-based export query fetches all collection items within RLS context, returning `franchise_slug`, `item_slug`, `condition`, `notes`, `added_at`, and `deleted_at`. Versioned JSON envelope (`{ version: 1, exported_at, items }`) enables future schema migration. Optional `?include_deleted=true` query param includes soft-deleted items.

### 2. API — Import Endpoint (`POST /collection/import`)

Batch slug resolution via `UNNEST` query resolves up to 500 `(franchise_slug, item_slug)` pairs in a single round-trip. Each resolved item is inserted within a SAVEPOINT, so individual insert failures don't abort the transaction. Returns structured results: `{ imported: [...], unresolved: [...] }` with item names and failure reasons.

### 3. API — Stats Enhancement

Added `deleted_count` to `GET /collection/stats` response, enabling the web UI to prompt users about including soft-deleted items in exports.

### 4. Web — Export Flow

`useCollectionExport` hook handles the full flow: API call, Zod validation, blob download trigger, and success/error toasts. Shared `downloadJsonBlob` utility extracted for reuse.

### 5. Web — Import Dialog

Five-phase state machine (`idle` → `file-selected` → `importing` → `complete` → `error`) with client-side pre-validation (JSON parse, schema version check, empty items check). Components: `ImportDropZone` (drag-and-drop with keyboard activation), `ImportPreview` (file summary with franchise breakdown), `ImportResultsManifest` (success/failure ledger with condition badges). "Download failed items" button constructs a retry file client-side from unresolved items.

### 6. Web — Page Integration

Export/Import button group in collection toolbar (amber accent, grouped with ViewToggle). "Import from file" secondary CTA on empty collection state for post-purge restore discoverability.

---

## Technical Details

### SAVEPOINT Pattern for Partial Success

```sql
SAVEPOINT import_item
-- INSERT INTO collection_items (...)
RELEASE SAVEPOINT import_item
-- or on error:
ROLLBACK TO SAVEPOINT import_item
```

PostgreSQL aborts the entire transaction on any error without savepoints. This pattern allows individual insert failures (e.g., unexpected constraint violations) to be caught and reported while the rest of the transaction continues.

### Batch Slug Resolution

```sql
SELECT fr.slug, i.slug, i.id, i.name
FROM UNNEST($1::text[], $2::text[]) AS input(franchise_slug, item_slug)
JOIN franchises fr ON fr.slug = input.franchise_slug
JOIN items i ON i.franchise_id = fr.id AND i.slug = input.item_slug
```

Single round-trip for up to 500 pairs. Non-matching pairs are absent from the result set — the handler identifies them as unresolved.

### Client-Side Field Stripping

The web `importCollection` function strips `exported_at` (top-level) and `deleted_at` (per-item) before sending to the API, because the import endpoint uses `additionalProperties: false`. This ensures export files round-trip correctly.

---

## Validation & Testing

### Test Coverage

| Module | New Tests | Total |
|--------|-----------|-------|
| API    | 15 integration tests (export: 5, import: 10) | 750 passed |
| Web    | 30 unit tests (7 test files) | 677 passed |

### Quality Review

Four review passes found and fixed 19 issues including:
- Round-trip `additionalProperties` bug (export payload rejected by import endpoint)
- Missing Zod validation (unsafe `as` cast replaced with `safeParse`)
- Import schema rejecting `notes: null` (asymmetric with export)
- jsdom `File.text()` incompatibility (reverted to FileReader)
- SAVEPOINT catch block swallowing errors (added `request.log.warn`)
- URL memory leak in blob download (wrapped in `try/finally`)

### All Checks Green

| Module | Tests | Lint | Typecheck | Format | Build |
|--------|-------|------|-----------|--------|-------|
| API    | ✅    | ✅   | ✅        | ✅     | ✅    |
| Web    | ✅    | ✅   | ✅        | ✅     | ✅    |

---

## Impact Assessment

- **Users**: Can back up and restore collections across DB purges during development/testing
- **Schema evolution**: Versioned envelope (`version: 1`) with `minimum/maximum` constraint enables future migrations
- **Retry workflow**: Failed imports produce a downloadable retry file for re-attempt after catalog data is fixed
- **Stats API**: `deleted_count` addition is a non-breaking change (new field added to existing response)

---

## Related Files

**Created:**

- `web/src/collection/lib/import-types.ts` — `ImportPreviewData` type, `MAX_EXPORT_VERSION` constant
- `web/src/collection/lib/download.ts` — Shared `downloadJsonBlob` utility
- `web/src/collection/hooks/useCollectionExport.ts` — Export hook with blob download
- `web/src/collection/hooks/useCollectionImport.ts` — Import mutation hook
- `web/src/collection/components/ExportImportToolbar.tsx` — Button group component
- `web/src/collection/components/ImportDropZone.tsx` — Drag-and-drop file target
- `web/src/collection/components/ImportPreview.tsx` — File summary card
- `web/src/collection/components/ImportResultsManifest.tsx` — Success/failure ledger
- `web/src/collection/components/ImportCollectionDialog.tsx` — Multi-step dialog
- 7 test files for the above components and hooks

**Modified:**

- `api/src/collection/queries.ts` — Added `exportCollectionItems`, `batchGetItemIdsBySlugs`, `deleted_count` in stats
- `api/src/collection/schemas.ts` — Added export/import Fastify schemas, `deleted_count` in stats
- `api/src/collection/routes.ts` — Added GET /export and POST /import handlers
- `api/src/collection/routes.test.ts` — Added 15 integration tests
- `web/src/lib/zod-schemas.ts` — Added export/import schemas, `deleted_count` in stats
- `web/src/collection/api.ts` — Added `exportCollection` and `importCollection` functions
- `web/src/collection/pages/CollectionPage.tsx` — Toolbar + empty state integration
- `web/e2e/fixtures/mock-helpers.ts` — Added `deleted_count` to mock stats
- `docs/designs/collection-export-import.md` — Updated with architecture decisions

---

## Next Steps

- Pre-export `AlertDialog` prompt when `stats.deleted_count > 0` (plumbing ready)
- E2E tests for the export/import flow
- Test scenario document (`docs/test-scenarios/E2E_COLLECTION_EXPORT_IMPORT.md`)

---

## Status

✅ COMPLETE
