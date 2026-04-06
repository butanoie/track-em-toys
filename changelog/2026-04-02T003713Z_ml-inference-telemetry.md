# ML Inference Telemetry & Admin Stats Dashboard — Phase 4.0c-T

**Date:** 2026-04-02
**Time:** 00:37:13 UTC
**Type:** Feature
**Phase:** 4.0c-T
**Version:** v4.0.4

## Summary

Added ML inference telemetry tracking with 6 event types, a fire-and-forget client emitter, and an admin dashboard at `/admin/ml` with recharts visualizations. Events are recorded to a new `ml_inference_events` PostgreSQL table and surfaced as aggregate stats (usage counts, acceptance rate, error rate, daily trends, model comparison).

---

## Changes Implemented

### 1. Database Migration

New `ml_inference_events` table with denormalized `model_name` column for efficient aggregate queries.

**Created:**

- `api/db/migrations/034_ml_inference_events.sql` — table with 6 event types (CHECK constraint), 4 indexes (user_id, created_at, type+created, model+created), user_id NOT NULL with RESTRICT FK (tombstone pattern)

### 2. API Endpoints

POST endpoint for recording events (any authenticated user) and 3 GET endpoints for admin stats.

**Created:**

- `api/src/ml/events/schemas.ts` — Fastify JSON schemas for POST body + 3 GET responses
- `api/src/ml/events/queries.ts` — insert + 3 aggregate SQL queries (summary, daily with generate_series, per-model)
- `api/src/ml/events/routes.ts` — POST /ml/events (204, non-fatal on insert failure) + GET /ml/stats/{summary,daily,models}
- `api/src/ml/events/routes.test.ts` — 11 integration tests

**Modified:**

- `api/src/ml/routes.ts` — registered `mlEventWriteRoutes` at `/events` and `mlStatsRoutes` at `/stats`

### 3. Client-Side Telemetry Emitter

Fire-and-forget event emitter using plain `fetch` with manual auth header.

**Created:**

- `web/src/ml/telemetry.ts` — `emitMlEvent()` function, returns void (not Promise), silently swallows errors
- `web/src/ml/telemetry.test.ts` — 4 unit tests

**Modified:**

- `web/src/collection/hooks/usePhotoIdentify.ts` — emits scan_started, scan_completed (with inference_ms + top1_confidence), scan_failed
- `web/src/collection/components/AddByPhotoSheet.tsx` — emits scan_abandoned (on sheet close) and browse_catalog; tracks terminal events via hasTerminalEventRef
- `web/src/collection/components/PredictionCard.tsx` — emits prediction_accepted via onSuccess callback; added predictionRank and activeModel props
- `web/src/collection/components/AddToCollectionDialog.tsx` — added optional onSuccess prop

### 4. Admin Dashboard

New ML Stats page at `/admin/ml` with recharts visualizations and time range selector.

**Created:**

- `web/src/admin/ml/api.ts` — 3 typed fetch functions (summary, daily, models)
- `web/src/admin/ml/hooks.ts` — 3 TanStack Query hooks (staleTime: 60s)
- `web/src/admin/ml/MlStatsPage.tsx` — stat cards (total scans, acceptance rate, error rate, completed) + LineChart (daily activity) + BarChart (model comparison) + days selector (7/30/90)
- `web/src/admin/ml/__tests__/MlStatsPage.test.tsx` — 4 component tests
- `web/src/admin/ml/__tests__/hooks.test.ts` — 3 hook tests
- `web/src/routes/_authenticated/admin/ml.tsx` — route with days search param validation

**Modified:**

- `web/src/routes/_authenticated/admin.tsx` — added "ML Stats" nav item with BarChart3 icon
- `web/src/lib/zod-schemas.ts` — added MlStatsSummary, MlStatsDaily, MlStatsModels schemas + types

### 5. Documentation

- `api/CLAUDE.md` — added ML Inference Telemetry section
- `web/CLAUDE.md` — added ML Telemetry section
- `ml/CLAUDE.md` — marked Phase 4.0c-T complete
- `docs/plans/ML_Web_Inference_Plan.md` — marked Phase 4.0c-T complete in implementation sequence

---

## Technical Details

### Event Types and Metadata

| Event                 | Metadata                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `scan_started`        | model_version, model_category                                                              |
| `scan_completed`      | model_version, model_category, inference_ms, top1_confidence, top5_labels                  |
| `scan_failed`         | model_version, model_category, error_message                                               |
| `prediction_accepted` | model_version, model_category, accepted_label, accepted_rank, accepted_confidence, item_id |
| `scan_abandoned`      | model_version, model_category, had_results                                                 |
| `browse_catalog`      | model_version, model_category                                                              |

### SQL Safety

Stats queries use `$1::integer * INTERVAL '1 day'` for time windows — parameterized integer multiplication, no string concatenation.

### Telemetry Emitter Design

Uses plain `fetch` instead of `apiFetch` to avoid the never-resolving promise issue when auth tokens expire. Returns `void` (not `Promise<void>`) to structurally prevent accidental awaiting.

### Terminal Event Tracking

`hasTerminalEventRef` in `AddByPhotoSheet` prevents double-counting: if `prediction_accepted` or `browse_catalog` fires, `scan_abandoned` is suppressed on sheet close.

---

## Validation & Testing

### API

```
Test Files  40 passed | 1 skipped (41)
Tests       779 passed | 42 skipped (821)
TypeScript  zero errors
ESLint      zero errors
```

### Web

```
Test Files  101 passed (101)
Tests       742 passed (742)
TypeScript  zero errors
ESLint      zero errors
```

**New tests:** 11 (API) + 11 (Web) = **22 total new tests**

---

## Impact Assessment

- Admins can now monitor ML feature usage and model quality via `/admin/ml`
- Telemetry is fully non-blocking — never interferes with the scan flow
- `user_id` stored on every event for future per-user analytics
- recharts only loads on admin ML stats page (auto code-split)
- Migration 034 requires `dbmate up` on deployment

---

## Dependencies Added

- `recharts` (web, production) — ~45KB gzipped, code-split to admin ML page only

---

## Related Files

**API (5 created, 1 modified):**
`api/db/migrations/034_ml_inference_events.sql`, `api/src/ml/events/{schemas,queries,routes,routes.test}.ts`, `api/src/ml/routes.ts`

**Web (9 created, 7 modified):**
`web/src/ml/telemetry.ts`, `web/src/admin/ml/{api,hooks,MlStatsPage}.ts(x)`, 3 test files, `web/src/routes/_authenticated/admin/ml.tsx`

---

## Status

✅ COMPLETE — Phase 4.0c-T (ML Inference Telemetry)
