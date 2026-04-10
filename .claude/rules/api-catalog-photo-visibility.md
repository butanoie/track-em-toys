When writing any SQL query that reads from `item_photos` for display in public catalog surfaces (item list thumbnails, item detail galleries, search results, manufacturer-scoped items, etc.), you MUST include `visibility = 'public'` alongside `status = 'approved'`.

The ONLY exception is `api/src/catalog/ml-export/queries.ts`, which deliberately omits the filter so `training_only` contributions feed the ML pipeline. That file has its own regression test asserting the absence of any visibility filter (`catalog/ml-export/queries.test.ts`).

**Why:** Training-only contributions are a privacy contract — the contributor chose them specifically to NOT appear publicly. A missing visibility filter leaks their photo into the public catalog. This happened in Phase 1.9b when `getItemBySlug`'s inline photo query and four sibling queries were written fresh without copying the `visibility = 'public'` guard from `catalog/photos/queries.ts` `listPhotos`. Five queries total had the same gap. See commit `ceefdf2`.

**How to apply:**

1. Before committing any new or modified query on `item_photos`, check whether it feeds a user-facing catalog surface or the ML export. If user-facing, add `AND visibility = 'public'` (or `AND ip.visibility = 'public'` in a JOIN) alongside the existing `status = 'approved'` clause.
2. `api/src/catalog/__tests__/visibility-filters.test.ts` is a file-scan regression guard over `catalog/items/queries.ts`, `catalog/manufacturers/queries.ts`, and `catalog/search/queries.ts`. It asserts every `status = 'approved'` block in those files is colocated (±4 lines) with `visibility = 'public'`. If you add a new catalog query file that reads `item_photos`, extend the regression test to include it — the test does NOT discover new files automatically.
3. When in doubt, grep for precedents: `grep -rn "status = 'approved'" api/src/catalog/ --include='*.ts' | grep -v test`. Every match except the ML export should include `visibility` in the same query block.
