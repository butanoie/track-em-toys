# API — Domain-Specific Rules

> Supplements the root `CLAUDE.md`. Rules here are additive.

## Stack

Node.js 22 LTS, Fastify 5, TypeScript strict mode, PostgreSQL 17, vitest.

## Build Commands

```bash
cd api && npm run dev         # Start dev server (https://localhost:3010)
cd api && npm run build       # TypeScript compile
cd api && npm test            # Vitest + ESLint (combined)
cd api && npm run typecheck   # tsc type-check only
cd api && npm run lint        # ESLint only
cd api && npm run lint:fix    # ESLint with auto-fix
cd api && npm run format      # Prettier format all files
cd api && npm run format:check # Prettier check (CI mode)
```

## Conventions

### Fastify

- Plugin functions MUST be `async (fastify: FastifyInstance, _opts: object): Promise<void>`
- ALL response schemas MUST have `additionalProperties: false` and `required: [...]`
- Array item schemas also need `additionalProperties: false` and `required`
- NEVER use `void` before a synchronous method call — it suppresses errors silently

### CORS

- `@fastify/cors` v11 defaults to `methods: 'GET,HEAD,POST'` only — PATCH, PUT, DELETE are NOT included by default
- Explicit `methods` array is set in `server.ts` — when adding a new HTTP method, verify it is listed there

### Database

- PostgreSQL auto-names inline FK constraints as `{table}_{column}_fkey` — use this pattern when dropping/recreating constraints in migrations
- NEVER use `SELECT *` or `RETURNING *` — always list explicit columns matching the TypeScript interface
- Column lists must stay in sync with the corresponding TypeScript type in `src/types/index.ts`
- ALL DB changes via migration files in `api/db/migrations/`, never direct schema edits
- Migrations must be additive (add columns/tables) by default — destructive changes (drop column, drop table) require explicit user instruction
- Migration filenames follow `NNN_description.sql` sequential numbering with no gaps
- TEXT→FK column migration pattern: (1) add nullable FK column, (2) populate from existing data via UPDATE+JOIN, (3) SET NOT NULL, (4) add FK constraint, (5) drop old indexes + create new, (6) drop old TEXT column. Always include `migrate:down`.
- Catalog tables use UUID PKs with a unique `slug` column (e.g. `"optimus-prime"`) for stable references and URL-friendly routes
- Seed data in `api/db/seed/` uses slug-based FK references between entities — NEVER integer IDs (integer IDs are positional and break when data is reordered or regenerated)
- Seed data organization: see `api/db/seed/README.md` for directory structure, import order, and column mapping
- Seed `_metadata.total` must always equal the actual array length — recount after any addition or removal, never increment/decrement manually
- Seed FK naming: JSON uses `{table}_slug` (e.g. `franchise_slug`, `faction_slug`), DB column is `{table}_id` (UUID FK). Ingest script resolves slugs to UUIDs via `resolveSlug()` maps
- Reference tables follow the pattern: `id UUID PK, slug TEXT UNIQUE, name TEXT, sort_order INT, notes TEXT, created_at TIMESTAMPTZ` (no `updated_at`)
- When adding a column to a reference table: add to seed JSON, record interface in `ingest.ts`, TypeScript interface in `types/index.ts`, and validation tests in `seed-validation.test.ts`
- When changing a UNIQUE constraint, grep `ON CONFLICT` in `db/seed/ingest.ts` — the conflict target must match the new constraint exactly

### GDPR / User Deletion (Tombstone Pattern)

- User "deletion" = scrub PII (`email`, `display_name`, `avatar_url`) + set `deleted_at` — the `users` row is preserved as a tombstone so all FKs remain intact
- NEVER use `ON DELETE CASCADE` or `ON DELETE SET NULL` on user FKs — the user row is never actually deleted from the database
- User FKs keep their original nullability — `NOT NULL` FKs like `catalog_edits.editor_id` stay `NOT NULL` because the referenced user row always exists
- App checks `u.deleted_at IS NOT NULL` on JOINs to display "Deleted user" instead of the scrubbed fields
- Auth data (`refresh_tokens`, `oauth_accounts`) is hard-deleted during scrub — no need for tombstone on auth tables
- GDPR purge must also scrub `auth_events` PII (`ip_address`, `user_agent`, `metadata`) — IP addresses and user agents are personal data under GDPR
- `oauth_accounts` and `refresh_tokens` use `ON DELETE RESTRICT` (fixed in migration 021 from legacy CASCADE)
- When adding a new table with a user FK, no special ON DELETE clause is needed (default RESTRICT is correct)

### User Roles & Authorization

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
- Admin mutation routes must reject GDPR-purged users (`deleted_at IS NOT NULL` → 409)
- Admin mutation routes must block self-modification (`params.id === request.user.sub` → 403)
- All `:id` path params must have `format: 'uuid'` in the route schema to prevent 500 from invalid UUIDs
- Admin audit events logged to `auth_events`: `role_changed`, `account_deactivated`, `account_reactivated`, `user_purged`
- Any function that gates user access (signin, refresh, admin mutations) must check BOTH `deactivated_at` AND `deleted_at` — never assume one implies the other
- `getUserStatusAndRole()` is the canonical function for this — returns `{ status: 'active' | 'deactivated' | 'deleted' | 'not_found', role }` in a single DB query
- `findUserForAdmin()` uses `FOR UPDATE` to serialize concurrent mutations (critical for last-admin protection)
- First admin user bootstrapped via CLI command: `npm run set-role -- <email> admin`

### Photo Domains

Two distinct photo types:

- **Catalog photos** (`item_photos`): Shared reference images, no RLS. `uploaded_by` tracks contributor for attribution. Feed ML training directly. Upload requires `curator` role.
- **User collection photos** (future, post-ML): Private, RLS-protected. Separate table with `user_id` + RLS policy using `(SELECT current_app_user_id())`.
- `item_photos` does NOT have RLS — this is intentional. Catalog photos are app-managed content visible to all users.

### Cookie Handling

- Cookies are signed via `@fastify/cookie` with `signed: true`
- ALWAYS read signed cookies with `request.unsignCookie(request.cookies[NAME])`
- NEVER read `request.cookies[NAME]` directly — returns raw `s:value.hmac` wire format
- Check `.valid === true` before using the value; `.valid === false` means tampered → 401

### OAuth / JWT Security

- Provider `aud` claims MUST be normalized before comparison:
  `const audList = Array.isArray(aud) ? aud : [aud]`
- `client_type` ('native' | 'web') is derived from the verified `aud` claim at signin, stored
  in `refresh_tokens`, and inherited on rotation — NEVER trust client-supplied headers for this
- Access tokens: ES256 asymmetric signing; refresh tokens: SHA-256 hashed before DB storage
- `/signin` calls `withTransaction` without `userId` (user may not exist yet) — auth tables
  must permit unauthenticated access (`app.user_id = ''`) during signin

### Type Safety

- NEVER use `as T` without a preceding runtime check or type guard function
- NEVER use `as unknown as T` — write a proper type guard instead
- Response schema nullability must match the actual return type (e.g. `string | null`, not `string`)
- Provider claim types that may be `string | string[]` must be handled for both shapes

### Catalog API (Phase 1.5+)

- Catalog routes live in `src/catalog/` with domain-scoped modules (characters/, items/, etc.)
- Catalog queries colocate with routes (`src/catalog/characters/queries.ts`), NOT in `src/db/queries.ts`
- Catalog reads use `pool.query()` directly — no `withTransaction`, no RLS context
- Franchise-scoped routes live under `/catalog/franchises/:franchise/...` — the `:franchise` param is inherited by all child plugins
- Slug uniqueness is franchise-scoped: `UNIQUE (slug, franchise_id)` on characters, factions, sub_groups, continuity_families, toy_lines, items
- Detail lookups always validate franchise ownership: `WHERE slug = $1 AND fr.slug = $2`
- Manufacturers stay globally unique slugs (franchise-agnostic)
- FTS uses generated `search_vector tsvector STORED` columns — queries use `WHERE search_vector @@ ...`, never recompute the tsvector expression inline
- Fastify's `fast-json-stringify` does NOT support `oneOf` for serialization — use a flat superset schema with nullable fields instead. Apply discriminated unions at the web Zod layer, not the Fastify schema layer
- Cursor pagination encodes `{ v: 1, name, id }` as base64url — always include version field
- `buildItemsQuery` parameter indexing: each filter block uses `$${idx}` and increments `idx++` — except the LAST filter (ESLint `no-useless-assignment` flags it). When adding a new filter, add `idx++` to the previously-last filter block
- Cursor UUID comparison uses `$N::uuid`, not text cast
- Error responses use `reply.code(N).send({ error: '...' })` — no HttpError (no transactions)
- CRITICAL: Every property in a response schema's `properties` MUST appear in `required` — Fastify's fast-json-stringify silently DROPS unrequired null fields from the response body, so clients never see them
- Count queries must have identical JOINs as data queries (minus cursor/LIMIT) to avoid inflated total_count
- Migrations that depend on columns added by other migrations must be ordered accordingly — do not create indexes on columns that don't exist yet
- See `docs/decisions/ADR_Catalog_API_Architecture.md` for full architecture

### Catalog Filters & Facets (Phase 1.7+)

- `paginationQuery` (shared schema) has `additionalProperties: false` — CANNOT be extended. Routes with additional query params must create their own querystring schema copying pagination fields
- Filtered list queries use `buildItemsQuery()` in `items/queries.ts` — returns shared `{ joins, whereClause, params }` for both data and count queries. Cursor params are appended AFTER filter params with dynamic `$N` indexing
- Facet cross-filtering: each dimension runs its own GROUP BY query excluding its own filter via `filtersExcluding(key)`. All 5 queries run in parallel via `Promise.all`
- Facets use unified `{ value: string, label: string, count: number }` shape — slug-based facets use `value=slug, label=name`; free-text facets use `value=label=raw_value`; boolean facets use `value="true"/"false", label="Third Party"/"Official"`
- NULL values excluded from facets: manufacturer facet uses `AND mfr.id IS NOT NULL`, size_class uses `AND i.size_class IS NOT NULL`
- Stats queries with multiple independent aggregates (e.g., item count + toy line count) must use subquery JOINs — dual LEFT JOINs from the same anchor table produce Cartesian products
- Character filters & facets follow the same pattern as items: `buildCharactersQuery()` in `characters/queries.ts`, `getCharacterFacets()` with 3-way cross-filtering (factions, character_types, sub_groups)
- Many-to-many facet pattern (sub-groups): the **filter** uses `EXISTS (SELECT 1 FROM junction...)` to avoid row multiplication; the **facet** uses `JOIN` + `COUNT(DISTINCT c.id)` since it needs `sg.slug`/`sg.name` for GROUP BY

### Catalog Shared Modules

- `catalog/shared/schemas.ts` — shared schema fragments: `itemListItem`, `facetValueItem`, `slugNameRef`, `nullableSlugNameRef`, `cursorListResponse`. Import these instead of defining local copies.
- `catalog/shared/formatters.ts` — shared `formatListItem()` and `formatDetail()` for item responses. Used by both `items/routes.ts` and `manufacturers/routes.ts`.

## Before Writing New Code

Read existing files for patterns before writing anything new:

- New route handler → read `src/auth/routes.ts` for handler structure, `src/catalog/characters/routes.ts` for catalog patterns
- New query function → read `src/db/queries.ts` for auth query patterns, `src/catalog/characters/queries.ts` for catalog patterns
- New test file → read `src/auth/routes.test.ts` for test patterns
- New schema → read `src/auth/schemas.ts` for schema patterns, `src/catalog/shared/schemas.ts` for shared catalog fragments
- New type → read `src/types/index.ts` for type conventions
- New migration → read existing files in `db/migrations/` for naming and format

Match existing patterns exactly. Do not introduce new conventions.

## Refactoring Safety (API-Specific)

In addition to the root CLAUDE.md refactoring rules:

- **Never remove a Fastify hook (`preValidation`, `onRequest`, `onSend`) without understanding its purpose** — it may enforce content-type, auth, or rate limiting
- **Never simplify `withTransaction` error handling** without verifying that security-critical writes still commit before error responses are sent
- **Never remove or reorder cookie unsigning logic** — the `readSignedCookie` → `valid` check → use pattern is security-critical

---

## Pre-Submission Checklist

Before reporting any task complete, run these verifications and fix all failures.

### 1. Tests and lint

```bash
cd api && npm test
```

`npm test` runs vitest AND eslint. Both must pass with zero failures and zero warnings.

### 2. TypeScript build

```bash
cd api && npm run build 2>&1 | tail -5
```

Must complete with zero TypeScript errors.

### 3. Fastify plugin signatures

```bash
grep -rn "function.*FastifyInstance.*void" src/
```

Must return zero results — all plugin functions must be `async (...): Promise<void>`.

### 4. Response schema completeness

```bash
grep -rn "additionalProperties" src/auth/schemas.ts
```

Every response schema object must have `additionalProperties: false` and `required: [...]`,
including array item schemas.

### 5. No SELECT _ or RETURNING _

```bash
grep -n "SELECT \*\|RETURNING \*\|u\.\*" src/db/queries.ts
```

Must return zero results. Always use explicit column lists matching the TypeScript interface.

### 6. Signed cookie reads

```bash
grep -n "request\.cookies\[" src/auth/routes.ts | grep -v "wireFormatCookie"
```

Must return zero results. The only `request.cookies[` read must be inside the
`readSignedCookie` helper (which wraps `request.unsignCookie()`). All route handlers
must use the helper, never read cookies directly.

### 7. Type assertions in production code

```bash
grep -rn " as [A-Z]" src/ --include="*.ts" | grep -v "\.test\.ts" | grep -v "eslint-disable"
```

Every result must have either a preceding runtime type guard (`typeof`, `instanceof`,
`.includes()`) or an `eslint-disable-next-line` comment explaining why the cast is safe.
`as const` and `satisfies` are fine. `as Record<string, unknown>` after a `typeof === 'object'`
check is the approved narrowing pattern.

```bash
grep -rn "as unknown as\|as never" src/ --include="*.ts"
```

Must return zero results in all files including tests. Use `satisfies Pick<T, 'method'>`
for mock objects. Export narrow types from source modules (e.g. `QueryOnlyClient`).

### 8. No void on synchronous calls

```bash
grep -rn "void reply\." src/
```

Must return zero results.

### 9. Provider aud normalization

```bash
grep -n "payload\.aud\s*===" src/auth/
```

Must return zero results. Always normalize: `Array.isArray(aud) ? aud : [aud]`.

### 10. HttpError usage — transactions only

```bash
grep -n "throw new HttpError" src/auth/routes.ts
```

Every `throw new HttpError` must be **inside** a `withTransaction` callback. Outside a
transaction, use `return reply.code(x).send(...)` (pre-transaction) or `throw new Error(...)`
(post-COMMIT).

For each `throw new HttpError` inside a transaction, verify no preceding write is required to
commit. If such a write exists, commit first, then return the error outside the transaction.

### 11. Schema/type alignment

For any new field returned in a response:

- Add it to the Fastify response schema with correct type (including `| null` if nullable)
- Add it to the corresponding TypeScript interface in `src/types/index.ts`
- Add it to `required: [...]` if always present
- Add it to the web Zod schema in `web/src/lib/zod-schemas.ts` — Zod strips unknown keys by default, so a missing field silently disappears from the web client
- Update all mock `User` objects in test files — search for the interface name across `*.test.ts` files

### 12. DB CHECK constraints match TypeScript unions

```bash
grep -n "CHECK.*IN\s*(" db/schema.sql db/migrations/*.sql
```

Cross-reference each `CHECK (col IN (...))` against its TypeScript union in `src/types/index.ts`.
When adding a union value, verify the DB constraint includes it.

### 13. User-supplied string sanitization

```bash
grep -rEn "\.replace\(/\[.*x00" src/ --include="*.ts" | grep -v "\.test\.ts"
```

Every result must follow: `.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen) || null`.
The `.trim()` between `.replace()` and `.slice()` is mandatory.

Functions storing user-controlled data must apply this chain internally, not rely on callers.

### 14. Named constants for column width truncation

```bash
grep -rn "\.slice(0," src/ --include="*.ts" | grep -v "\.test\.ts"
```

Every `.slice(0, N)` on user-supplied data stored to a DB column must use a named constant
referencing the column (e.g. `MAX_DEVICE_INFO_LENGTH = 255` for `refresh_tokens.device_info
VARCHAR(255)`). Verify `N` matches the DB column width in `db/schema.sql`.
Log-prefix extractions like `tokenHash.slice(0, 8)` are exempt (not column truncation).

Same source value stored in two columns must be truncated per-destination.

### 15. RLS wrapper usage

```bash
grep -rn "current_app_user_id()" src/ --include="*.ts" | grep -v "SELECT current_app_user_id()"
```

Must return zero results. RLS policies must always use `(SELECT current_app_user_id())`.

### 16. UPDATE/DELETE rowCount verification

```bash
grep -n "await client\.query" src/db/queries.ts | grep -i "UPDATE\|DELETE"
```

For security-critical mutations, verify calling code checks `result.rowCount === 1` (or `>= 1`)
and throws if the assertion fails.

### 17. Synchronize related duration/expiry constants

```bash
grep -rn "REFRESH_TOKEN\|ACCESS_TOKEN\|MAX_AGE\|EXPIRY_DAYS" src/ --include="*.ts" | grep -i "const\|export"
```

Related duration constants must be derived from a single source constant.

### 18. HTTP status code semantics

- **400** — malformed syntax, missing fields, invalid JSON
- **401** — missing or invalid credentials
- **403** — valid credentials, insufficient permissions
- **415** — wrong Content-Type
- **503** — upstream dependency failure

### 19. Route response schemas — bidirectional accuracy

```bash
grep -oE "code\([0-9]+\)|HttpError\([0-9]+" src/auth/routes.ts | grep -oE "[0-9]+" | sort -u
```

Every status code the handler produces must have a schema entry, and vice versa.

### 20. Integration test coverage

Every new route handler must have `fastify.inject()` tests covering:

- Happy path, auth failure (401/403), validation failure (400), key error paths
- Each distinct conditional branch (e.g. new user vs. existing user)
- Non-fatal audit log failure (mock `logAuthEvent` to throw, assert success + `log.error`)
- Network error 503 for every `isNetworkError` check

### 21. Security-critical audit logging

```bash
grep -n "log\.warn.*audit\|log\.warn.*logAuthEvent\|log\.warn.*reuse\|log\.warn.*takeover" src/auth/routes.ts
```

Must return zero results. All auth-event audit log failures use `log.error`, not `log.warn`.
This covers every `logAuthEvent` catch block: `signin`, `refresh`, `logout`, `link_account`,
`provider_auto_linked`, `token_reuse_detected`. No auth audit catch block should use `log.warn`.

### 22. URL sanitization for storage

```bash
grep -rn "new URL(" src/ --include="*.ts" | grep -v "\.test\.ts"
```

For every `new URL()` validating a URL for storage: reject userinfo
(`parsed.username === '' && parsed.password === ''`), return `parsed.href` (normalized),
enforce `https:` only in production.

### 23. Environment config typing

```bash
grep -n "nodeEnv" src/config.ts
```

`nodeEnv` must use a TypeScript union (`'development' | 'test' | 'staging' | 'production'`),
not `string`. Validate at startup.

### 24. Rate limiting on all routes

```bash
grep -rEn "fastify\.(get|post|put|delete|patch)" src/ --include="*.ts"
```

Every route listed must have `config: { rateLimit: { max: N, timeWindow: '1 minute' } }` in
its options object (may be on a different line — verify manually for each result).
Auth routes: 5-20 req/min. Public reads: up to 100 req/min.

### 25. email_verified upgrade path

```bash
grep -n "email_verified" src/db/queries.ts
```

Verify there is an update path that sets `email_verified = true` when a verified provider
confirms the email.

### 26. Test non-null assertions must have a preceding expect

```bash
grep -rEn "\w+!\." src/ --include="*.test.ts"
```

Every `x!.field` must be preceded by `expect(x).toBeDefined()` or equivalent.

### 27. Every new source file must have a companion test file

```bash
for f in src/**/*.ts; do [[ "$f" == *.test.ts ]] && continue; t="${f%.ts}.test.ts"; [[ ! -f "$t" ]] && echo "MISSING TEST: $t"; done
```

Type-only files (`src/types/index.ts`) and schema-only files (`src/auth/schemas.ts`) are exempt —
types have no runtime behavior to test, and schemas are exercised through route handler tests.

### 28. Schema docs sync after migrations

After creating a new migration, grep for affected column/table names across all docs:

```bash
grep -rn "column_name\|table_name" --include="*.md" --include="*.tsx" --include="*.jsx" docs/ api/src/types/
```

Files that commonly need updating: `api/src/types/index.ts`, `docs/diagrams/toy-catalog-database-diagrams.jsx`,
`docs/decisions/Schema_Design_Rationale.md`, `docs/decisions/Architecture_Research_*.md`

---

## Key Patterns

### Signed cookie reads

```typescript
// CORRECT — use the readSignedCookie helper in route handlers
const unsigned = readSignedCookie(request, COOKIE_NAME);
if (unsigned !== null && !unsigned.valid) return reply.code(401).send({ error: 'Invalid token' });
const value = unsigned?.value ?? null;

// WRONG — bypasses the helper and reads the raw s:value.hmac wire format
const value = request.cookies[COOKIE_NAME];
```

### HttpError — inside transactions only

```typescript
// Inside withTransaction: triggers ROLLBACK + HTTP response
await withTransaction(async (client) => {
  const token = await queries.findToken(client, hash);
  if (!token) throw new HttpError(401, { error: 'Invalid token' });
});

// Pre-transaction: reply directly
if (isNetworkError(err)) return reply.code(503).send({ error: 'Service unavailable' });

// Post-COMMIT: plain Error for redaction
throw new Error('JWT signing failed');
```

### HTTP side-effects outside transaction callbacks

```typescript
// CORRECT — clear cookie AFTER withTransaction resolves (confirmed COMMIT)
await withTransaction(async (client) => {
  await queries.revokeRefreshToken(client, hash);
}, userId);
clearRefreshTokenCookie(reply); // outside callback
```

### Security-critical writes must commit before returning errors

```typescript
// CORRECT — commit revocation first, then return error outside the transaction
await withTransaction(async (client) => {
  await queries.revokeAllUserRefreshTokens(client, userId)
  try {
    await queries.logAuthEvent(client, { event_type: 'token_reuse_detected', ... })
  } catch (err) {
    log.error({ err }, 'audit log failed — revocation committed')
  }
}, userId)
return reply.code(401).send({ error: 'Token reuse detected' })
```

### Atomic state mutations after async

```typescript
// CORRECT — complete all async work first, then assign state synchronously
const jwk = await exportJWK(publicKey)
keys.set(kid, entry)
currentKid = kid
cachedJwks = [...]
```

### Expiry date arithmetic

```typescript
// CORRECT — UTC milliseconds, immune to DST transitions
const expiresAt = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);
```

### Content-Type hook — allow absent header

```typescript
fastify.addHook('preValidation', async (request, reply) => {
  if (request.method !== 'POST') return;
  const contentType = request.headers['content-type'];
  if (contentType === undefined) return;
  const baseType = contentType.split(';')[0]?.trim() ?? '';
  if (baseType !== 'application/json') return reply.code(415).send({ error: '...' });
});
```

### User-supplied string sanitization

```typescript
// eslint-disable-next-line no-control-regex
return (
  input
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen) || null
);
```

### Audit / logging — severity levels

```typescript
// All auth audit log failures → log.error with event_type in message (security events)
// Message includes event_type for fast identification and uses "will commit" (still inside transaction)
fastify.log.error({ err: auditErr }, 'audit log failed for signin — signin will commit');
fastify.log.error({ err: auditErr }, 'audit log failed for refresh — token rotation will commit');
fastify.log.error({ err: auditErr }, 'audit log failed for logout — token revocation will commit');

// Operational diagnostic (not an audit catch block) → log.warn
request.log.warn({ tokenHashPrefix, userId }, 'Logout: refresh token not found in database');
```

### Test mocks — no double cast

```typescript
// CORRECT — export a narrow type from source, use satisfies in tests
export type QueryOnlyClient = Pick<PoolClient, 'query'>;
const mockClient = { query: vi.fn() } satisfies QueryOnlyClient;
```

### Vitest module isolation

```typescript
vi.resetModules();
vi.doMock('../config.js', () => ({
  config: {
    /* override */
  },
}));
const { myFn } = await import('./module.js');
vi.doUnmock('../config.js');
vi.resetModules();
```

When adding a new exported function to a module that is `vi.mock()`'d in tests, you MUST add it to every mock definition for that module — otherwise tests get `No "funcName" export is defined on the mock` runtime errors. Search: `vi.mock.*module-path` across test files.

### URL sanitization for storage

```typescript
function sanitizeAvatarUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username !== '' || parsed.password !== '') return null;
    return parsed.href;
  } catch {
    return null;
  }
}
```

### Named constants for column width limits

```typescript
const MAX_DEVICE_INFO_LENGTH = 255; // refresh_tokens.device_info VARCHAR(255)
const deviceInfo = sanitize(rawDeviceInfo, MAX_DEVICE_INFO_LENGTH);
```

### Test non-null assertions

```typescript
// CORRECT — assert before using !
const call = logCalls.find(([, p]) => p.event_type === 'signin');
expect(call).toBeDefined();
expect(call![1].user_agent).toBe('Mozilla/5.0');
```
