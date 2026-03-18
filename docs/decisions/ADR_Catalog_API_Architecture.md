# ADR: Catalog API Architecture (Phase 1.5)

**Date:** 2026-03-17
**Status:** Proposed
**Issue:** [#34 — Phase 1.5: Catalog API Routes (Read-Only)](https://github.com/butanoie/track-em-toys/issues/34)

---

## Context

Phase 1.5 adds read-only REST endpoints for the shared toy catalog. The API must serve characters, items, manufacturers, toy lines, reference data (factions, sub-groups, continuity families), and full-text search — all without authentication.

The existing codebase has one route module (`src/auth/`) with a flat structure: `routes.ts`, `schemas.ts`, and queries in `src/db/queries.ts`. The catalog has 9 resource types with varying complexity, making a flat structure inadequate.

### Key Requirements

- **Cursor-based pagination** with opaque continuation tokens (dataset will grow)
- **Slug-based filtering** — all filters accept slugs, not UUIDs
- **Franchise filtering** on all endpoints (cross-cutting concern for multi-franchise growth)
- **Full-text search** across characters and items using PostgreSQL `simple` text config
- **No authentication** required for reads
- **Scalable to write endpoints** when Phase 1.5b (curator roles) arrives

---

## Decision: Domain-Scoped Hybrid Module Structure

### Module Layout

```
api/src/catalog/
  routes.ts                          # barrel plugin — registers all sub-plugins
  shared/
    pagination.ts                    # cursor encode/decode, limit+1 logic, constants
    pagination.test.ts
    schemas.ts                       # errorResponse, slugParam, paginationQuery, franchiseFilter
  characters/
    routes.ts, queries.ts, schemas.ts
    routes.test.ts, queries.test.ts
  items/
    routes.ts, queries.ts, schemas.ts
    routes.test.ts, queries.test.ts
  manufacturers/
    routes.ts, queries.ts, schemas.ts
    routes.test.ts, queries.test.ts
  toy-lines/
    routes.ts, queries.ts, schemas.ts
    routes.test.ts, queries.test.ts
  reference/
    routes.ts, queries.ts, schemas.ts    # factions, sub-groups, continuity-families, franchises
    routes.test.ts, queries.test.ts
  search/
    routes.ts, queries.ts, schemas.ts
    routes.test.ts, queries.test.ts
```

**~27 files total.** Each file stays under 300 lines.

### Endpoints

| Endpoint | Module | Paginated | Franchise Filter |
|---|---|---|---|
| `GET /catalog/characters` | characters/ | Yes (cursor) | Yes |
| `GET /catalog/characters/:slug` | characters/ | No | No (slug is unique) |
| `GET /catalog/items` | items/ | Yes (cursor) | Yes (via character JOIN) |
| `GET /catalog/items/:slug` | items/ | No | No |
| `GET /catalog/manufacturers` | manufacturers/ | No (currently ~3 rows) | No (franchise-agnostic) |
| `GET /catalog/manufacturers/:slug` | manufacturers/ | No | No |
| `GET /catalog/toy-lines` | toy-lines/ | No (currently ~16 rows) | Yes |
| `GET /catalog/toy-lines/:slug` | toy-lines/ | No | No |
| `GET /catalog/factions` | reference/ | No | Yes |
| `GET /catalog/factions/:slug` | reference/ | No | No |
| `GET /catalog/sub-groups` | reference/ | No | Yes |
| `GET /catalog/sub-groups/:slug` | reference/ | No | No |
| `GET /catalog/continuity-families` | reference/ | No | Yes |
| `GET /catalog/continuity-families/:slug` | reference/ | No | No |
| `GET /catalog/franchises` | reference/ | No | No |
| `GET /catalog/search` | search/ | Yes (cursor) | Yes |

### Why This Structure

| Decision | Rationale |
|---|---|
| Characters and items get own modules | Complex: pagination, multi-table JOINs, many filters, will gain write endpoints |
| Manufacturers and toy-lines get own modules | Will grow significantly with multi-franchise expansion; have complex detail views (item_count, toy_line_count) |
| Reference/ bundles 3 small tables + franchises | Factions (~11), sub-groups (~52), continuity-families (~10) share the same trivial list+detail pattern |
| Queries colocate with routes (not in `db/`) | Auth queries are in `db/queries.ts` (690 lines). Adding catalog queries there would create a 2000+ line file. Each catalog domain's queries are only consumed by that domain's routes. |
| Barrel `routes.ts` at catalog root | `server.ts` registers one plugin; catalog-scoped hooks (e.g., cache-control) can be added at one level |

---

## Technical Decisions

### Cursor-Based Pagination

- **Encoding**: `base64url(JSON.stringify({ name, id }))` — keyset on `(name ASC, id ASC)`
- **Why base64url**: No `+`, `/`, `=` characters that break URL query strings
- **Fetch pattern**: Request `limit + 1` rows; if result length > limit, there's a next page
- **Response shape**: `{ data: T[], next_cursor: string | null, total_count: number }`
- **total_count included**: At projected catalog scale (10K-50K items max), `COUNT(*)` with indexes is <5ms

### Full-Text Search

- **Config**: PostgreSQL `simple` (no stemming, no stop-word removal)
- **Why simple**: Data is dominated by proper nouns (Optimus Prime, FT-44, Megatron) where English stemming would mangle results
- **Indexed fields**: `characters.name + alt_mode`, `items.name + description + product_code`
- **GIN indexes**: Migration 015 creates expression-based GIN indexes matching the query patterns
- **Query function**: `plainto_tsquery('simple', ...)` — immune to tsquery injection
- **Search pagination**: Offset-based (not cursor) since `ts_rank` values are not stable row identifiers

### Franchise as Cross-Cutting Filter

- **Normalized**: `franchise` is a proper `franchises` reference table with UUID FK on all 5 catalog tables (migration 015)
- **API approach**: `?franchise=transformers` query param on all list/search endpoints
- **SQL pattern**: `JOIN franchises fr ON fr.id = t.franchise_id WHERE ($N::text IS NULL OR fr.slug = $N)` — slug-based, consistent with all other filters
- **Franchises endpoint**: `GET /catalog/franchises` queries the reference table directly
- See `docs/decisions/ADR_Franchise_Normalization.md` for the full rationale

### Slug-Based Filtering (No Resolution Step)

Filters JOIN directly to reference tables by slug in SQL rather than a separate UUID resolution step:

```sql
FROM characters c
LEFT JOIN factions f ON f.id = c.faction_id
WHERE ($1::text IS NULL OR f.slug = $1)
```

This avoids N+1 round-trips and lets PostgreSQL optimize the join in a single query plan.

### DB Access for Reads

- **No `withTransaction`** — catalog reads use `pool.query()` directly
- **No RLS context** — catalog tables have no RLS policies
- **Saves ~2ms/request** by avoiding BEGIN/COMMIT overhead
- Query functions accept `QueryOnlyClient` for testability (same pattern as auth queries)

### Error Handling

- **No `HttpError`** in catalog routes (no transactions to interact with)
- 400: invalid cursor or query params → `reply.code(400).send({ error: '...' })`
- 404: slug not found on detail endpoints → `reply.code(404).send({ error: '...' })`
- 500: falls through to global error handler in `server.ts`

### Rate Limiting

- All catalog routes: `config: { rateLimit: { max: 100, timeWindow: '1 minute' } }`
- Per api/CLAUDE.md rule 24: public reads up to 100 req/min

---

## Alternatives Considered

### A. Minimal (3 files mirroring auth/)

`catalog/routes.ts` + `schemas.ts` + `queries.ts` — all endpoints in flat files.

**Rejected**: With 16 endpoints, `routes.ts` would be 800+ lines. Adding write endpoints in Phase 1.5b would push it past 1500. No domain separation for navigation or testing.

### B. Fully Modular (per-resource directories for all 9 resources)

Every resource gets its own 5-file directory.

**Rejected**: 45+ files. Factions, sub-groups, and continuity-families are 10-20 lines of logic each — a full directory per resource is excessive.

---

## Files Modified

- `api/src/server.ts` — register `catalogRoutes` plugin at `/catalog` prefix
- `api/src/plugins/docs.ts` — add `catalog` OpenAPI tag
- `api/src/types/index.ts` — add catalog response types (CharacterSummary, ItemDetail, etc.)
- `api/db/migrations/015_catalog_fts_indexes.sql` — GIN indexes for full-text search

---

## Future Considerations

- **Cursor pagination on manufacturers/toy-lines** — currently return all rows; add pagination when datasets grow
- **Write endpoints (Phase 1.5b)** — add POST/PUT/DELETE to existing module files with `preHandler: [requireRole('curator')]`
- **Response caching** — catalog data changes infrequently; add `Cache-Control` headers or ETag support
