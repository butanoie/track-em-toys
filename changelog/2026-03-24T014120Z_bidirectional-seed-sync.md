# Bidirectional Seed Data Sync

**Date:** 2026-03-24
**Time:** 01:41:20 UTC
**Type:** Feature
**Phase:** 1.4 (Seed Data)
**Version:** v0.5.0

## Summary

Added a bidirectional sync mechanism between seed JSON files and the PostgreSQL database. Uses per-record `last_modified` timestamps compared against DB `updated_at` columns. Three new CLI commands (`sync:push`, `sync:pull`, `sync`) complement the existing `npm run seed` force-overwrite.

---

## Changes Implemented

### 1. Migration 031: `updated_at` on Reference and Relationship Tables

Added `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `BEFORE UPDATE` triggers to 6 tables that previously lacked timestamp tracking: `franchises`, `continuity_families`, `factions`, `sub_groups`, `character_relationships`, `item_relationships`.

### 2. Shared Modules Extracted from `ingest.ts`

Extracted type interfaces and I/O helpers into shared modules so both `ingest.ts` and `sync.ts` can import them:

- `seed-types.ts` — All record interfaces (CharacterRecord, ItemRecord, etc.) with optional `last_modified` field
- `seed-io.ts` — `loadJson`, `saveJson`, `discoverJsonFiles`, `resolveSlug`, `buildSlugMap`, `buildReverseSlugMap`, `seedIsNewer`, `dbIsNewer`, `assembleCharacterMetadata`, `disassembleCharacterMetadata`

### 3. Sync CLI Script

`sync.ts` implements bidirectional sync with push and pull in dependency order (franchises first, items last):

- **Push** (seed → DB): Checks `last_modified > updated_at` before upserting. Uses `RETURNING updated_at` to stamp back exact DB timestamps to seed files after COMMIT.
- **Pull** (DB → seed): Queries DB with FK JOINs to recover slugs. Updates seed records in-place. Appends new DB records to appropriate files.
- **Deletion warnings**: Records on one side only are logged, never deleted.

### 4. Refactored `ingest.ts`

Replaced inline types and helpers with imports from shared modules. Exported `runSeed()` for potential reuse. Logic unchanged.

**Created:**

- `api/db/migrations/031_updated_at_reference_and_relationship_tables.sql`
- `api/db/seed/seed-types.ts`
- `api/db/seed/seed-io.ts`
- `api/db/seed/sync.ts`
- `api/src/db/seed-io.test.ts`
- `docs/decisions/ADR_Seed_Sync_Architecture.md`
- `docs/test-scenarios/INT_Seed_Sync.md`

**Modified:**

- `api/db/seed/ingest.ts` — imports from shared modules, exports `runSeed`
- `api/db/seed/README.md` — documented sync commands
- `api/package.json` — added `sync`, `sync:push`, `sync:pull` scripts
- `api/tsconfig.seed.json` — widened include to `db/seed/**/*.ts`
- `api/tsconfig.json` — excluded seed-io test (rootDir constraint)
- `api/eslint.config.js` — `allowDefaultProject` for seed-io test
- `api/CLAUDE.md` — added Seed Data Sync conventions
- `docs/test-scenarios/README.md` — added mapping entry

---

## Technical Details

### Timestamp Comparison

```
Push: seed.last_modified > db.updated_at → upsert, stamp back
Pull: db.updated_at > seed.last_modified → update seed in-place
Absent last_modified → treated as infinitely old (new Date(0))
```

### Push Atomicity

Push runs in a DB transaction. Seed file timestamp stamps are buffered in memory and only written after `COMMIT`. If the transaction rolls back, no seed files are modified.

### Atomic JSON Writes

`saveJson()` writes to a temporary file then uses `fs.renameSync()` (POSIX-atomic) to replace the target, preventing corruption on crash.

### DB Timestamp Accuracy

All push functions use `RETURNING updated_at` to capture the exact DB-committed timestamp rather than `new Date()` from the JS clock. This prevents clock-skew issues between the application and database servers.

---

## Validation & Testing

### Unit Tests

18 tests for shared helpers in `src/db/seed-io.test.ts`:

- `seedIsNewer`: 5 tests (absent, null DB, newer, older, equal)
- `dbIsNewer`: 5 tests (absent, null DB, newer, older, equal)
- `assembleCharacterMetadata`: 2 tests (pack, omit nulls)
- `disassembleCharacterMetadata`: 4 tests (extract, missing, null, wrong types)
- `loadJson`/`saveJson`: 2 tests (roundtrip, atomic overwrite)

### Full Suite

- API: 734 tests passed, 0 warnings
- Web: 638 tests passed
- TypeScript: both tsconfigs pass (main + seed)
- ESLint: 0 errors, 0 warnings
- Prettier: all formatted

---

## Impact Assessment

- **Development workflow**: Seed data corrections made via the web UI (or direct DB edits) can now flow back to seed JSON files, preventing regressions when `npm run seed` is run
- **Backward compatible**: `npm run seed` behavior is unchanged
- **Migration required**: Migration 031 must be applied before sync commands can be used

---

## Status

✅ COMPLETE
