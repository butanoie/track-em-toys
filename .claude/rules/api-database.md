---
paths:
  - "api/db/**"
  - "api/src/db/**"
---

# API Database Detailed Patterns

## Catalog & Seed Data

- Catalog tables use UUID PKs with a unique `slug` column (e.g. `"optimus-prime"`) for stable references and URL-friendly routes
- Seed data uses slug-based FK references between entities — NEVER integer IDs (integer IDs are positional and break when data is reordered or regenerated)
- Seed data organization: see `api/db/seed/README.md` for directory structure, import order, and column mapping
- Sample seed fixtures live in `api/db/seed/sample/` — minimal FK-consistent data for dev/CI. Full proprietary catalog data lives in a separate private repo (`track-em-toys-data`), activated via `SEED_DATA_PATH` env var
- `ingest.ts` and `seed-validation.test.ts` default to `sample/` when `SEED_DATA_PATH` is unset — all file types are auto-discovered (no hardcoded file lists)

## Character & Item Relationships

- Character relationships (combiner, vehicle-crew, partner-bond, rival, etc.) are typed records in `relationships/*.json` — auto-discovered by validation test
- Characters do NOT have `combined_form_slug`, `combiner_role`, or `component_slugs` — these were replaced by the relationship system
- `ingest.ts` ingests `relationships/*.json` into `character_relationships` table (step 5.7) and auto-generates `item_character_depictions` rows from item `character_appearance_slug` fields (step 6b)
- `item_character_depictions` junction table replaces the old `items.character_id` and `items.character_appearance_id` direct FKs — character is derived via `appearance_id -> character_appearances.character_id`
- Item depiction upsert uses DELETE-then-INSERT pattern (like `character_sub_groups`) to handle changed appearance slugs between seed runs
- `character_relationships` table stores all char-to-char relationships with `UNIQUE(type, entity1_id, entity2_id)` — `ON CONFLICT` target must match
- `item_relationships` table stores item-to-item relationships (mold-origin, gift-set-contents, variant). Seed data in `item_relationships/*.json`, ingested at step 6c after item_character_depictions
- Item relationship seed records use flat fields (`item1_slug`, `item2_slug`, `item1_role`, `item2_role`) — NOT nested entities like character relationships
- Characters no longer have `combined_form_id` or `combiner_role` columns (dropped in migration 027) — combiner data is in `character_relationships`
- Character detail API response no longer includes `combiner_role`, `combined_form`, or `component_characters` — use the `/:slug/relationships` endpoint instead
- Item API responses return `characters: [{ slug, name, appearance_slug, is_primary }]` (array) instead of `character: { slug, name }` (single object)
- Item detail includes richer depiction data: `characters: [{ slug, name, appearance_slug, appearance_name, appearance_source_media, appearance_source_name, is_primary }]`
- Relationship API endpoints: `GET /:slug/relationships` on both characters and items — returns `{ relationships: [...] }` with bidirectional UNION ALL queries
- `is_combined_form` remains on character records as a denormalized flag, cross-validated against relationship data
- Seed validation test (`seed-validation.test.ts`) has a per-type relationship registry (`RELATIONSHIP_TYPE_REGISTRY`) with role and subtype allowlists
- `seed-integration.test.ts` exact row-count assertions are wrapped in `describe.skipIf(!!process.env['SEED_DATA_PATH'])` — they only run against sample data. Structural assertions (FK integrity, idempotency) run against any dataset.
- Seed `_metadata.total` must always equal the actual array length — recount after any addition or removal, never increment/decrement manually
- Seed FK naming: JSON uses `{table}_slug` (e.g. `franchise_slug`, `faction_slug`), DB column is `{table}_id` (UUID FK). Ingest script resolves slugs to UUIDs via `resolveSlug()` maps

## Reference Tables

- Reference tables follow the pattern: `id UUID PK, slug TEXT UNIQUE, name TEXT, sort_order INT, notes TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ` (migration 031 added `updated_at` + triggers to reference tables and relationship tables for bidirectional sync)
- When adding a column to a reference table: add to seed JSON, record interface in `seed-types.ts`, TypeScript interface in `types/index.ts`, and validation tests in `seed-validation.test.ts`
- When changing a UNIQUE constraint, grep `ON CONFLICT` in `db/seed/ingest.ts` AND `db/seed/sync.ts` — the conflict target must match the new constraint exactly

## Seed Data Sync

- `npm run sync:push` — push seed records to DB where `seed.last_modified > db.updated_at`; stamps `last_modified` back to seed file after DB commit
- `npm run sync:pull` — pull DB records to seed files where `db.updated_at > seed.last_modified`; appends new DB records to appropriate seed file
- `npm run sync` — runs push then pull; after completion all timestamps converge
- `npm run seed` — unchanged force-overwrite (ignores timestamps)
- Seed JSON records have an optional `last_modified` ISO 8601 UTC field; when absent, treated as infinitely old (DB always wins on pull, seed never wins on push)
- Shared types and helpers extracted to `db/seed/seed-types.ts` and `db/seed/seed-io.ts` — both `ingest.ts` and `sync.ts` import from these
- `sync.ts` buffers seed file writes until after DB COMMIT — no seed file changes on DB rollback
- JSON file writes use atomic `.tmp` + `renameSync` to prevent corruption on crash
- `assembleCharacterMetadata()` packs `notes`/`series_year`/`year_released` into JSONB for push; `disassembleCharacterMetadata()` unpacks for pull
- Junction tables (`character_sub_groups`, `item_character_depictions`) have no independent sync — they are derived from parent records during push and recovered via JOINs during pull
- Deletions are warned but never acted upon — records on one side only are logged, not deleted
- See `docs/decisions/ADR_Seed_Sync_Architecture.md` for full design rationale
- `tsconfig.seed.json` covers `db/seed/**/*.ts` — add new seed scripts there, NOT in main `tsconfig.json` (which has `rootDir: "src"`)
- Tests for seed modules (`db/seed/`) must live in `src/db/` (Vitest only includes `src/**/*.test.ts`), use dynamic `await import()` to cross the rootDir boundary, and be excluded from main `tsconfig.json` + added to `tsconfig.seed.json`
- `eslint.config.js` `allowDefaultProject` lists test files excluded from main tsconfig — add new cross-root test files there

## GDPR / User Deletion (Tombstone Pattern)

- User "deletion" = scrub PII (`email`, `display_name`, `avatar_url`) + set `deleted_at` — the `users` row is preserved as a tombstone so all FKs remain intact
- NEVER use `ON DELETE CASCADE` or `ON DELETE SET NULL` on user FKs — the user row is never actually deleted from the database
- User FKs keep their original nullability — `NOT NULL` FKs like `catalog_edits.editor_id` stay `NOT NULL` because the referenced user row always exists
- App checks `u.deleted_at IS NOT NULL` on JOINs to display "Deleted user" instead of the scrubbed fields
- Auth data (`refresh_tokens`, `oauth_accounts`) is hard-deleted during scrub — no need for tombstone on auth tables
- GDPR purge must also scrub `auth_events` PII (`ip_address`, `user_agent`, `metadata`) — IP addresses and user agents are personal data under GDPR
- `oauth_accounts` and `refresh_tokens` use `ON DELETE RESTRICT` (fixed in migration 021 from legacy CASCADE)
- `auth_events.user_id` uses `ON DELETE RESTRICT` (fixed in migration 030 from legacy SET NULL) — `user_id` is nullable (some events are pre-auth/system-generated), nullability is independent of the RESTRICT constraint
- `deleteOrphanUser` only guards against `oauth_accounts` FK — RESTRICT on other tables causes the delete to fail if rows exist, but the caller's try/catch handles this gracefully
- When adding a new table with a user FK, no special ON DELETE clause is needed (default RESTRICT is correct)

## Collection API RLS Patterns

- **All collection queries use `withTransaction(fn, request.user.sub)`** — reads AND writes. Unlike catalog reads (`pool.query()` directly), collection data is RLS-protected and needs the `app.user_id` session variable set on every query
- Collection query functions receive `client: PoolClient` (from withTransaction callback), never import `pool` directly
- `FORCE ROW LEVEL SECURITY` on `collection_items` — ensures even the table owner (migration runner) is subject to RLS policies
- Soft delete via `deleted_at` column — all list/stats/check queries filter `WHERE deleted_at IS NULL`
- PATCH/DELETE use `SELECT ... FOR UPDATE` to serialize concurrent mutations and prevent TOCTOU races with soft-delete
- PATCH partial updates: use `Object.hasOwn(body, 'field')` to distinguish absent key from `null` value (Fastify strips absent keys from validated body)
- Stats query uses a single CTE for snapshot consistency — do NOT use `Promise.all` with multiple queries on a single `PoolClient` (pg does not support concurrent queries on one connection)
