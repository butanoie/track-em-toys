# Seed Ingestion Integration Tests

**Date:** 2026-03-17
**Time:** 18:54:50 UTC
**Type:** Feature
**Phase:** 1.4 (Catalog Schema/Seed)
**Version:** v0.4.1

## Summary

Added a full integration test suite for the seed ingestion pipeline, verifying seeded data against a real PostgreSQL database. Covers row counts, slug uniqueness, FK referential integrity, combiner relationships, junction table membership, item data correctness, and idempotency. Tests skip gracefully when `DATABASE_URL` is not set. Also added the companion Gherkin test scenario document and updated the scenario mapping table.

---

## Changes Implemented

### 1. Seed Integration Test Suite

End-to-end tests that run `npm run seed:purge` against a real PostgreSQL instance and verify the resulting data.

**Created:**

- `api/src/db/seed-integration.test.ts` — 406 lines, 7 test sections

| Section                  | Tests | What it verifies                                                                                                                                                              |
| ------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row counts               | 9     | Every catalog table has the expected number of rows after seed (reference tables + entities)                                                                                  |
| No duplicate slugs       | 8     | All slug-bearing tables have unique slugs in the database (not just in JSON)                                                                                                  |
| FK referential integrity | 12    | Every foreign key across all catalog tables resolves to an existing parent row                                                                                                |
| Combiner relationships   | 6     | Devastator has exactly 6 Constructicons; Superion, Menasor, Bruticus, Defensor each have 5; all `combined_form_id` targets have `is_combined_form = true`                     |
| Junction table           | 2     | Apeface belongs to both headmasters and horrorcons; no orphaned junction rows                                                                                                 |
| Item data correctness    | 7     | FansToys items are `is_third_party = true` (118 count); Hasbro items are `is_third_party = false` (277 count); spot-checks on FT-01 and Bumblebee with field-level assertions |
| Idempotency              | 2     | Purge + re-seed produces identical row counts; upsert mode (no purge) produces identical row counts                                                                           |

**Key design decisions:**

- `describe.skipIf(!DB_URL)` — entire suite skips without failure when no database is available, so local `npm test` works without PostgreSQL
- `beforeAll` runs `seed:purge` with a 90-second timeout to accommodate cold-start seed ingestion
- `afterAll` truncates all catalog tables to leave the database clean
- `queryOrphanedFKs` helper uses LEFT JOIN + IS NULL pattern to detect dangling FK references, returning the slug of the offending row for clear error messages
- Idempotency tests capture row counts before and after re-running the seed script, verifying `ON CONFLICT (slug) DO UPDATE` semantics

### 2. Gherkin Test Scenario Document

Written-first scenario document mapping 1:1 to the integration test cases.

**Created:**

- `docs/test-scenarios/INT_SEED_INGESTION.md` — 121 lines with 8 scenarios:
  - Happy Path: Row Counts After Seed
  - Integrity: No Duplicate Slugs
  - Integrity: FK References Are Valid
  - Domain: Combiner Relationships
  - Domain: Junction Table Multi-Group Membership
  - Domain: Item Data Correctness
  - Idempotency: Re-Seed Produces Same Results
  - Guard: Graceful Skip Without Database

### 3. Scenario Mapping Table Update

**Modified:**

- `docs/test-scenarios/README.md` — Added `INT_SEED_INGESTION.md` → `api/src/db/seed-integration.test.ts` mapping row

---

## Technical Details

### Companion to seed-validation.test.ts

The project now has two complementary seed test layers:

| Layer             | File                       | What it tests                                                                                   | Requires DB? |
| ----------------- | -------------------------- | ----------------------------------------------------------------------------------------------- | ------------ |
| Static validation | `seed-validation.test.ts`  | JSON structure, slug format, FK slug resolution against other JSON files, metadata counts       | No           |
| Integration       | `seed-integration.test.ts` | Actual database state after ingestion, SQL-level uniqueness, FK constraints, upsert idempotency | Yes          |

Static validation catches structural errors before they hit the database. Integration tests catch issues that only surface during actual SQL execution — constraint violations, slug collisions across files, type coercion mismatches, and upsert conflict resolution.

### queryOrphanedFKs Pattern

```typescript
async function queryOrphanedFKs(
  pool: pg.Pool,
  childTable: CatalogTable,
  childCol: string,
  parentTable: CatalogTable
): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT c.slug FROM ${childTable} c
     LEFT JOIN ${parentTable} p ON c.${childCol} = p.id
     WHERE c.${childCol} IS NOT NULL AND p.id IS NULL`
  );
  return rows.map((r) => r.slug);
}
```

Returns an empty array on success; returns the slugs of offending rows on failure. The `IS NOT NULL` filter excludes nullable FKs that are legitimately NULL. Special-cased for `character_sub_groups` (junction table with no slug column) to return `character_id::text` instead.

### Idempotency Testing Strategy

Two distinct modes are tested:

1. **Purge + re-seed** (`seed:purge`): TRUNCATEs all tables then re-inserts everything. Verifies no data drift from repeated full reloads.
2. **Upsert mode** (`seed`): Runs `INSERT ... ON CONFLICT (slug) DO UPDATE` over existing data. Verifies no row count inflation from re-running without purge.

Both tests use a before/after row count comparison across all 9 catalog tables.

---

## Validation & Testing

The test suite itself is the validation artifact. Expected to produce 46+ test cases across 7 `describe` blocks when run against a seeded database.

---

## Impact Assessment

- **Seed pipeline confidence**: Developers can now verify that `npm run seed:purge` produces a correct, consistent database state — not just well-formed JSON files
- **CI integration**: Tests auto-skip without `DATABASE_URL`, so they can be conditionally enabled in CI pipelines with a PostgreSQL service container
- **Regression detection**: Any future seed data change that breaks FK integrity, introduces slug duplicates, or changes row counts will be caught immediately
- **Idempotency guarantee**: Confirms the ingestion script is safe to run repeatedly without data corruption

---

## Related Files

**Created (2):**

- `api/src/db/seed-integration.test.ts`
- `docs/test-scenarios/INT_SEED_INGESTION.md`

**Modified (1):**

- `docs/test-scenarios/README.md`

---

## Summary Statistics

| Metric                   | Count |
| ------------------------ | ----- |
| Files created            | 2     |
| Files modified           | 1     |
| Lines added              | 528   |
| Test sections            | 7     |
| Test cases               | 46+   |
| Gherkin scenarios        | 8     |
| Tables verified          | 9     |
| FK relationships checked | 12    |

---

## Status

✅ COMPLETE
