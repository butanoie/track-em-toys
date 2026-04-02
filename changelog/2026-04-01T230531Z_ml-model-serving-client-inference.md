# ML Model Serving & Client-Side Inference — Phases 4.0c-1 and 4.0c-2

**Date:** 2026-04-01
**Time:** 23:05:31 UTC
**Type:** Phase Completion
**Phase:** 4.0c-1, 4.0c-2
**Version:** v4.0.3

## Summary

Implemented the ML model metadata API (Phase 4.0c-1) and client-side image classification (Phase 4.0c-2). The API auto-discovers trained ONNX models and serves their metadata. The web app adds an "Add by Photo" feature to the collection page that uses onnxruntime-web for on-device toy identification, displaying top-5 prediction matches with inline add-to-collection buttons.

---

## Changes Implemented

### 1. Model Metadata API (Phase 4.0c-1)

`GET /ml/models` endpoint that scans `ML_MODELS_PATH` for trained model metadata files and returns summaries. Static file serving for ONNX model downloads in development via `@fastify/static`.

**Created:**

- `api/src/ml/routes.ts` — top-level ML plugin
- `api/src/ml/models/routes.ts` — GET /ml/models handler
- `api/src/ml/models/schemas.ts` — Fastify response schema
- `api/src/ml/models/scanner.ts` — directory scan + metadata parse
- `api/src/ml/models/metadata-schema.ts` — type guard for metadata JSON
- `api/src/ml/models/url-builder.ts` — URL construction for download/metadata URLs
- `api/src/ml/models/scanner.test.ts` — 8 unit tests
- `api/src/ml/models/url-builder.test.ts` — 4 unit tests
- `api/src/ml/models/metadata-schema.test.ts` — 10 unit tests
- `api/src/ml/models/routes.test.ts` — 5 integration tests

**Modified:**

- `api/src/config.ts` — added `modelsPath`, `modelsBaseUrl` to `ml` block
- `api/src/server.ts` — registered `mlRoutes` at `/ml`, added dev-only static serving at `/ml/model-files/`
- `api/.env.example` — added `ML_MODELS_PATH`, `ML_MODELS_BASE_URL`

### 2. Client-Side Inference (Phase 4.0c-2)

"Add by Photo" feature on the collection page: upload a photo, run ONNX inference in the browser, see top-5 catalog item matches with confidence scores and inline "Add to Collection" buttons.

**Created (ML service layer — `web/src/ml/`):**

- `types.ts` — ModelCacheEntry, Prediction, InferenceResult types
- `label-parser.ts` — parse `franchise__item-slug` labels, softmax, top-K extraction
- `preprocess.ts` — canvas resize to 224x224, ImageNet normalization, NCHW tensor
- `model-cache.ts` — IndexedDB cache + model download with progress (handles .onnx + .onnx.data sidecar)
- `image-classifier.ts` — ONNX session management + inference orchestration
- `label-parser.test.ts` — 17 unit tests
- `model-cache.test.ts` — 6 unit tests
- `image-classifier.test.ts` — 3 unit tests

**Created (collection feature):**

- `collection/hooks/useMlModels.ts` — TanStack Query for GET /ml/models
- `collection/hooks/usePhotoIdentify.ts` — stateful orchestration hook
- `collection/components/AddByPhotoSheet.tsx` — modal sheet with phases
- `collection/components/PredictionCard.tsx` — prediction card with item detail, confidence bar, add button
- `components/ui/progress.tsx` — Shadcn Progress component
- 4 test files (useMlModels, usePhotoIdentify, AddByPhotoSheet, PredictionCard)

**Modified:**

- `web/src/lib/zod-schemas.ts` — added MlModelSummarySchema, MlModelsResponseSchema
- `web/src/collection/api.ts` — added listMlModels()
- `web/src/collection/pages/CollectionPage.tsx` — added "Add by Photo" button in stats area + sheet
- `web/src/collection/pages/__tests__/CollectionPage.test.tsx` — added AddByPhotoSheet mock

### 3. Documentation Updates

- `api/CLAUDE.md` — added ML Model Serving section
- `web/CLAUDE.md` — added ML Photo Identification section
- `ml/CLAUDE.md` — marked Phases 4.0c-1 and 4.0c-2 complete
- `docs/plans/ML_Web_Inference_Plan.md` — updated UI flow, API spec, and file structure

---

## Technical Details

### ONNX Model Sidecar Pattern

Models use `.onnx` graph (~317KB) + `.onnx.data` weights sidecar (~6.5MB). Both files are downloaded, cached in IndexedDB, and passed to `InferenceSession.create()` via `externalData` option.

### Dynamic Import for Code Splitting

`onnxruntime-web` (~394KB JS) is dynamically imported inside `image-classifier.ts` — only loaded when the user opens "Add by Photo". WASM files served from jsDelivr CDN.

### Prediction Card

Each prediction eagerly fetches item detail via `useItemDetail` (cached by TanStack Query) to display manufacturer, toy line, and product code. `useCollectionCheck` provides "Owned" badges. Confidence bars are color-coded: green ≥50%, amber 15-49%, red <15% (WCAG 2.2 AA compliant).

---

## Validation & Testing

### API

```
Test Files  39 passed | 1 skipped (40)
Tests       768 passed | 42 skipped (810)
TypeScript  zero errors
ESLint      zero errors/warnings
```

### Web

```
Test Files  98 passed (98)
Tests       728 passed (728)
TypeScript  zero errors
ESLint      zero errors
```

**New tests:** 27 (API) + 41 (Web) = **68 total new tests**

---

## Impact Assessment

- Users can now identify toys by uploading photos — the primary use case for the ML pipeline
- Model downloads are cached in IndexedDB (one-time ~7MB download per model version)
- Inference runs entirely client-side — no server load for classification
- Admin-only model metadata endpoint with rate limiting (30/min)
- Static file serving separated from API routes (prefix `/ml/model-files/` vs `/ml/models`)

---

## Related Files

**API (10 created, 3 modified):**
`api/src/ml/routes.ts`, `api/src/ml/models/{routes,schemas,scanner,metadata-schema,url-builder}.ts`, 4 test files, `api/src/config.ts`, `api/src/server.ts`, `api/.env.example`

**Web (17 created, 4 modified):**
`web/src/ml/{types,label-parser,preprocess,model-cache,image-classifier}.ts`, 3 ML test files, `web/src/collection/{hooks,components}` (7 files + 4 tests), `web/src/components/ui/progress.tsx`, `web/src/lib/zod-schemas.ts`, `web/src/collection/api.ts`, `web/src/collection/pages/CollectionPage.tsx`

**Docs (4 modified):**
`api/CLAUDE.md`, `web/CLAUDE.md`, `ml/CLAUDE.md`, `docs/plans/ML_Web_Inference_Plan.md`

---

## Dependencies Added

- `onnxruntime-web` (web, production) — ONNX inference runtime
- `fake-indexeddb` (web, dev) — IndexedDB mock for unit tests
- `@radix-ui/react-progress` (web, production) — Shadcn Progress component

---

## Next Steps

- ML inference telemetry — track scan events, prediction acceptance, model quality metrics
- Server-side fallback (Phase 4.0c-3) — optional `POST /ml/classify` for older devices
- Secondary model training — export and validate the secondary (alt-mode) model

---

## Status

✅ COMPLETE — Phase 4.0c-1 (Model Metadata API) and Phase 4.0c-2 (Client-Side Inference)
