# ADR: Catalog API Architecture (Phase 1.5)

**Date:** 2026-03-17
**Status:** Accepted (revised)
**Issue:** [#34 — Phase 1.5: Catalog API Routes (Read-Only)](https://github.com/butanoie/track-em-toys/issues/34)

---

## Context

Phase 1.5 adds read-only REST endpoints for the shared toy catalog. The API must serve characters, items, manufacturers, toy lines, reference data (factions, sub-groups, continuity families), and full-text search — all without authentication.

The existing codebase has one route module (`src/auth/`) with a flat structure: `routes.ts`, `schemas.ts`, and queries in `src/db/queries.ts`. The catalog has 9 resource types with varying complexity, making a flat structure inadequate.

### Key Requirements

- **Cursor-based pagination** with opaque continuation tokens (dataset will grow)
- **Slug-based filtering** — all filters accept slugs, not UUIDs
- **Franchise-scoped browsing** — resources are scoped under a franchise path prefix
- **Full-text search** across characters and items using PostgreSQL `simple` text config with prefix matching
- **No authentication** required for reads
- **Scalable to write endpoints** when Phase 1.5b (curator roles) arrives

---

## Decision: Franchise-Scoped Domain Modules

### Revision History

- **v1 (2026-03-17):** Proposed flat `?franchise=` query param approach with globally unique slugs
- **v2 (2026-03-17):** Revised to franchise-scoped slugs with path-based routing after architectural review. Key drivers: (1) global slug uniqueness creates order-dependent naming conventions that don't scale across franchises, (2) franchise is the primary browsing scope — not an optional filter, (3) `GET /catalog/characters/:slug` is ambiguous for characters like Megatron that exist in multiple continuities/franchises

### Franchise-Scoped Slugs

Slug uniqueness is scoped to franchise rather than globally unique. This means the same slug (e.g., `megatron`) can exist in different franchises, and the franchise in the URL path disambiguates.

| Table | Uniqueness Constraint | Rationale |
|---|---|---|
| `characters` | `UNIQUE (slug, franchise_id)` | Same name across franchises (cross-franchise growth) |
| `factions` | `UNIQUE (slug, franchise_id)` | Faction names are franchise-specific |
| `sub_groups` | `UNIQUE (slug, franchise_id)` | Sub-group names are franchise-specific |
| `continuity_families` | `UNIQUE (slug, franchise_id)` | Continuity groupings are franchise-specific |
| `toy_lines` | `UNIQUE (slug, franchise_id)` | Toy line names are franchise-specific |
| `items` | `UNIQUE (slug, franchise_id)` | Items belong to a franchise context |
| `character_appearances` | `UNIQUE (slug, character_id)` | Scoped to parent character |
| `manufacturers` | `UNIQUE (slug)` — globally unique | Span franchises (Hasbro, Takara Tomy) |
| `franchises` | `UNIQUE (slug)` — globally unique | Top-level scope |

### Module Layout

```
api/src/catalog/
  routes.ts                          # barrel plugin — registers unscoped + franchise-scoped
  franchise-scoped.ts                # registers all franchise-scoped sub-plugins
  shared/
    pagination.ts                    # cursor encode/decode, limit+1 logic, constants
    pagination.test.ts
    schemas.ts                       # errorResponse, slugParam, paginationQuery, etc.
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
    routes.ts, queries.ts, schemas.ts    # factions, sub-groups, continuity-families
    routes.test.ts, queries.test.ts
  franchises/
    routes.ts, queries.ts, schemas.ts    # franchise list + detail (unscoped)
    routes.test.ts, queries.test.ts
  search/
    routes.ts, queries.ts, schemas.ts
    routes.test.ts, queries.test.ts
```

**~38 files total.** Each file stays under 300 lines.

### Endpoints

#### Unscoped Routes

| Endpoint | Module | Notes |
|---|---|---|
| `GET /catalog/franchises` | franchises/ | List all franchises |
| `GET /catalog/franchises/:slug` | franchises/ | Franchise detail |
| `GET /catalog/manufacturers` | manufacturers/ | All rows, franchise-agnostic |
| `GET /catalog/manufacturers/:slug` | manufacturers/ | Detail |
| `GET /catalog/search?q=...` | search/ | Offset-paginated, optional `&franchise=` filter |

#### Franchise-Scoped Routes (`/catalog/franchises/:franchise/...`)

| Endpoint | Module | Paginated |
|---|---|---|
| `GET .../characters` | characters/ | Cursor |
| `GET .../characters/:slug` | characters/ | — |
| `GET .../items` | items/ | Cursor |
| `GET .../items/:slug` | items/ | — |
| `GET .../toy-lines` | toy-lines/ | No (all rows) |
| `GET .../toy-lines/:slug` | toy-lines/ | — |
| `GET .../factions` | reference/ | No (all rows) |
| `GET .../factions/:slug` | reference/ | — |
| `GET .../sub-groups` | reference/ | No (all rows) |
| `GET .../sub-groups/:slug` | reference/ | — |
| `GET .../continuity-families` | reference/ | No (all rows) |
| `GET .../continuity-families/:slug` | reference/ | — |

**17 endpoints total.**

### Why This Structure

| Decision | Rationale |
|---|---|
| Franchise path prefix, not query param | Franchise is the primary browsing scope, not an optional filter. Collectors browse within a franchise. Slug scoping makes franchise required for disambiguation. |
| Characters and items get own modules | Complex: cursor pagination, multi-table JOINs, many filters, will gain write endpoints |
| Manufacturers stay unscoped | Franchise-agnostic (Hasbro spans franchises), globally unique slugs |
| Reference/ bundles factions + sub-groups + continuity-families | Share the same trivial list+detail pattern within franchise scope |
| Franchises/ is a separate unscoped module | The franchise list and detail endpoints don't need franchise scoping |
| Queries colocate with routes (not in `db/`) | Auth queries are in `db/queries.ts` (690 lines). Adding catalog queries there would create a 2000+ line file. Each catalog domain's queries are only consumed by that domain's routes. |
| Barrel `routes.ts` at catalog root | `server.ts` registers one plugin; catalog-scoped hooks (e.g., cache-control) can be added at one level |
| `franchise-scoped.ts` sub-barrel | Registers all franchise-scoped sub-plugins under the `:franchise` parameterized prefix |

---

## Technical Decisions

### Cursor-Based Pagination

- **Encoding**: `base64url(JSON.stringify({ v: 1, name, id }))` — keyset on `(name ASC, id ASC)`
- **Version field**: `v: 1` enables graceful rejection of old cursors on schema changes
- **Why base64url**: No `+`, `/`, `=` characters that break URL query strings
- **Fetch pattern**: Request `limit + 1` rows; if result length > limit, there's a next page
- **Response shape**: `{ data: T[], next_cursor: string | null, total_count: number }`
- **total_count included**: At projected catalog scale (10K-50K items max), `COUNT(*)` with indexes is <5ms
- **UUID comparison**: Cursor uses UUID directly (`$3::uuid`), not text cast, to avoid ordering divergence

### Full-Text Search

- **Config**: PostgreSQL `simple` (no stemming, no stop-word removal)
- **Why simple**: Data is dominated by proper nouns (Optimus Prime, FT-44, Megatron) where English stemming would mangle results
- **Generated columns**: `search_vector tsvector GENERATED ALWAYS AS (...) STORED` on characters and items — eliminates expression-matching fragility between index and query
- **GIN indexes**: On the generated `search_vector` columns
- **Prefix matching**: Last token gets `:*` suffix for search-as-you-type support. "Opti" matches "Optimus". Query construction in TypeScript, passed as parameterized value.
- **Search pagination**: Offset-based (`{ data, page, limit, total_count }`) since `ts_rank` values are not stable row identifiers. Cursor-based used on all other list endpoints.
- **ORDER BY tiebreaker**: `rank DESC, name ASC, entity_type ASC, id ASC` for deterministic pagination

### Franchise-Scoped Routing

- **Path prefix**: `/catalog/franchises/:franchise/characters`, not `?franchise=` query param
- **Franchise validation**: Detail lookups use `WHERE slug = $1 AND fr.slug = $2` — returns 404 if the slug doesn't belong to the specified franchise
- **Fastify parameterized prefix**: `fastify.register(franchiseScopedRoutes, { prefix: '/franchises/:franchise' })` — the `:franchise` param is available in `request.params` for all child routes
- **Unscoped resources**: Franchises list, manufacturers, and search are not franchise-scoped

### Slug-Based Filtering (No Resolution Step)

Filters JOIN directly to reference tables by slug in SQL rather than a separate UUID resolution step:

```sql
FROM characters c
JOIN franchises fr ON fr.id = c.franchise_id
LEFT JOIN factions f ON f.id = c.faction_id
WHERE fr.slug = $1 AND c.slug = $2
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
- 404: slug not found on detail endpoints, or invalid franchise → `reply.code(404).send({ error: '...' })`
- 500: falls through to global error handler in `server.ts`

### Rate Limiting

- All catalog routes: `config: { rateLimit: { max: 100, timeWindow: '1 minute' } }`
- Per api/CLAUDE.md rule 24: public reads up to 100 req/min

---

## Migrations

Three separate migrations following established single-responsibility convention:

### Migration 016: Slug Scoping

- Drop global `UNIQUE (slug)` on characters, factions, sub_groups, continuity_families, toy_lines, items
- Add `UNIQUE (slug, franchise_id)` composites
- Drop global `UNIQUE (name)` on factions, add `UNIQUE (name, franchise_id)`
- Character appearances: `UNIQUE (slug, character_id)` instead of global
- Add composite B-tree indexes for cursor pagination: `(franchise_id, name, id)` on characters and items
- Use `DROP CONSTRAINT IF EXISTS` / `DROP INDEX IF EXISTS` for safety

### Migration 017: Items Franchise ID + Slug Scoping

- Add `franchise_id UUID` to items (nullable)
- Populate from `toy_lines.franchise_id` via UPDATE+JOIN
- SET NOT NULL + FK constraint (ON DELETE RESTRICT)
- Add performance index `idx_items_franchise`
- Create `UNIQUE (slug, franchise_id)` index on items (deferred from 016 because the column must exist first)
- Create cursor pagination indexes `(name, id)` and `(franchise_id, name, id)` on items
- Add BEFORE INSERT OR UPDATE trigger: auto-populate `franchise_id` from `toy_line_id` when NULL on INSERT or when `toy_line_id` changes on UPDATE (prevents ingest breakage and denormalization drift)

### Migration 018: FTS Generated Columns + GIN Indexes

- Add `search_vector tsvector GENERATED ALWAYS AS (...) STORED` to characters and items
- Create GIN indexes on the generated columns
- Separate migration allows future `CONCURRENTLY` index builds if needed

---

## Response Shapes

### Character List Item

```typescript
{
  id, name, slug,
  franchise: { slug, name },
  faction: { slug, name } | null,
  continuity_family: { slug, name },
  character_type: string | null,
  alt_mode: string | null,
  is_combined_form: boolean
}
```

### Character Detail

```typescript
{
  ...characterListItem,
  combiner_role: string | null,
  combined_form: { slug, name } | null,
  sub_groups: Array<{ slug, name }>,
  appearances: Array<{ id, slug, name, source_media, source_name, year_start, year_end, description }>,
  metadata: Record<string, unknown>,
  created_at, updated_at
}
```

### Item List Item

```typescript
{
  id, name, slug,
  franchise: { slug, name },
  character: { slug, name },
  manufacturer: { slug, name } | null,
  toy_line: { slug, name },
  size_class: string | null,
  year_released: number | null,
  is_third_party: boolean,
  data_quality: 'needs_review' | 'verified' | 'community_verified'
}
```

### Item Detail

```typescript
{
  ...itemListItem,
  appearance: { slug, name, source_media, source_name } | null,
  description: string | null,
  barcode, sku, product_code: string | null,
  photos: Array<{ id, url, caption, is_primary }>,
  metadata: Record<string, unknown>,
  created_at, updated_at
}
```

### Search Result

```typescript
{
  entity_type: 'character' | 'item',
  id, name, slug,
  franchise: { slug, name }
}
```

---

## Alternatives Considered

### A. Minimal (3 files mirroring auth/)

`catalog/routes.ts` + `schemas.ts` + `queries.ts` — all endpoints in flat files.

**Rejected**: With 17 endpoints, `routes.ts` would be 800+ lines. Adding write endpoints in Phase 1.5b would push it past 1500. No domain separation for navigation or testing.

### B. Fully Modular (per-resource directories for all 9 resources)

Every resource gets its own 5-file directory.

**Rejected**: 45+ files. Factions, sub-groups, and continuity-families are 10-20 lines of logic each — a full directory per resource is excessive.

### C. Flat Routes with `?franchise=` Query Param (v1 of this ADR)

`GET /catalog/characters?franchise=transformers` with globally unique slugs.

**Rejected**: Global slug uniqueness creates order-dependent naming conventions that don't scale across franchises. Franchise is the primary browsing scope, not an optional filter. Detail routes like `GET /catalog/characters/megatron` are ambiguous — which Megatron? Franchise-scoped slugs with path prefix solve all three issues.

---

## Files Modified

- `api/src/server.ts` — register `catalogRoutes` plugin at `/catalog` prefix
- `api/src/plugins/docs.ts` — add `catalog` and `catalog-search` OpenAPI tags
- `api/src/types/index.ts` — add `franchise_id` to `Item` interface, add catalog response types
- `api/db/migrations/016_slug_scoping.sql` — relax slug uniqueness, add pagination indexes
- `api/db/migrations/017_items_franchise_id.sql` — add franchise_id to items with trigger
- `api/db/migrations/018_fts_generated_columns.sql` — search_vector columns + GIN indexes

---

## Known Limitations

- **No prefix search on product codes**: `simple` config tokenizes `FT-44` as `['ft', '44']`. Searching `FT-44` works (matches both tokens) but searching `FT` alone returns false positives. Consider `pg_trgm` for product code search in a future iteration.
- **Offset pagination on search**: Page drift can occur under concurrent writes. Acceptable at current scale.
- **No additional list filters in v1**: Filters for `faction`, `continuity_family`, `character_type`, `size_class`, `year_released`, `data_quality` are planned for v1.1. Query builders should be structured to add filters without rewriting SQL.
- **No Cache-Control headers in v1**: Catalog data changes infrequently. Add `Cache-Control: public, max-age=300` in the barrel plugin as a fast follow.

---

## Future Considerations

- **Cursor pagination on reference tables** — currently return all rows; add pagination when datasets grow past ~200 rows
- **Write endpoints (Phase 1.5b)** — add POST/PUT/DELETE to existing module files with `preHandler: [requireRole('curator')]`
- **Response caching** — add `Cache-Control` headers or ETag support in barrel plugin
- **Additional list filters (v1.1)** — faction, continuity_family, character_type, size_class, year_released, data_quality
- **`updated_since` filter** — for iOS sync efficiency
