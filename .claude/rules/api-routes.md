---
paths:
  - 'api/src/**/*.ts'
---

# API Route & Domain Patterns

## User Roles & Authorization

- `users.role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'curator', 'admin'))`
- Role is included in JWT access token claims — no DB lookup needed per request
- `requireRole(role)` Fastify preHandler middleware enforces role checks; returns 403 if insufficient
- Role hierarchy: `user (0) < curator (1) < admin (2)` — `requireRole('curator')` grants access to curators AND admins
- Role infrastructure lives in `src/auth/role.ts` — `ROLE_HIERARCHY`, `hasRequiredRole()`, `isRolePayload()`, `requireRole()` factory
- `requireRole` must ALWAYS follow `fastify.authenticate` in the `preHandler` array — `authenticate` populates `request.user`
- Catalog read routes: no role required (public)
- Catalog write routes (photo upload, item edits): require `curator` or `admin`
- Admin routes (user management, role assignment): require `admin`
- When adding a new route with write operations on catalog data, always add `requireRole('curator')` preHandler
- Admin routes live in `src/admin/routes.ts`, separate from catalog routes
- Admin mutations use `withTransaction` (unlike catalog reads which use `pool.query()` directly) — this is an intentional deviation
- Admin mutation routes must reject GDPR-purged users (`deleted_at IS NOT NULL` -> 409)
- Admin mutation routes must block self-modification (`params.id === request.user.sub` -> 403)
- All `:id` path params must have `format: 'uuid'` in the route schema to prevent 500 from invalid UUIDs
- Admin audit events logged to `auth_events`: `role_changed`, `account_deactivated`, `account_reactivated`, `user_purged`
- Any function that gates user access (signin, refresh, admin mutations) must check BOTH `deactivated_at` AND `deleted_at` — never assume one implies the other
- `getUserStatusAndRole()` is the canonical function for this — returns `{ status: 'active' | 'deactivated' | 'deleted' | 'not_found', role }` in a single DB query
- `findUserForAdmin()` uses `FOR UPDATE` to serialize concurrent mutations (critical for last-admin protection)
- First admin user bootstrapped via CLI command: `npm run set-role -- <email> admin`

## Photo Domains

Two distinct photo types:

- **Catalog photos** (`item_photos`): Shared reference images, no RLS. `uploaded_by` tracks contributor for attribution. Feed ML training directly. Upload requires `curator` role.
- **User collection photos** (`collection_item_photos`, Phase 1.6): Private, RLS-protected (`FORCE ROW LEVEL SECURITY`). `user_id` denormalized for efficient per-row RLS. Upload requires `user` role (any authenticated user).
- `item_photos` does NOT have RLS — this is intentional. Catalog photos are app-managed content visible to all users.

## Photo Upload API (Phase 1.9+)

- Photo routes live in `src/catalog/photos/` registered as a sub-plugin of `itemRoutes` at `/:slug/photos`
- `@fastify/multipart` registered inside the photo plugin (scoped) — coexists with JSON body parsing (different content types, no conflict)
- Upload route processes all files into memory buffers first, then writes to disk + inserts to DB (atomic batch)
- Thumbnail pipeline: `sharp` converts to WebP at 2 sizes (200px thumb fit-inside, 1600px original fit-inside, both q80-85). Minimum 600px on shortest edge enforced via `DimensionError`
- File naming: `{itemId}/{photoId}-{size}.webp` (size: `thumb` | `original`), relative URL stored in DB
- `@fastify/static` registered in development mode only (`config.nodeEnv === 'development'`) with `decorateReply: false, index: false`
- `PHOTO_STORAGE_PATH` startup validation skips in test environment (`config.nodeEnv !== 'test'`)
- Adding a new required config property (e.g., `config.photos`) breaks ALL test files that mock `config.js` — add the property to every mock config across the test suite
- `QueryOnlyClient` type exported from `db/pool.ts` — use `satisfies pool.QueryOnlyClient` in test mocks instead of `as unknown as PoolClient`
- Photo upload route tests use positional `mockResolvedValueOnce` — adding a new DB query to the handler requires updating the mock sequence in ALL existing upload tests (e.g., `getPhotoHashesByItem` was added before `getMaxSortOrder`)

## Photo Deduplication (dHash)

- `item_photos.dhash` stores a 16-char hex perceptual hash (64-bit dHash) — internal column, excluded from `PHOTO_COLUMNS` and never returned to clients
- `dhash.ts` exports `computeDHash(buffer)` and `hammingDistance(a, b)` — pure functions using Sharp, no project dependencies
- Upload handler computes dHash on the raw buffer BEFORE `processUpload()` — duplicates are rejected before expensive Sharp processing
- Duplicate check: Hamming distance <= 10 within the same item. Returns 409 `{ error, matched: { id, url } }`
- Hashes are fetched once per request (`getPhotoHashesByItem`), plus batch tracking catches within-request duplicates
- `DEFAULT ''` on the column — `getPhotoHashesByItem` filters `dhash != ''` to skip un-hashed legacy rows

## ML Export (Phase 1.9 Slice 3)

- ML export route lives in `src/catalog/ml-export/` — registered at `/catalog/ml-export` (unscoped, not franchise-scoped)
- Uses full-text search (same FTS as `search/queries.ts`) to find items, JOINs `item_photos` for approved photos
- Writes a manifest JSON to `ML_EXPORT_PATH` with timestamped filenames (e.g., `20260321T154530Z.json`)
- `ML_EXPORT_PATH` is `optionalOrUndefined` in config — the route returns 500 if not configured. Made optional to avoid breaking all test mocks that don't need ML export.
- Requires `admin` role (not `curator`) — this is an ML pipeline operation, not catalog curation
- Web: "Export for ML" button on the search results page, visible only to admins when item results exist

## ML Model Serving (Phase 4.0c-1)

- ML model metadata route lives in `src/ml/models/` — registered at `/ml/models` (top-level, not catalog-scoped)
- `GET /ml/models` — authenticated, rate-limited (30/min). Scans `ML_MODELS_PATH` for `*-metadata.json` files, returns model summaries (no label maps — those are in the static metadata JSON)
- `ML_MODELS_PATH` is `optionalOrUndefined` — route returns `{ models: [] }` when unset (no 500)
- `ML_MODELS_BASE_URL` defaults to `http://localhost:{port}/ml/model-files` — used to construct `download_url` and `metadata_url` in responses
- Static model file serving (`.onnx`, `.onnx.data`, `-metadata.json`) via `@fastify/static` at `/ml/model-files/` prefix — dev-only, prod uses CDN
- Scanner validates metadata JSON via hand-rolled type guard (`parseModelMetadata`) — malformed files are logged and skipped, never crash the response
- `size_bytes` is derived by summing `fs.stat` on `.onnx` + `.onnx.data` files
- `download_url` is `null` when the ONNX file is missing (metadata exists but model not yet exported)
- No DB access — scanner only touches the filesystem

## ML Inference Telemetry (Phase 4.0c-T)

- `ml_inference_events` table: 6 event types (`scan_started`, `scan_completed`, `scan_failed`, `prediction_accepted`, `scan_abandoned`, `browse_catalog`), `model_name` denormalized column, `user_id NOT NULL` (RESTRICT, tombstone pattern)
- `POST /ml/events` — authenticated (any user), rate-limited 60/min. Telemetry insert failures return 204 anyway (non-fatal)
- `GET /ml/stats/summary?days=N` — admin-only. Returns aggregate counts + computed `acceptance_rate` and `error_rate`
- `GET /ml/stats/daily?days=N` — admin-only. Returns pivoted daily data points for recharts
- `GET /ml/stats/models?days=N` — admin-only. Returns per-model comparison grouped by `model_name`
- `days` param uses `enum: [7, 30, 90]`, defaults to 7
- Stats queries use `$1::integer * INTERVAL '1 day'` (not string concatenation) for the time window
- Daily stats use `generate_series` LEFT JOIN to fill zero-count days for chart rendering

## ML Model Quality (Phase 4.0c-4)

- `GET /ml/stats/model-quality` — admin-only, filesystem-backed (reads `-metrics.json` files from `ML_MODELS_PATH`)
- Returns per-model: accuracy, top-3 accuracy, class count, size, quality gate status, per-class accuracy (sorted worst-first), top-20 confused pairs
- `metrics-schema.ts` validates `-metrics.json` with hand-rolled type guard (same pattern as `metadata-schema.ts`)
- `quality-reader.ts` reads metrics files + `computeConfusedPairs` (off-diagonal extraction from confusion matrix)
- `metrics_available: false` when metrics file is missing — quality fields become null in response
- Quality gates: accuracy >= 0.70, model size <= 10 MB (constants in `quality-routes.ts`)
- Separate plugin from telemetry stats: filesystem reads (quality) vs DB queries (telemetry)

## @fastify/static Route Collisions

- `@fastify/static` with a prefix intercepts ALL requests under that prefix — including exact matches. A static prefix `/ml/models/` would catch `GET /ml/models` before the route handler runs. Use distinct prefixes for API routes vs static files (e.g., `/ml/models` for API, `/ml/model-files/` for static).

## Cookie Handling

- Cookies are signed via `@fastify/cookie` with `signed: true`
- ALWAYS read signed cookies with `request.unsignCookie(request.cookies[NAME])`
- NEVER read `request.cookies[NAME]` directly — returns raw `s:value.hmac` wire format
- Check `.valid === true` before using the value; `.valid === false` means tampered -> 401
- `sameSite` is `'strict'` in production/staging, `'lax'` in development/test — controlled by `COOKIE_SAME_SITE` const in `cookies.ts`. The `'lax'` setting allows cross-port requests during E2E testing (web at `:4173`, API at `:3010`)

## E2E Test Auth (test-signin endpoint)

- `POST /auth/test-signin` — test-only endpoint in `src/auth/test-signin.ts`, registered in `server.ts` inside `config.nodeEnv !== 'production'` block via dynamic `import()`
- Accepts `{ email, role, display_name? }` — email MUST end with `@e2e.test` (schema-enforced pattern)
- Upserts user with `ON CONFLICT (LOWER(email))`, resets `deactivated_at`/`deleted_at` to NULL
- Returns same shape as `POST /auth/signin`: `{ access_token, refresh_token: null, user }` + httpOnly cookie
- No audit log entries — this is test infrastructure, not a production signin
- Rate limit: `max: 100` (high — globalSetup calls it 3x per test run)
- E2E tests call `/auth/test-signin` + `/auth/refresh` per test. With 70+ tests sharing one IP, rate limits must be high enough to avoid cascading 429 failures. Current limits: test-signin `max: 100`, refresh `max: 120`
- Production guard: plugin throws at registration time if `config.nodeEnv === 'production'` (defense-in-depth)
- `CORS_ORIGIN` supports comma-separated values (e.g., `https://host:5173,https://host:4173`) for multi-port dev/E2E setups. Parsed in `config.ts` `loadCorsOrigin()`, returns string or string[] to `@fastify/cors`

## OAuth / JWT Security

- Provider `aud` claims MUST be normalized before comparison:
  `const audList = Array.isArray(aud) ? aud : [aud]`
- `client_type` ('native' | 'web') is derived from the verified `aud` claim at signin, stored
  in `refresh_tokens`, and inherited on rotation — NEVER trust client-supplied headers for this
- Access tokens: ES256 asymmetric signing; refresh tokens: SHA-256 hashed before DB storage
- `/signin` calls `withTransaction` without `userId` (user may not exist yet) — auth tables
  must permit unauthenticated access (`app.user_id = ''`) during signin

## Type Safety

- NEVER use `as T` without a preceding runtime check or type guard function
- NEVER use `as unknown as T` — write a proper type guard instead
- Response schema nullability must match the actual return type (e.g. `string | null`, not `string`)
- Provider claim types that may be `string | string[]` must be handled for both shapes

## Catalog API (Phase 1.5+)

- Catalog routes live in `src/catalog/` with domain-scoped modules (characters/, items/, etc.)
- Catalog queries colocate with routes (`src/catalog/characters/queries.ts`), NOT in `src/db/queries.ts`
- Catalog reads use `pool.query()` directly — no `withTransaction`, no RLS context
- Franchise-scoped routes live under `/catalog/franchises/:franchise/...` — the `:franchise` param is inherited by all child plugins
- Slug uniqueness is franchise-scoped: `UNIQUE (slug, franchise_id)` on characters, factions, sub_groups, continuity_families, toy_lines, items
- Detail lookups always validate franchise ownership: `WHERE slug = $1 AND fr.slug = $2`
- Manufacturers stay globally unique slugs (franchise-agnostic)
- FTS uses generated `search_vector tsvector STORED` columns — queries use `WHERE search_vector @@ ...`, never recompute the tsvector expression inline
- `search_aliases TEXT` on `characters` and `items` feeds into `search_vector` — space-separated alternate search terms (acronym expansions, nicknames). NULL when not needed. Internal only, not in API responses.
- Fastify's `fast-json-stringify` does NOT support `oneOf` for serialization — use a flat superset schema with nullable fields instead. Apply discriminated unions at the web Zod layer, not the Fastify schema layer
- All list endpoints use page-based pagination: `{ data, page, limit, total_count }` response shape via `pageListResponse()` helper
- Limit validation: `enum: [20, 50, 100]` on catalog and collection endpoints; `minimum: 1, maximum: 100` on search
- `catalog/shared/pagination.ts` was removed — all cursor pagination utilities (`encodeCursor`, `decodeCursor`, `buildCursorPage`, `clampLimit`) are gone. `paginationQuery` and `cursorListResponse` also removed from `catalog/shared/schemas.ts`
- `buildItemsQuery` parameter indexing: each filter block uses `$${idx}` and increments `idx++` — except the LAST filter (ESLint `no-useless-assignment` flags it). When adding a new filter, add `idx++` to the previously-last filter block
- Offset/limit params use `$N` dynamic indexing appended after filter params (same pattern as the removed cursor params)
- Error responses use `reply.code(N).send({ error: '...' })` — no HttpError (no transactions)
- CRITICAL: Every property in a response schema's `properties` MUST appear in `required` — Fastify's fast-json-stringify silently DROPS unrequired null fields from the response body, so clients never see them
- Count queries must have identical JOINs as data queries (minus LIMIT/OFFSET) to avoid inflated total_count
- Migrations that depend on columns added by other migrations must be ordered accordingly — do not create indexes on columns that don't exist yet
- See `docs/decisions/ADR_Catalog_API_Architecture.md` for full architecture

## Catalog Filters & Facets (Phase 1.7+)

- Each list endpoint defines its own querystring schema with `page`, `limit`, and domain-specific filter fields — there is no shared `paginationQuery` fragment (it was removed with the cursor utilities)
- Filtered list queries use `buildItemsQuery()` in `items/queries.ts` — returns shared `{ joins, whereClause, params }` for both data and count queries. Limit/offset params are appended AFTER filter params with dynamic `$N` indexing
- Facet cross-filtering: each dimension runs its own GROUP BY query excluding its own filter via `filtersExcluding(key)`. All 5 queries run in parallel via `Promise.all`
- Facets use unified `{ value: string, label: string, count: number }` shape — slug-based facets use `value=slug, label=name`; free-text facets use `value=label=raw_value`; boolean facets use `value="true"/"false", label="Third Party"/"Official"`
- NULL values excluded from facets: manufacturer facet uses `AND mfr.id IS NOT NULL`, size_class uses `AND i.size_class IS NOT NULL`
- Stats queries with multiple independent aggregates (e.g., item count + toy line count) must use subquery JOINs — dual LEFT JOINs from the same anchor table produce Cartesian products
- Character filters & facets follow the same pattern as items: `buildCharactersQuery()` in `characters/queries.ts`, `getCharacterFacets()` with 3-way cross-filtering (factions, character_types, sub_groups)
- Many-to-many facet pattern (sub-groups): the **filter** uses `EXISTS (SELECT 1 FROM junction...)` to avoid row multiplication; the **facet** uses `JOIN` + `COUNT(DISTINCT c.id)` since it needs `sg.slug`/`sg.name` for GROUP BY

## Catalog Shared Modules

- `catalog/shared/schemas.ts` — shared schema fragments: `itemListItem`, `facetValueItem`, `slugNameRef`, `nullableSlugNameRef`, `pageListResponse`. Import these instead of defining local copies.
- `catalog/shared/formatters.ts` — shared `formatListItem()` and `formatDetail()` for item responses. Used by both `items/routes.ts` and `manufacturers/routes.ts`.
- Do NOT reuse `nullableSlugNameRef` from `catalog/shared/schemas.ts` in new modules — it uses `oneOf` which `fast-json-stringify` does not support. Define nullable object schemas inline with `type: ['object', 'null']` instead

## Adding a Field to Item List Responses

Adding a column to item list API responses requires updating ALL of these (missing any one causes silent failures):

1. `items/queries.ts` — `ItemListRow` interface + SELECT column + any needed JOINs
2. `shared/schemas.ts` — `itemListItem.required` + `itemListItem.properties`
3. `shared/formatters.ts` — `formatListItem()` return object
4. `items/schemas.ts` — `itemDetail.required` + `itemDetail.properties` (detail schema is hand-written, NOT derived from `itemListItem`)
5. `manufacturers/queries.ts` — same JOIN + SELECT if manufacturer-scoped items also need the field
6. `search/queries.ts` + `search/schemas.ts` + `search/routes.ts` — if search results should include it (NULL for characters, real value for items)
7. Web `zod-schemas.ts` — `CatalogItemSchema` (and `SearchResultBaseSchema` if applicable)
8. All test files with inline mock `ItemListRow` / `CatalogItem` objects — search for `data_quality.*verified` to find them

- CRITICAL: `items/schemas.ts` `itemDetail` is a SEPARATE hand-written schema that does NOT reference `itemListItem`. But web `CatalogItemDetailSchema` extends `CatalogItemSchema`. If you add the field to the list schema but not the detail schema, Fastify silently drops it and Zod parse fails on the web.

## Collection API (Phase 1.8+)

- Collection routes live in `src/collection/` — top-level module parallel to `catalog/`, `admin/`, `auth/`
- Collection list uses page/offset pagination (`LIMIT $4 OFFSET $5`) with `enum: [20, 50, 100]` limit validation — NOT cursor-based. Response shape: `{ data, page, limit, total_count }`
- Export/import: `GET /collection/export` returns slug-based JSON (no UUIDs), `POST /collection/import` resolves slugs via `batchGetItemIdsBySlugs` (UNNEST query), uses SAVEPOINT per insert for partial success
- Partial-success inserts require `SAVEPOINT` / `ROLLBACK TO SAVEPOINT` per insert — PostgreSQL aborts the entire transaction on any error without savepoints. Always log the error before rolling back.
- Export includes `deleted_count` in stats for UI to prompt about soft-deleted items
- Collection photo routes live in `src/collection/photos/` — registered as a sub-plugin of `collectionRoutes` at `/:id/photos`. `@fastify/multipart` registered scoped to the photo plugin (same pattern as catalog photos)
- Collection photo queries accept `client: PoolClient` (collection RLS pattern), unlike catalog photo queries which use `pool.query()` directly
- `getCollectionItemRef(client, collectionItemId)` is the shared lookup function for all collection photo handlers — returns `{ id, item_id } | null`, verifies existence and ownership via RLS
- Collection photos have no `status` column (private, no approval needed). Catalog photos contributed by users enter `item_photos` with `status: 'pending'` via `insertPendingCatalogPhoto`
- `photo_contributions` table has no RLS (shared audit data). `collection_item_photo_id` is nullable with `ON DELETE SET NULL` for GDPR compatibility
- Content-type hook in `collectionRoutes` accepts both `application/json` and `multipart/form-data` (updated from JSON-only when photo routes were added)
