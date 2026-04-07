---
paths:
  - 'api/db/**'
  - 'api/src/db/**'
---

# API Database Detailed Patterns

## Adding Columns to Tables With Existing INSERT Sites

When a migration adds a NOT NULL column with a DEFAULT to an existing table, EVERY existing `INSERT` statement that doesn't explicitly set the new column will silently inherit the default. If the default is wrong for some callers — e.g. a privacy-sensitive column where most callers need a non-default value — this is a **latent bug that compiles, passes all existing tests, and ships**.

**Protocol when adding such a column:**

1. `grep -rn "INSERT INTO <table_name>" api/src/` to find every INSERT site.
2. For each INSERT, decide whether the DB default is correct for that caller. If not, add the column to the INSERT column list with an explicit value.
3. If the column's default is "safe for most callers but wrong for a specific flow," update the query function for the wrong-default caller to **require** the new column as a parameter. TypeScript will then force every call site to think about the value.
4. Add a regression test asserting the explicit value is passed — not the default. Mocking-based tests that only assert "the function was called" are NOT sufficient; the test must inspect the actual parameter value passed to the query.

**Historical example — Phase 1.6 amendment #148 (migration 037):** Added `item_photos.visibility TEXT NOT NULL DEFAULT 'public'`. The `insertPendingCatalogPhoto` query for contributed photos wasn't updated initially, so every contribution would have silently become `visibility='public'` — the exact opposite of the privacy-first intent. Caught in the architecture audit; fixed by making `visibility` a required parameter of `insertPendingCatalogPhoto` and deriving it server-side from the contributor's intent.

## Mirroring Status Across Two Tables — Decision-Time Reads Must See Every State

When a feature mirrors a status column across two tables (e.g. `item_photos.status` and `photo_contributions.status` in the Photo Approval Dashboard), the **list/display query and the decision-time query must use different filters**. The list query naturally hides terminal states (`revoked`, archived, etc.) so users only see actionable rows; the decision query must **see** terminal states so it can explicitly reject decisions on them.

**Why:** if the decision query filters out a terminal state, the handler has nothing to guard against — the row appears null/absent — and any subsequent write silently no-ops or proceeds with stale state. The result is that user-initiated state transitions (e.g. consent revocation) can be silently routed around by a separate flow (e.g. a curator's undo).

**Protocol when designing a "mirror status across two tables" feature:**

1. **List query** filters out terminal states. Curators/users only see actionable rows. This is the existing pattern and is correct.
2. **Decision query** loads the row regardless of status (no `WHERE status != 'X'` filters on the LATERAL/JOIN side). The handler then explicitly checks the loaded status and returns 409 (or whatever code is appropriate) if the row is in a state that's incompatible with the requested action.
3. **Lock the mirrored row `FOR UPDATE`** for the duration of the decision transaction. This prevents a concurrent transition (e.g. user revokes while curator is mid-decision) from racing through after the load. The same pattern is used by `admin/queries.ts:findUserForAdmin` for last-admin protection.
4. **Mirror UPDATEs that filter `status != 'X'`** must either: (a) explicitly check `rowCount` and raise if it doesn't match expectations, or (b) be paired with a load-time guard that prevents the UPDATE from running on rows in the filtered-out state. The "silent no-op" failure mode is the bug.
5. **Test that the load returns rows in every status, including terminal ones**, and that the handler explicitly rejects decisions on terminal states. The integration test must assert that the write functions are NOT called when the row is in a terminal state — not just that the response code is right.

**Historical example — Phase 1.9b #72 Photo Approval Dashboard:** The original `loadPhotoForDecision` query filtered `WHERE status != 'revoked' AND file_copied = true` on the LATERAL join to `photo_contributions`. The `mirrorContributionStatus` UPDATE also filtered `status != 'revoked'`. A curator could approve a photo, then the contributor revokes consent, then the curator hits Undo — `mirrorContributionStatus` silently no-ops (0 rows affected because the row is now `revoked`), `item_photos.status` flips back to `pending` while `photo_contributions.status` stays `revoked`. On the next decision attempt, the load returns `contribution = null` (filtered by the LATERAL join), so the self-approval guard has no contributor to compare against and a curator can approve a photo whose contributor has explicitly revoked consent. Caught in the Phase 6 architecture review; fixed by removing the load-time filters, adding `FOR UPDATE` to the LATERAL join, and adding an explicit revoked-contribution 409 guard in the handler before any decision logic runs.

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
- GDPR purge deletes `collection_item_photos` and `collection_items` rows (user data, not audit). `photo_contributions` rows are preserved as audit trail with `collection_item_photo_id` set to NULL via `ON DELETE SET NULL`. `item_photos.uploaded_by` is scrubbed to NULL (attribution removal).
- GDPR purge of FORCE RLS tables requires a **context switch**: `gdprPurgeUser` calls `set_config('app.user_id', $targetUserId, true)` before DELETE statements on `collection_item_photos` and `collection_items`. Without this, the admin's RLS context would filter out the target user's rows. The context switch is safe because all subsequent operations in `gdprPurgeUser` and the caller touch only non-RLS tables.
- `ON DELETE SET NULL` on `photo_contributions.collection_item_photo_id` is an intentional exception to the "NEVER ON DELETE SET NULL on user FKs" rule — this FK points to `collection_item_photos` (not `users`), and SET NULL is required so GDPR deletion of collection photos preserves contribution audit records.
- GDPR file cleanup (`deleteUserPhotoDirectory`) runs after the transaction commits — best-effort, logged on failure. Orphaned files don't contain PII (photos of toys, not users).

## Collection API RLS Patterns

- **All collection queries use `withTransaction(fn, request.user.sub)`** — reads AND writes. Unlike catalog reads (`pool.query()` directly), collection data is RLS-protected and needs the `app.user_id` session variable set on every query
- Collection query functions receive `client: PoolClient` (from withTransaction callback), never import `pool` directly
- `FORCE ROW LEVEL SECURITY` on `collection_items` — ensures even the table owner (migration runner) is subject to RLS policies
- Soft delete via `deleted_at` column — all list/stats/check queries filter `WHERE deleted_at IS NULL`
- PATCH/DELETE use `SELECT ... FOR UPDATE` to serialize concurrent mutations and prevent TOCTOU races with soft-delete
- PATCH partial updates: use `Object.hasOwn(body, 'field')` to distinguish absent key from `null` value (Fastify strips absent keys from validated body)
- Stats query uses a single CTE for snapshot consistency — do NOT use `Promise.all` with multiple queries on a single `PoolClient` (pg does not support concurrent queries on one connection)
