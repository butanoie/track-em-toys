# ML Model Quality Dashboard, E2E Tests & Retraining Documentation

**Date:** 2026-04-02
**Time:** 15:49:42 UTC
**Type:** Feature

## Summary

Added model quality metrics to the admin ML dashboard (per-class accuracy, confused pairs, quality gates), E2E tests for the Add by Photo flow and admin ML stats, and comprehensive retraining pipeline documentation with quality gates, deployment, and rollback procedures.

---

## Changes Implemented

### 1. Model Quality Metrics — Admin Dashboard

New "Model Quality" section on `/admin/ml` showing training-derived metrics from `-metrics.json` files.

**API — New endpoint `GET /ml/stats/model-quality`:**

- Admin-only, reads `-metrics.json` training artifacts from `ML_MODELS_PATH`
- Returns per-model: accuracy, top-3 accuracy, class count, size, quality gate status, per-class accuracy (sorted worst-first), top-20 confused pairs
- Graceful degradation: `metrics_available: false` when metrics file is missing

**Created:**

- `api/src/ml/models/metrics-schema.ts` — `ModelMetrics` type guard for `-metrics.json`
- `api/src/ml/models/quality-reader.ts` — Metrics file reader + `computeConfusedPairs`
- `api/src/ml/models/quality-schemas.ts` — Fastify response schema
- `api/src/ml/models/quality-routes.ts` — Route handler
- `api/src/ml/models/metrics-schema.test.ts` — Type guard tests
- `api/src/ml/models/quality-reader.test.ts` — Reader + computation tests
- `api/src/ml/models/quality-routes.test.ts` — Integration tests (auth, happy path, edge cases)

**Web — New components:**

- `web/src/admin/ml/ModelQualitySection.tsx` — Container for quality UI
- `web/src/admin/ml/ModelComparisonCards.tsx` — Side-by-side model cards with gate badges
- `web/src/admin/ml/PerClassAccuracyChart.tsx` — Horizontal bar chart, color-coded (green ≥70%, amber ≥50%, red <50%), "Show all" at 30+ classes
- `web/src/admin/ml/ConfusedPairsTable.tsx` — Top-20 confused pairs table
- `web/src/admin/ml/format-utils.ts` — ML label formatting (`franchise__item-slug` → "Item Name")
- Component tests for ModelQualitySection, ConfusedPairsTable, and format-utils

**Modified:**

- `api/src/ml/routes.ts` — Registered quality route at `/stats/model-quality`
- `web/src/admin/ml/MlStatsPage.tsx` — Integrated `ModelQualitySection`
- `web/src/admin/ml/api.ts` — Added `getMlModelQuality`
- `web/src/admin/ml/hooks.ts` — Added `useMlModelQuality` (staleTime: 5 min)
- `web/src/lib/zod-schemas.ts` — Added quality-related schemas and types

### 2. Top-3 Accuracy in Training Pipeline

**Modified:**

- `ml/scripts/train.py` — Added exact top-3 accuracy computation in `compute_per_class_accuracy`, saved as `top3_accuracy` in `-metrics.json`

### 3. E2E Tests — Add by Photo & Admin ML Stats

15 new Playwright E2E tests covering the ML photo identification flow and admin stats dashboard.

**Created:**

- `web/e2e/add-by-photo.spec.ts` — 7 tests: sheet lifecycle, classification flow, add to collection from prediction, owned badge, reset/retry, prediction details
- `web/e2e/admin-ml-stats.spec.ts` — 8 tests: access guard, stat cards, charts, date range selector, navigation
- `web/e2e/fixtures/ml-helpers.ts` — Mock helpers for ML endpoints (models, events, stats, predictions, item details)
- `docs/test-scenarios/E2E_ML_PHOTO_IDENTIFICATION.md` — Gherkin scenarios

**Modified:**

- `web/src/collection/hooks/usePhotoIdentify.ts` — Added `window.__ML_TEST_PREDICTIONS__` E2E test hook
- `web/playwright.config.ts` — Added new specs to user/admin project testMatch
- `web/e2e/collection.spec.ts` — Fixed pre-existing failures (dialog title, condition button names)
- `web/e2e/admin-users.spec.ts` — Fixed admin back arrow navigation

### 4. Retraining Pipeline Documentation

**Modified:**

- `ml/TRAINING.md` — Added 6 new sections: end-to-end pipeline steps, retraining triggers, quality gates checklist (7 items, 3 automated), deployment procedure, rollback procedure, data versioning, CI/automation recommendations

### 5. CLAUDE.md Updates

**Modified:**

- `CLAUDE.md` — Phase 4.0c completion status, admin default redirect
- `web/CLAUDE.md` — E2E test patterns for ML, condition selector button names, rate limiting
- `ml/CLAUDE.md` — Fixed stale training data path reference

---

## Technical Details

### Model Quality API Response Shape

```json
{
  "models": [{
    "name": "primary-classifier",
    "accuracy": 0.85,
    "top3_accuracy": 0.95,
    "quality_gates": { "accuracy_pass": true, "size_pass": true },
    "per_class_accuracy": [{ "label": "transformers__bumblebee", "accuracy": 0.8 }],
    "confused_pairs": [{ "true_label": "...", "predicted_label": "...", "count": 2, "pct_of_true_class": 0.2 }],
    "metrics_available": true
  }]
}
```

### E2E Test Prediction Injection

Tests bypass ONNX inference via `window.__ML_TEST_PREDICTIONS__`, set by `injectTestPredictions()` in `e2e/fixtures/ml-helpers.ts`. The hook in `usePhotoIdentify.ts` checks for this window property and short-circuits the inference pipeline with mock predictions.

---

## Validation & Testing

```
API:     806 passed, 0 failed, lint clean (27 new tests)
Web:     758 passed, 0 failed, lint clean, typecheck clean (16 new tests)
E2E:     95 passed, 0 failed (15 new tests)
ML:      94 TypeScript + 12 Python tests passing
```

---

## Impact Assessment

- Admins can now see model quality metrics alongside runtime telemetry without CLI access
- Per-class accuracy chart immediately highlights weak classes that need more training data
- Confused pairs table identifies labeling issues and visually similar items
- E2E tests cover the full Add by Photo user flow for the first time
- Retraining documentation enables reproducible model updates as the catalog grows

---

## Related Files

### Model Quality (API)
- `api/src/ml/models/metrics-schema.ts`
- `api/src/ml/models/quality-reader.ts`
- `api/src/ml/models/quality-routes.ts`
- `api/src/ml/models/quality-schemas.ts`

### Model Quality (Web)
- `web/src/admin/ml/ModelQualitySection.tsx`
- `web/src/admin/ml/PerClassAccuracyChart.tsx`
- `web/src/admin/ml/ConfusedPairsTable.tsx`
- `web/src/admin/ml/ModelComparisonCards.tsx`
- `web/src/admin/ml/format-utils.ts`

### E2E Tests
- `web/e2e/add-by-photo.spec.ts`
- `web/e2e/admin-ml-stats.spec.ts`
- `web/e2e/fixtures/ml-helpers.ts`

### Documentation
- `ml/TRAINING.md`
- `docs/test-scenarios/E2E_ML_PHOTO_IDENTIFICATION.md`

---

## Status

✅ COMPLETE — All tests passing, ready for PR update
