# Collection E2E Tests

**Date:** 2026-03-23
**Time:** 20:45:37 UTC
**Type:** Feature
**Phase:** 1.8
**Version:** v1.8.2

## Summary

Added 12 Playwright E2E tests covering all collection management user flows (Issue #104). Introduced `MockCollectionState`, a stateful mock class that enables mutation chain testing (add, remove, undo restore). Also fixed 7 pre-existing E2E failures in catalog specs caused by missing `thumbnail_url` fields and collection endpoint mocks.

---

## Changes Implemented

### 1. Collection E2E Test Suite

12 tests across 6 describe blocks covering: empty state, dashboard stats, add from catalog (including multiple copies), collection page display, filtering (franchise/condition/search), edit/remove with undo, view toggle persistence, and navigation.

**Created:**

- `web/e2e/collection.spec.ts` — 12 E2E tests for collection management flows
- `web/e2e/fixtures/mock-helpers.ts` — `MockCollectionState` class, `makeCollectionItem()` factory, `mockEmptyCollection()` shared helper, `setupCatalogForAddFlow()` catalog mock helper
- `docs/test-scenarios/E2E_COLLECTION_MANAGEMENT.md` — Gherkin scenario document (11 scenarios)

### 2. Pre-Existing E2E Fixes

Added `thumbnail_url: null` to mock item data and collection endpoint mocks (`mockEmptyCollection`) to 3 catalog spec files that were broken by PR #108's schema changes.

**Modified:**

- `web/e2e/catalog-browse.spec.ts` — added `thumbnail_url` to mock items + `mockEmptyCollection()`
- `web/e2e/catalog-detail-pages.spec.ts` — added `thumbnail_url` to mock items + `mockEmptyCollection()`
- `web/e2e/catalog-search.spec.ts` — added `thumbnail_url` to mock search results + `mockEmptyCollection()`
- `web/playwright.config.ts` — added `collection.spec.ts` to user project testMatch
- `docs/test-scenarios/README.md` — updated mapping table status

---

## Technical Details

### MockCollectionState

A stateful class where `page.route()` handlers close over the instance. Mutations (`addItem`, `removeItem`, `restoreItem`, `patchItem`) modify internal state, and subsequent GET requests automatically return updated data without re-registering routes. This enables testing:

- Add item twice → check count increments from 1 to 2
- Remove item → undo via toast → item restored in collection

### Route Registration Order

Playwright matches last-registered-first. The `register()` method registers:
1. Catch-all `**/collection/**` (lowest priority)
2. `**/collection` (list GET + add POST)
3. `**/collection/stats`
4. `**/collection/check**`
5. `/collection/:uuid/restore` (regex)
6. `/collection/:uuid` (regex — PATCH/DELETE)

---

## Validation & Testing

- 12 collection E2E tests pass
- 58 total E2E tests pass (1 pre-existing skip)
- All API and Web checks pass (tests, lint, typecheck, format, build)

---

## Related Files

| Action | File |
|--------|------|
| Created | `web/e2e/collection.spec.ts` |
| Created | `web/e2e/fixtures/mock-helpers.ts` |
| Created | `docs/test-scenarios/E2E_COLLECTION_MANAGEMENT.md` |
| Modified | `web/e2e/catalog-browse.spec.ts` |
| Modified | `web/e2e/catalog-detail-pages.spec.ts` |
| Modified | `web/e2e/catalog-search.spec.ts` |
| Modified | `web/playwright.config.ts` |
| Modified | `docs/test-scenarios/README.md` |

---

## Status

✅ COMPLETE
