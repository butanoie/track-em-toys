# ADR: Bidirectional Seed Data Sync

**Date:** 2026-03-23
**Status:** Accepted
**Phase:** 1.4 (Seed Data)

## Context

The seed ingestion pipeline (`api/db/seed/ingest.ts`) is a one-directional tool: JSON files → PostgreSQL via `ON CONFLICT DO UPDATE`. During development, catalog corrections made in the database (via the web UI or direct queries) have no path back to the seed JSON files. This causes seed data to drift from the live database, leading to regressions when `npm run seed` overwrites DB corrections with stale seed data.

## Decision

Add a **bidirectional sync mechanism** that uses per-record `last_modified` timestamps in seed JSON compared against DB `updated_at` columns to determine sync direction. The existing `npm run seed` command remains unchanged as a force-overwrite escape hatch.

### Commands

| Command             | Direction         | Behavior                                                           |
| ------------------- | ----------------- | ------------------------------------------------------------------ |
| `npm run sync:push` | Seed → DB         | Upserts only records where `seed.last_modified > db.updated_at`    |
| `npm run sync:pull` | DB → Seed         | Updates JSON files only where `db.updated_at > seed.last_modified` |
| `npm run sync`      | Both              | Push first, then pull. After completion, all timestamps converge   |
| `npm run seed`      | Seed → DB (force) | Unchanged — always overwrites DB, ignores timestamps               |

### Key Design Decisions

1. **Last-writer-wins** — Simple two-timestamp comparison. No sync-point tracking or conflict detection. Whichever side has the newer timestamp wins.

2. **Per-record `last_modified` in seed JSON** — ISO 8601 UTC string on every record. When absent, treated as infinitely old (`new Date(0)`), so DB always wins on pull and seed never wins on push.

3. **Push stamps `last_modified` back to seed files** — After a successful DB commit, push writes the new timestamp back to the seed JSON. This prevents ping-pong where pull immediately "discovers" the push changes as newer. Seed file writes are buffered until after DB COMMIT to maintain atomicity.

4. **Deletions: warn but don't act** — Records present on one side but not the other are logged as warnings. No automatic deletion in either direction.

5. **New DB records auto-appended** — During pull, records in the DB with no seed counterpart are appended to the appropriate JSON file (matched by franchise/continuity, with fallback to `from-db.json`).

6. **Junction tables derived from parents** — `character_sub_groups` and `item_character_depictions` have no independent sync. They are reconstructed from their parent records (characters' `sub_group_slugs`, items' `character_appearance_slug`) during push, and recovered via JOINs during pull.

### Architecture: Modified Approach C (Pragmatic Balance)

Extract shared types and helpers from `ingest.ts` into shared modules. Create a single `sync.ts` CLI entry point. Keep `ingest.ts` logic unchanged.

**New files:**

- `api/db/migrations/031_updated_at_reference_tables.sql` — Add `updated_at` + triggers to franchises, continuity_families, factions, sub_groups, character_relationships, item_relationships
- `api/db/seed/seed-types.ts` — Shared type interfaces (extracted from `ingest.ts`)
- `api/db/seed/seed-io.ts` — Shared I/O helpers: `loadJson`, `saveJson`, `discoverJsonFiles`, `resolveSlug`, `buildSlugMap`, `buildReverseSlugMap`, `resolveSeedDir`
- `api/db/seed/sync.ts` — CLI entry point with push/pull logic

**Modified files:**

- `api/db/seed/ingest.ts` — Import from shared modules, export `runSeed`
- `api/package.json` — Add `sync`, `sync:push`, `sync:pull` scripts
- `api/tsconfig.seed.json` — Widen include to `db/seed/**/*.ts`

### Tables in Scope

| Category         | Tables                                                             | `updated_at`                        |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------- |
| Reference        | franchises, continuity_families, factions, sub_groups              | Added by migration 031              |
| Entity           | manufacturers, toy_lines, characters, character_appearances, items | Already exists                      |
| Relationship     | character_relationships, item_relationships                        | Added by migration 031              |
| Derived junction | character_sub_groups, item_character_depictions                    | No `updated_at` — synced via parent |

### Timestamp Comparison Logic

```
Push (seed → DB):
  seed.last_modified > db.updated_at  → upsert to DB, stamp last_modified back
  seed.last_modified ≤ db.updated_at  → skip
  seed.last_modified absent            → skip (seed is "infinitely old")
  No DB row exists                     → insert to DB

Pull (DB → seed):
  db.updated_at > seed.last_modified  → update seed record in-place
  db.updated_at ≤ seed.last_modified  → skip
  seed.last_modified absent            → update (DB wins when seed has no timestamp)
  No seed record exists                → append to appropriate file
```

## Consequences

- **Positive:** Seed data stays synchronized with DB corrections. No more regressions from `npm run seed` overwriting curator edits.
- **Positive:** `npm run seed` remains as-is — a reliable force-reset when needed.
- **Positive:** No new dependencies. Same tooling (`tsx`, `pg`, `pino`).
- **Negative:** All seed JSON records need `last_modified` added (one-time migration by the user).
- **Negative:** Refactoring `ingest.ts` to extract shared modules introduces a small regression risk (mitigated by running `npm run seed` + typecheck after).
- **Trade-off:** No conflict detection — if both sides change the same record, the newer timestamp silently wins. Acceptable for a single-developer dev tool.

## Alternatives Considered

1. **Single monolithic `sync.ts`** (Approach A) — Duplicates ~150 lines of types from `ingest.ts`. Simpler but harder to maintain long-term.
2. **Adapter pattern with 20+ files** (Approach B) — Over-engineered for a fixed set of 13 tables. Added complexity with no proportional benefit.
3. **Git-based timestamps** — Use file modification time instead of per-record timestamps. Too coarse — can't distinguish which records in a multi-record file changed.
