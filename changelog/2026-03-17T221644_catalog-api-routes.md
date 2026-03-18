# Catalog API Routes — Franchise-Scoped Read-Only Endpoints

**Date:** 2026-03-17
**Time:** 22:16:44 UTC
**Type:** Feature
**Phase:** 1.5 Catalog API
**Issue:** [#34](https://github.com/butanoie/track-em-toys/issues/34)

## Summary

Added 17 read-only REST API endpoints for the shared toy catalog, organized into 7 domain modules under `/catalog`. Introduced franchise-scoped slug uniqueness (`UNIQUE(slug, franchise_id)`) to support clean multi-franchise growth, with path-based franchise routing (`/catalog/franchises/:franchise/characters/:slug`). Includes full-text search with prefix matching via generated tsvector columns.

---

## Changes Implemented

### 1. Database Migrations (016–018)

Three migrations following the single-responsibility convention:

- **016 — Slug Scoping:** Relaxed global `UNIQUE(slug)` to `UNIQUE(slug, franchise_id)` on characters, factions, sub_groups, continuity_families, toy_lines. Relaxed `UNIQUE(name)` to `UNIQUE(name, franchise_id)` on factions. Changed character_appearances to `UNIQUE(slug, character_id)`. Added composite B-tree indexes `(franchise_id, name, id)` on characters for cursor pagination.
- **017 — Items Franchise ID:** Added `franchise_id` column to items, populated from `toy_lines.franchise_id`. Created `BEFORE INSERT OR UPDATE` trigger to auto-populate and prevent denormalization drift. Added items slug scoping index and pagination indexes (deferred from 016).
- **018 — FTS Generated Columns:** Added `search_vector tsvector GENERATED ALWAYS AS (...) STORED` columns to characters and items with GIN indexes. Uses `simple` text config (no stemming — proper nouns dominate the dataset).

**Created:**

- `api/db/migrations/016_slug_scoping.sql`
- `api/db/migrations/017_items_franchise_id.sql`
- `api/db/migrations/018_fts_generated_columns.sql`

**Modified:**

- `api/db/schema.sql` — auto-generated dump updated
- `api/db/seed/ingest.ts` — `ON CONFLICT` clauses updated from `(slug)` to `(slug, franchise_id)` for franchise-scoped tables
- `api/src/types/index.ts` — added `franchise_id` to `Item` interface

### 2. Catalog API Modules

Seven domain modules under `api/src/catalog/`, each with routes, queries, and schemas:

| Module           | Endpoints                                                      | Pagination | Franchise Scoped     |
| ---------------- | -------------------------------------------------------------- | ---------- | -------------------- |
| `franchises/`    | list, detail                                                   | —          | No (top-level)       |
| `manufacturers/` | list, detail                                                   | —          | No (globally unique) |
| `characters/`    | list, detail                                                   | Cursor     | Yes                  |
| `items/`         | list, detail                                                   | Cursor     | Yes                  |
| `toy-lines/`     | list, detail                                                   | —          | Yes                  |
| `reference/`     | factions, sub-groups, continuity-families (list + detail each) | —          | Yes                  |
| `search/`        | full-text search                                               | Offset     | Optional filter      |

**Created (38 files):**

- `api/src/catalog/routes.ts` — barrel plugin
- `api/src/catalog/franchise-scoped.ts` — registers all franchise-scoped sub-plugins
- `api/src/catalog/shared/pagination.ts` — cursor encode/decode with versioned payload `{ v: 1, name, id }`
- `api/src/catalog/shared/schemas.ts` — reusable schema fragments (errorResponse, slugNameRef, cursorListResponse, etc.)
- `api/src/catalog/shared/test-setup.ts` — shared mock config/pool/key-store for integration tests
- `api/src/catalog/{characters,items,manufacturers,toy-lines,reference,franchises,search}/{routes,queries,schemas}.ts`

**Modified:**

- `api/src/server.ts` — register `catalogRoutes` at `/catalog` prefix
- `api/src/plugins/docs.ts` — added `catalog` and `catalog-search` OpenAPI tags
- `api/CLAUDE.md` — added catalog-specific conventions

### 3. Test Coverage

74 new tests across 9 test files:

| Test File                      | Tests | Type                                                                 |
| ------------------------------ | ----- | -------------------------------------------------------------------- |
| `shared/pagination.test.ts`    | 19    | Unit — cursor encoding, decoding, buildCursorPage, clampLimit        |
| `search/queries.test.ts`       | 11    | Unit — buildSearchTsquery prefix matching                            |
| `franchises/routes.test.ts`    | 4     | Integration — list, detail, 404                                      |
| `manufacturers/routes.test.ts` | 3     | Integration — list, detail, 404                                      |
| `reference/routes.test.ts`     | 11    | Integration — factions, sub-groups, continuity-families              |
| `toy-lines/routes.test.ts`     | 3     | Integration — list, detail, 404                                      |
| `characters/routes.test.ts`    | 10    | Integration — pagination, cursor, detail with sub-groups/appearances |
| `items/routes.test.ts`         | 7     | Integration — pagination, detail with photos, null handling          |
| `search/routes.test.ts`        | 6     | Integration — search, franchise filter, pagination, edge cases       |

### 4. Documentation

- **ADR rewritten:** `docs/decisions/ADR_Catalog_API_Architecture.md` — status changed to Accepted, revision history documenting the evolution from flat routes to franchise-scoped design
- **Test scenarios:** `docs/test-scenarios/INT_CATALOG_API.md` — 30+ Gherkin scenarios covering all 17 endpoints
- **Scenario mapping:** `docs/test-scenarios/README.md` — updated with spec file paths

---

## Technical Details

### Franchise-Scoped Routing

```
# Unscoped
GET /catalog/franchises
GET /catalog/franchises/:slug
GET /catalog/manufacturers
GET /catalog/manufacturers/:slug
GET /catalog/search?q=...&franchise=...

# Franchise-scoped (via parameterized Fastify prefix)
GET /catalog/franchises/:franchise/characters
GET /catalog/franchises/:franchise/characters/:slug
GET /catalog/franchises/:franchise/items
...
```

Fastify's parameterized prefix (`{ prefix: '/franchises/:franchise' }`) makes the `:franchise` param available to all child plugins automatically.

### Cursor Pagination

Keyset pagination on `(name ASC, id ASC)` with versioned cursor:

```typescript
{ v: 1, name: string, id: string }  // base64url encoded
```

SQL uses `(name, id) > ($cursor_name, $cursor_id::uuid)` row comparison. Fetch `limit + 1` rows; extra row proves more data exists.

### Full-Text Search with Prefix Matching

Generated `search_vector` columns avoid expression-matching fragility. Search query builder appends `:*` to the last token for prefix matching:

```
"optimus pr" → 'optimus' & 'pr':*
```

Hyphens are replaced with spaces (prevents tsquery injection via `-` operator and aligns with PostgreSQL's tokenization of product codes like `FT-44`).

### Items Franchise Trigger

```sql
BEFORE INSERT OR UPDATE — auto-populates franchise_id from toy_line_id
```

Prevents denormalization drift on both INSERT (ingest script) and UPDATE (toy_line reassignment).

---

## Validation & Testing

```
API Tests:  25 passed | 1 skipped (26 total)
API Tests:  516 passed | 46 skipped (562 total)
API Lint:   0 errors, 35 warnings
API Typecheck: clean
API Build:  clean

Web Tests:  15 passed (15 total)
Web Tests:  130 passed (130 total)
Web Lint:   clean
Web Typecheck: clean
Web Build:  clean

Seed:       seed:purge runs clean (all 8 tables populated)
```

---

## Impact Assessment

- **API surface area:** 17 new public endpoints (no auth required)
- **Database:** 3 new migrations, slug uniqueness model changed from global to per-franchise
- **Ingest script:** Updated `ON CONFLICT` clauses — must run new migrations before seeding
- **No breaking changes** to existing auth endpoints or web app
- **Future work enabled:** Write endpoints (Phase 1.5b) can be added to existing module files with `preHandler: [requireRole('curator')]`

---

## Related Files

**Key files:**

- `docs/decisions/ADR_Catalog_API_Architecture.md` — full architecture decisions
- `api/src/catalog/routes.ts` — barrel plugin entry point
- `api/src/catalog/shared/pagination.ts` — cursor pagination utilities
- `api/src/catalog/characters/queries.ts` — most complex query module (3-query detail pattern)
- `api/src/catalog/search/queries.ts` — FTS with prefix matching

---

## Summary Statistics

| Metric          | Count  |
| --------------- | ------ |
| Commits         | 7      |
| Files changed   | 47     |
| Lines added     | +3,845 |
| Lines removed   | -127   |
| New files       | 41     |
| New tests       | 74     |
| Total API tests | 516    |
| Endpoints       | 17     |
| Migrations      | 3      |

---

## Next Steps

- Create PR for `sc/catalogue-api-1` → `main`
- Phase 1.5b: Write endpoints with curator role enforcement
- Add list filters: faction, continuity_family, character_type, size_class, year_released
- Add `Cache-Control` headers in barrel plugin
- Add `updated_since` filter for iOS sync efficiency

---

## Status

✅ COMPLETE — Routes implemented, tested, reviewed, and documented. Pending PR merge.
