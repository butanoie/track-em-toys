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
```

## Conventions

### Fastify
- Plugin functions MUST be `async (fastify: FastifyInstance, _opts: object): Promise<void>`
- ALL response schemas MUST have `additionalProperties: false` and `required: [...]`
- Array item schemas also need `additionalProperties: false` and `required`
- NEVER use `void` before a synchronous method call — it suppresses errors silently

### Database
- NEVER use `SELECT *` or `RETURNING *` — always list explicit columns matching the TypeScript interface
- Column lists must stay in sync with the corresponding TypeScript type in `src/types/index.ts`
- ALL DB changes via migration files in `api/db/migrations/`, never direct schema edits
- Migrations must be additive (add columns/tables) by default — destructive changes (drop column, drop table) require explicit user instruction
- Migration filenames follow `NNN_description.sql` sequential numbering with no gaps

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

## Before Writing New Code

Read existing files for patterns before writing anything new:
- New route handler → read `src/auth/routes.ts` for handler structure
- New query function → read `src/db/queries.ts` for query patterns and column lists
- New test file → read `src/auth/routes.test.ts` for test patterns
- New schema → read `src/auth/schemas.ts` for schema patterns
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

### 5. No SELECT * or RETURNING *

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

---

## Key Patterns

### Signed cookie reads
```typescript
// CORRECT — use the readSignedCookie helper in route handlers
const unsigned = readSignedCookie(request, COOKIE_NAME)
if (unsigned !== null && !unsigned.valid) return reply.code(401).send({ error: 'Invalid token' })
const value = unsigned?.value ?? null

// WRONG — bypasses the helper and reads the raw s:value.hmac wire format
const value = request.cookies[COOKIE_NAME]
```

### HttpError — inside transactions only
```typescript
// Inside withTransaction: triggers ROLLBACK + HTTP response
await withTransaction(async (client) => {
  const token = await queries.findToken(client, hash)
  if (!token) throw new HttpError(401, { error: 'Invalid token' })
})

// Pre-transaction: reply directly
if (isNetworkError(err)) return reply.code(503).send({ error: 'Service unavailable' })

// Post-COMMIT: plain Error for redaction
throw new Error('JWT signing failed')
```

### HTTP side-effects outside transaction callbacks
```typescript
// CORRECT — clear cookie AFTER withTransaction resolves (confirmed COMMIT)
await withTransaction(async (client) => {
  await queries.revokeRefreshToken(client, hash)
}, userId)
clearRefreshTokenCookie(reply) // outside callback
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
const expiresAt = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000)
```

### Content-Type hook — allow absent header
```typescript
fastify.addHook('preValidation', async (request, reply) => {
  if (request.method !== 'POST') return
  const contentType = request.headers['content-type']
  if (contentType === undefined) return
  const baseType = contentType.split(';')[0]?.trim() ?? ''
  if (baseType !== 'application/json') return reply.code(415).send({ error: '...' })
})
```

### User-supplied string sanitization
```typescript
// eslint-disable-next-line no-control-regex
return input.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen) || null
```

### Audit / logging — severity levels
```typescript
// All auth audit log failures → log.error with event_type in message (security events)
// Message includes event_type for fast identification and uses "will commit" (still inside transaction)
fastify.log.error({ err: auditErr }, 'audit log failed for signin — signin will commit')
fastify.log.error({ err: auditErr }, 'audit log failed for refresh — token rotation will commit')
fastify.log.error({ err: auditErr }, 'audit log failed for logout — token revocation will commit')

// Operational diagnostic (not an audit catch block) → log.warn
request.log.warn({ tokenHashPrefix, userId }, 'Logout: refresh token not found in database')
```

### Test mocks — no double cast
```typescript
// CORRECT — export a narrow type from source, use satisfies in tests
export type QueryOnlyClient = Pick<PoolClient, 'query'>
const mockClient = { query: vi.fn() } satisfies QueryOnlyClient
```

### Vitest module isolation
```typescript
vi.resetModules()
vi.doMock('../config.js', () => ({ config: { /* override */ } }))
const { myFn } = await import('./module.js')
vi.doUnmock('../config.js')
vi.resetModules()
```

### URL sanitization for storage
```typescript
function sanitizeAvatarUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return null
    if (parsed.username !== '' || parsed.password !== '') return null
    return parsed.href
  } catch {
    return null
  }
}
```

### Named constants for column width limits
```typescript
const MAX_DEVICE_INFO_LENGTH = 255 // refresh_tokens.device_info VARCHAR(255)
const deviceInfo = sanitize(rawDeviceInfo, MAX_DEVICE_INFO_LENGTH)
```

### Test non-null assertions
```typescript
// CORRECT — assert before using !
const call = logCalls.find(([, p]) => p.event_type === 'signin')
expect(call).toBeDefined()
expect(call![1].user_agent).toBe('Mozilla/5.0')
```
