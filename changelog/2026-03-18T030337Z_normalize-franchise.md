# Normalize Franchise TEXT to Reference Table

**Date:** 2026-03-18
**Time:** 03:03:37 UTC
**Type:** Feature
**Phase:** 1.4 (Catalog Schema/Seed)
**Version:** v0.4.2

## Summary

Normalized the free-text `franchise` column on 5 catalog tables (characters, factions, sub_groups, continuity_families, toy_lines) into a proper `franchises` reference table with UUID FK, slug-based filtering, and FK enforcement. This unblocks Phase 1.5 (Catalog API) by providing consistent slug-based franchise filtering across all endpoints.

---

## Changes Implemented

### 1. Database Migration (015_normalize_franchise.sql)

- Created `franchises` reference table: `id UUID PK, slug TEXT UNIQUE, name TEXT UNIQUE, sort_order INT, notes TEXT, created_at TIMESTAMPTZ`
- Seeded 4 initial franchises: Transformers, G.I. Joe, Star Wars, Macross
- Added `franchise_id UUID NOT NULL` FK to all 5 tables (ON DELETE RESTRICT)
- Migrated existing TEXT data to UUIDs via UPDATE + JOIN (NULL defaults to Transformers)
- Updated unique indexes: `idx_characters_name_franchise_cf` and `idx_sub_groups_name_franchise` now use `franchise_id` instead of TEXT
- Added FK performance indexes on all 5 tables
- Dropped old TEXT `franchise` columns
- Full reversible `migrate:down` included

### 2. Seed Data Updates

- **Created:** `api/db/seed/reference/franchises.json` — 4 franchises with slugs, sort order, and notes
- **Modified:** 5 seed files to change `"franchise": "Transformers"` → `"franchise_slug": "transformers"`:
  - `reference/factions.json` — 11 entries (cross-franchise factions assigned to `transformers`)
  - `reference/sub_groups.json` — 52 entries
  - `reference/continuity_families.json` — 10 entries
  - `reference/toy_lines.json` — 16 entries
  - `characters/g1-characters.json` — 440 entries

### 3. Ingest Script Updates

- Added `FranchiseRecord` interface and `upsertFranchises()` function
- Added `'franchises'` to `SLUG_TABLES` set and `runPurge()` TRUNCATE list
- Updated all record interfaces: `franchise: string | null` → `franchise_slug: string`
- Updated all upsert functions to accept `franchiseMap` and resolve `franchise_slug` → `franchise_id`
- Updated `runSeed()` to call `upsertFranchises()` first (import order -1)

### 4. TypeScript Types

- Added `Franchise` interface to `api/src/types/index.ts`
- Updated 5 interfaces: `franchise: string | null` → `franchise_id: string`

### 5. Validation Tests

- Added franchise seed data to metadata count, slug format, and no-duplicate-slugs tests
- Added FK referential integrity tests for `franchise_slug` on all 5 entity types
- Updated `REQUIRED_CHAR_FIELDS`: `'franchise'` → `'franchise_slug'`
- Updated character uniqueness test to use `franchise_slug`

### 6. Documentation

- Updated ADR: status → Accepted, added Macross, NOT NULL design, naming conventions
- Updated Schema_Design_Rationale.md: new section 4 for franchise normalization
- Updated ADR_Catalog_API_Architecture.md: franchise filter now uses FK-based slug JOIN
- Updated seed README: franchises in import order table, column mapping
- Updated ER diagram: added `franchises` table, updated `franchise_id` FK on all 5 tables

---

## Technical Details

### Naming Convention

- **Seed JSON:** `franchise_slug` (slug string) — follows `faction_slug`, `manufacturer_slug` pattern
- **DB column + TypeScript:** `franchise_id` (UUID FK) — follows `faction_id`, `continuity_family_id` pattern

### Cross-Franchise Strategy

Factions like Human, Neutral, Other were previously `franchise: null`. With NOT NULL `franchise_id`, they're assigned to Transformers (their current sole context). When duplicated for other franchises, new entries get suffixed slugs (e.g., `human-gi-joe`).

### Index Changes

```sql
-- Before
(lower(name), lower(franchise), continuity_family_id)  -- characters
(lower(name), COALESCE(franchise, ''))                   -- sub_groups

-- After
(lower(name), franchise_id, continuity_family_id)        -- characters
(lower(name), franchise_id)                               -- sub_groups (simplified, NOT NULL)
```

---

## Validation & Testing

- **TypeScript build:** zero errors (`npm run build`)
- **Tests:** 442 passed, 0 failures (`npm test`)
- **Migration:** applies cleanly (`npx dbmate up`)
- **Re-seed:** purge + re-seed succeeds with all 4 franchises, 440 characters, 395 items
- **Schema dump:** `npx dbmate dump` reflects new table + FK columns
- **Spot-check:** `SELECT f.slug, fr.slug FROM factions f JOIN franchises fr ON fr.id = f.franchise_id` returns correct franchise assignments

---

## Impact Assessment

- **Unblocks Phase 1.5:** Catalog API can use consistent `?franchise=transformers` slug-based filtering via JOIN
- **Multi-franchise ready:** G.I. Joe, Star Wars, Macross characters/items can be added with FK enforcement
- **No breaking changes:** Migration is additive (creates table, adds FK columns) then cleans up (drops TEXT columns)

---

## Related Files

**Created:**

- `api/db/migrations/015_normalize_franchise.sql`
- `api/db/seed/reference/franchises.json`
- `changelog/2026-03-17T193127_normalize-franchise.md`

**Modified:**

- `api/db/seed/reference/factions.json`
- `api/db/seed/reference/sub_groups.json`
- `api/db/seed/reference/continuity_families.json`
- `api/db/seed/reference/toy_lines.json`
- `api/db/seed/characters/g1-characters.json`
- `api/db/seed/ingest.ts`
- `api/src/types/index.ts`
- `api/src/db/seed-validation.test.ts`
- `api/db/schema.sql` (auto-generated by dbmate dump)
- `api/db/seed/README.md`
- `docs/decisions/ADR_Franchise_Normalization.md`
- `docs/decisions/Schema_Design_Rationale.md`
- `docs/decisions/ADR_Catalog_API_Architecture.md`
- `docs/diagrams/toy-catalog-database-diagrams.jsx`

---

## Status

✅ COMPLETE
