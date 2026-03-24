# Phase 1.9 Slice 3 — ML Training Data Export

**Date:** 2026-03-21
**Time:** 08:35:53 UTC
**Type:** Feature
**Phase:** 1.9 Photo Management (Slice 3)
**Version:** v0.1.0

## Summary

Implemented an ML training data export feature that generates manifest files mapping catalog photo paths to item classification labels. Admins trigger exports from the web search results page; the API writes timestamped JSON manifests to a configured directory for consumption by the Create ML pipeline.

---

## Changes Implemented

### 1. API — ML Export Endpoint

New `POST /catalog/ml-export` endpoint (admin-only) that:

- Accepts `q` (search query) and optional `franchise` filter — same params as catalog search
- Finds matching items via full-text search (replicating the items half of the search UNION)
- LEFT JOINs `item_photos` to include approved photos
- Generates a manifest JSON with photo paths, item labels, stats, and low-photo-count warnings
- Writes to `ML_EXPORT_PATH` with ISO8601 timestamped filename (e.g., `20260321T154530Z.json`)

**Created:**

- `api/src/catalog/ml-export/queries.ts` — FTS query with photo JOIN
- `api/src/catalog/ml-export/routes.ts` — POST handler, manifest assembly, file I/O
- `api/src/catalog/ml-export/schemas.ts` — Fastify route schema (200/400/401/403/500)
- `api/src/catalog/ml-export/routes.test.ts` — 11 integration tests

**Modified:**

- `api/src/config.ts` — Added `ml.exportPath` (optional via `optionalOrUndefined`)
- `api/src/catalog/routes.ts` — Registered `mlExportRoutes` at `/ml-export`
- `api/.env.example` — Added `ML_EXPORT_PATH` documentation
- `api/CLAUDE.md` — Added ML Export conventions section
- 8 test files — Added `ml` config mock property to prevent import failures

### 2. Web — Export Button on Search Page

Admin-only "Export for ML" button on the search results page, using `useMutation` + Sonner toast for feedback.

**Modified:**

- `web/src/lib/zod-schemas.ts` — Added `MlExportResponseSchema` and related sub-schemas
- `web/src/catalog/api.ts` — Added `exportForMl()` API function
- `web/src/catalog/pages/SearchPage.tsx` — Added Export button (admin-gated, items-only guard)

### 3. Documentation

**Created:**

- `docs/test-scenarios/INT_ML_EXPORT.md` — 11 Gherkin scenarios

**Modified:**

- `docs/test-scenarios/README.md` — Updated mapping table

### 4. Pre-existing Fix

- `web/src/catalog/components/ItemDetailPanel.tsx` — Removed unused `ShareLinkButton` import that was blocking web build

---

## Technical Details

### Manifest Format

```json
{
  "version": 1,
  "exported_at": "2026-03-21T15:45:30.000Z",
  "stats": {
    "total_photos": 150,
    "items": 12,
    "franchises": 2,
    "low_photo_items": 3
  },
  "entries": [
    {
      "photo_path": "/absolute/path/to/{item_id}/{photo_id}-original.webp",
      "label": "transformers/optimus-prime-voyager-2007",
      "item_name": "Optimus Prime (Voyager, 2007)",
      "franchise_slug": "transformers",
      "item_slug": "optimus-prime-voyager-2007"
    }
  ],
  "warnings": [
    {
      "label": "transformers/some-item",
      "photo_count": 2,
      "message": "Low photo count — may reduce classification accuracy"
    }
  ]
}
```

### Key Design Decisions

- **Optional config** — `ML_EXPORT_PATH` uses `optionalOrUndefined` instead of `required` to avoid breaking all test config mocks. Route validates at request time.
- **FTS query** — Mirrors the items-only portion of the search UNION to match the same results admins see on the search page.
- **No photo copying** — Manifest points to original files in `PHOTO_STORAGE_PATH`; no storage duplication.
- **`stats.items` counts all matched items** — Including zero-photo items, so admins see true data coverage gaps.
- **`low_photo_items` includes zero-photo items** — These are the most severe training data gaps.

---

## Validation & Testing

### API Tests: 11 integration tests

- Happy path: admin export with stats verification
- Manifest file write verification (path, content, format)
- Low photo count warnings
- Zero-photo item handling
- Empty result set
- Franchise filter passthrough
- Auth: 401 (unauthenticated), 403 (curator), 403 (user)
- Validation: 400 (missing query)
- Error: 500 (filesystem write failure)

### Verification Results

| Module | Tests         | Lint | Typecheck | Format | Build |
| ------ | ------------- | ---- | --------- | ------ | ----- |
| API    | ✅ 641 passed | ✅   | ✅        | ✅     | ✅    |
| Web    | ✅ 592 passed | ✅   | ✅        | ✅     | ✅    |

---

## Impact Assessment

- Enables Phase 4.0 (ML) by providing the data export pipeline
- No database migrations required
- No breaking changes to existing API endpoints
- Config change is backward-compatible (optional env var)

---

## Status

✅ COMPLETE — Implementation, tests, review, and documentation all finalized.
