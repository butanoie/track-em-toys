# Seed Data Extraction & Entity Relationship System

**Date:** 2026-03-20
**Time:** 20:13:24 UTC
**Type:** Infrastructure / Feature
**Phase:** 1.4 (Seed Data)
**Version:** v0.4.1

## Summary

Replaced inline combiner fields with a general-purpose typed entity relationship system in seed data validation. Extracted all proprietary catalog data to a separate private repository, leaving minimal sample fixtures with `SEED_DATA_PATH` env var for toggling between sample and full datasets. Refactored all seed file discovery to auto-discovery.

---

## Changes Implemented

### 1. Entity Relationship System

Replaced domain-specific combiner fields (`combined_form_slug`, `combiner_role`, `component_slugs`) on character records with a general-purpose typed relationship system supporting 7 relationship types.

**Relationship types:** `combiner-component`, `binary-bond`, `vehicle-crew`, `rival`, `sibling`, `mentor-student`, `evolution`

**Record shape:**

```json
{
  "type": "combiner-component",
  "subtype": null,
  "entity1": { "slug": "devastator", "role": "gestalt" },
  "entity2": { "slug": "scrapper", "role": "right leg" },
  "metadata": {}
}
```

**Validation additions to `seed-validation.test.ts`:**

- `RelationshipRecord`, `RelationshipEntity`, `RelationshipFile` interfaces
- `RELATIONSHIP_TYPE_REGISTRY` Map with per-type role/subtype allowlists
- Auto-discovery of `relationships/*.json` files
- 12+ validation tests: required fields, valid types, entity slug resolution, self-reference prevention, role/subtype validation, symmetric slug ordering, duplicate tuple detection, combiner cross-validation against `is_combined_form`, vehicle-crew `character_type` validation

### 2. Seed Data Extraction

Moved all proprietary catalog data to a separate repository. Replaced with minimal FK-consistent sample fixtures.

**Sample data (`api/db/seed/sample/`):**

- Reference: 2 franchises, 2 continuity families, 3 factions, 2 sub-groups, 2 manufacturers, 2 toy lines
- Characters: 4 records (Optimus Prime, Bumblebee, Devastator, Scrapper)
- Appearances: 4 records (one per character)
- Relationships: 2 records (combiner-component + mentor-student)
- Items: 3 records (official Hasbro + third-party FansToys)

**Deleted from monorepo (moved to private repo):**

- 13 character files, 15 appearance files, 8 relationship files, 7 item files, 6 reference files
- `scripts/migrate-to-relationships.py`
- `.claude/skills/research-catalog/` (data generation skill + evals + entity schemas)

### 3. SEED_DATA_PATH Environment Variable

`ingest.ts` and `seed-validation.test.ts` now read `SEED_DATA_PATH`. When unset, both default to `api/db/seed/sample/`. When set, they use the external repo directory.

```typescript
const SEED_DIR = process.env['SEED_DATA_PATH']
  ? path.resolve(process.env['SEED_DATA_PATH'])
  : path.join(SCRIPT_DIR, 'sample');
```

### 4. Auto-Discovery Refactor

Replaced hardcoded `CHARACTER_FILES` (13 entries) and `ITEM_FILES` (7 entries) arrays in `seed-validation.test.ts` with directory auto-discovery. Consolidated 5 nearly-identical loader functions into generic helpers:

```typescript
function loadSeedFile<T>(relPath: string): T;
function discoverJsonFiles(subdir: string, options?: { recursive: boolean }): string[];
function discoverAndLoad<T>(subdir: string, options?: { recursive: boolean }): Array<{ file: string } & T>;
```

All four data types (characters, items, appearances, relationships) now use the same discovery pattern.

### 5. Integration Test Updates

Updated `seed-integration.test.ts` for sample data compatibility:

- Row counts updated to sample sizes (e.g., characters: 4, items: 3)
- Exact-count assertions guarded with `describe.skipIf(!!process.env['SEED_DATA_PATH'])`
- Removed data-specific tests (Devastator 6-component enumeration, Apeface sub-groups, exact manufacturer counts)
- Kept structural tests (FK integrity, idempotency, `is_third_party` consistency) that work with any dataset

### 6. Documentation Updates

- `CLAUDE.md` — Added seed data extraction notes, relationship system reference, GI Joe conventions, research-catalog removal notice
- `api/CLAUDE.md` — Updated seed conventions for dual-source architecture, documented dead combiner code in `ingest.ts`, added integration test `SEED_DATA_PATH` behavior
- `api/db/seed/README.md` — Rewritten for dual-source architecture with external repo layout, updated import order table (added step 5.7 for relationships, removed old combiner columns from mapping)
- `api/.env.example` — Added `SEED_DATA_PATH` documentation

---

## Technical Details

### Known Pre-Existing Debt (Not Addressed)

- `ingest.ts` has dead combiner pass-2 code (`upsertCharactersPass2`) — superseded by relationship system, pending cleanup
- `ingest.ts` does not ingest `relationships/*.json` — `character_relationships` DB table + ingestion step pending (issue #80)
- Pre-existing TS error in `photos/routes.test.ts` and JSDoc warnings unrelated to this work

---

## Validation & Testing

- `seed-validation.test.ts`: 63 tests pass against sample data; 353 pass against full data via `SEED_DATA_PATH`
- Full API test suite: 620 tests pass, 30 test files
- Web test suite: 466 tests pass, 62 test files

---

## Impact Assessment

- **Developer onboarding:** `npm run seed` works out of the box with sample data — no private repo access needed
- **CI/CD:** Tests run against sample data by default with no private repo dependency
- **Data licensing:** Proprietary catalog data separately licensed from the open-source platform
- **Extensibility:** Relationship system supports 7 types with role/subtype validation — new types added by extending the registry, no schema changes needed

---

## Related Files

**Created:**

- `api/db/seed/sample/` (10 files — reference, characters, appearances, relationships, items)

**Modified:**

- `api/src/db/seed-validation.test.ts` — relationship interfaces/types/registry, auto-discovery, generic loaders, SEED_DATA_PATH
- `api/src/db/seed-integration.test.ts` — sample counts, skipIf guard, removed data-specific tests
- `api/db/seed/ingest.ts` — SEED_DATA_PATH support, log message
- `api/db/seed/README.md` — rewritten for dual-source
- `api/.env.example` — SEED_DATA_PATH entry
- `CLAUDE.md` — seed data, relationship, GI Joe conventions
- `api/CLAUDE.md` — seed data conventions update

**Deleted:**

- `api/db/seed/characters/` (13 files), `api/db/seed/appearances/` (15 files), `api/db/seed/relationships/` (8 files), `api/db/seed/items/` (7 files), `api/db/seed/reference/` (6 files), `api/db/seed/scripts/` (1 file)
- `.claude/skills/research-catalog/` (4 files)

---

## Status

✅ COMPLETE
