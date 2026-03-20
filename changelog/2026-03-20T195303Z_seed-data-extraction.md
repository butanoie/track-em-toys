# Seed Data Extraction — Proprietary Data Separated from Monorepo

**Date:** 2026-03-20
**Time:** 19:53:03 UTC
**Type:** Infrastructure
**Phase:** 1.4 (Seed Data)
**Version:** v0.4.1

## Summary

Extracted proprietary seed data (characters, appearances, relationships, items, reference data) from the monorepo into a separate staging directory (`~/Repos/track-em-toys-data/`) for separate licensing. Replaced with minimal self-consistent sample fixtures in `api/db/seed/sample/`. Added `SEED_DATA_PATH` env var to toggle between sample and full data. Refactored all file discovery to auto-discovery (no hardcoded file lists).

---

## Changes Implemented

### 1. Sample Fixture Data

Created `api/db/seed/sample/` with minimal FK-consistent fixtures using real slugs:

- **Reference:** 2 franchises, 2 continuity families, 3 factions, 2 sub-groups, 2 manufacturers, 2 toy lines
- **Characters:** 4 records (Optimus Prime, Bumblebee, Devastator, Scrapper)
- **Appearances:** 4 records (one per character)
- **Relationships:** 2 records (combiner-component + mentor-student)
- **Items:** 3 records (official Hasbro + third-party FansToys + variant)

**Created:**

- `api/db/seed/sample/reference/franchises.json`
- `api/db/seed/sample/reference/continuity_families.json`
- `api/db/seed/sample/reference/factions.json`
- `api/db/seed/sample/reference/sub_groups.json`
- `api/db/seed/sample/reference/manufacturers.json`
- `api/db/seed/sample/reference/toy_lines.json`
- `api/db/seed/sample/characters/sample-characters.json`
- `api/db/seed/sample/appearances/sample-appearances.json`
- `api/db/seed/sample/relationships/sample-relationships.json`
- `api/db/seed/sample/items/sample-items.json`

### 2. SEED_DATA_PATH Environment Variable

`ingest.ts` and `seed-validation.test.ts` now read `SEED_DATA_PATH` env var. When unset, both default to `api/db/seed/sample/`. When set to an external directory, that directory is used instead.

**Modified:**

- `api/db/seed/ingest.ts` — `SEED_DIR` defaults to `path.join(SCRIPT_DIR, 'sample')`, log message shows active seed directory
- `api/src/db/seed-validation.test.ts` — `SEED_DIR` defaults to `../../db/seed/sample`
- `api/.env.example` — Added `SEED_DATA_PATH` documentation

### 3. Auto-Discovery Refactor

Replaced hardcoded `CHARACTER_FILES` (13 entries) and `ITEM_FILES` (7 entries) arrays with directory auto-discovery matching the existing pattern used for appearances and relationships. Consolidated 5 nearly-identical loader functions into generic `loadSeedFile<T>` and `discoverAndLoad<T>` helpers.

**Modified:**

- `api/src/db/seed-validation.test.ts` — Extracted `discoverJsonFiles()` and `discoverAndLoad<T>()` helpers; consolidated loaders into `loadSeedFile<T>()`

### 4. Integration Test Updates

Updated `seed-integration.test.ts` row counts to match sample data. Guarded exact-count assertions with `describe.skipIf(!!process.env['SEED_DATA_PATH'])` so the test works with both sample and full datasets. Removed data-specific tests (Devastator components, Apeface sub-groups, exact manufacturer counts) that referenced slugs not in sample data. Kept structural tests that work with any dataset.

**Modified:**

- `api/src/db/seed-integration.test.ts`

### 5. Data Migration

Moved all proprietary seed data to `~/Repos/track-em-toys-data/`:

- 13 character files, 15 appearance files, 8 relationship files, 7 item files (in 3 subdirs), 6 reference files
- `scripts/migrate-to-relationships.py`
- `.claude/skills/research-catalog/` (skill + evals + references)

**Deleted from monorepo:**

- `api/db/seed/characters/` (13 files)
- `api/db/seed/appearances/` (15 files)
- `api/db/seed/relationships/` (8 files)
- `api/db/seed/items/` (7 files across 3 subdirs)
- `api/db/seed/reference/` (6 files)
- `api/db/seed/scripts/` (1 file)
- `.claude/skills/research-catalog/` (skill directory)

### 6. Documentation Updates

**Modified:**

- `api/db/seed/README.md` — Rewritten for dual-source architecture (sample + external)
- `CLAUDE.md` — Updated seed data references
- `api/CLAUDE.md` — Updated seed data conventions, removed "planned for extraction" note

---

## Technical Details

### SEED_DATA_PATH Resolution

```typescript
// ingest.ts
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const SEED_DIR = process.env['SEED_DATA_PATH']
  ? path.resolve(process.env['SEED_DATA_PATH'])
  : path.join(SCRIPT_DIR, 'sample')
```

### External Data Repo Layout

```
~/Repos/track-em-toys-data/
├── reference/        (full reference data)
├── characters/       (13 files, 1000+ characters)
├── appearances/      (15 files, 1500+ appearances)
├── relationships/    (8 files, 245 relationships)
├── items/            (7 files in hasbro/, takara-tomy/, fanstoys/)
├── scripts/          (migrate-to-relationships.py)
└── research-catalog/ (Claude skill for data generation)
```

---

## Validation & Testing

- `seed-validation.test.ts`: 63 tests pass against sample data (353 against full data via SEED_DATA_PATH)
- Full API test suite: 620 tests pass, 30 test files
- Web test suite: 466 tests pass, 62 test files
- Pre-existing issues (not introduced): TS error in `photos/routes.test.ts`, JSDoc warnings

---

## Impact Assessment

- **Developer onboarding:** New contributors can `npm run seed` immediately with sample data — no private repo access needed
- **CI/CD:** Tests run against sample data by default; no private repo dependency for green builds
- **Data licensing:** Proprietary catalog data can now be separately licensed without affecting the open-source platform
- **Test resilience:** Auto-discovery eliminates the need to update hardcoded file lists when adding new seed files

---

## Status

✅ COMPLETE — Extraction done, sample fixtures created, all tests passing, documentation updated.
