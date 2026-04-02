# API — Domain-Specific Rules

> Supplements the root `CLAUDE.md`. Rules here are additive.
> Detailed patterns are in `.claude/rules/api-*.md` (path-scoped, auto-loaded by Claude).

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
- Time-window queries: use `$1::integer * INTERVAL '1 day'` (parameterized integer multiplication), NEVER `($1 || ' days')::INTERVAL` (string concatenation, fragile)
- Column lists must stay in sync with the corresponding TypeScript type in `src/types/index.ts`
- ALL DB changes via migration files in `api/db/migrations/`, never direct schema edits
- Migrations must be additive (add columns/tables) by default — destructive changes (drop column, drop table) require explicit user instruction
- Migration filenames follow `NNN_description.sql` sequential numbering with no gaps
- PostgreSQL enum values cannot be removed — use the rename-create-swap-drop pattern: `ALTER TYPE RENAME TO _old`, create new type, `DROP DEFAULT` on the column, `ALTER COLUMN TYPE ... USING col::text::new_type`, `SET DEFAULT` with new type, `DROP TYPE _old`. The `DROP DEFAULT` before `ALTER TYPE` is required — PG can't auto-cast defaults between enum types (error 42804).
- PostgreSQL `GENERATED ALWAYS AS` columns cannot be ALTERed — to change the expression, DROP the column (and its indexes) then re-ADD. See migration 035.
- TEXT->FK column migration pattern: (1) add nullable FK column, (2) populate from existing data via UPDATE+JOIN, (3) SET NOT NULL, (4) add FK constraint, (5) drop old indexes + create new, (6) drop old TEXT column. Always include `migrate:down`.

> **Detailed database patterns** (seed data, relationships, sync, GDPR, RLS): see `.claude/rules/api-database.md`

## Before Writing New Code

Read existing files for patterns before writing anything new:

- New route handler -> read `src/auth/routes.ts` for handler structure, `src/catalog/characters/routes.ts` for catalog patterns
- New query function -> read `src/db/queries.ts` for auth query patterns, `src/catalog/characters/queries.ts` for catalog patterns
- New test file -> read `src/auth/routes.test.ts` for test patterns
- New schema -> read `src/auth/schemas.ts` for schema patterns, `src/catalog/shared/schemas.ts` for shared catalog fragments
- New type -> read `src/types/index.ts` for type conventions
- New migration -> read existing files in `db/migrations/` for naming and format

Match existing patterns exactly. Do not introduce new conventions.

## Refactoring Safety (API-Specific)

In addition to the root CLAUDE.md refactoring rules:

- **Never remove a Fastify hook (`preValidation`, `onRequest`, `onSend`) without understanding its purpose** — it may enforce content-type, auth, or rate limiting
- **Never simplify `withTransaction` error handling** without verifying that security-critical writes still commit before error responses are sent
- **Never remove or reorder cookie unsigning logic** — the `readSignedCookie` -> `valid` check -> use pattern is security-critical

---

> **Route & domain patterns** (roles, photos, ML, catalog, collection, auth, cookies, type safety): see `.claude/rules/api-routes.md`
>
> **Pre-submission checklist & key patterns** (28 verification checks, code examples): see `.claude/rules/api-testing.md`
