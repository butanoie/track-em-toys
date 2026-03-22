# E2E Real Authentication Infrastructure

**Date:** 2026-03-21
**Time:** 18:12:20 UTC
**Type:** Infrastructure
**Phase:** E2E Testing
**Version:** v0.1.0

## Summary

Replaced mocked E2E authentication with real JWT-based auth across all Playwright tests. Added a test-only `POST /auth/test-signin` API endpoint that bypasses OAuth providers, a per-test auth fixture that calls `test-signin` + injects cookies via `context.addCookies()`, and migrated all 8 E2E spec files to use real authentication. Also fixed stale mock fixtures, added CORS multi-origin support, and configured Vite preview server for E2E.

---

## Changes Implemented

### 1. API: Test-Only Signin Endpoint

Added `POST /auth/test-signin` — a Fastify plugin gated behind `NODE_ENV !== 'production'` that accepts `{ email, role }` with `@e2e.test` TLD constraint. Upserts a user and returns real JWT access token + signed httpOnly refresh token cookie, reusing existing auth infrastructure (`withTransaction`, `createAndStoreRefreshToken`, `setRefreshTokenCookie`, `reply.jwtSign`).

**Created:**
- `api/src/auth/test-signin.ts` — endpoint plugin with schema validation, production guard, and rate limiting
- `api/src/auth/test-signin.test.ts` — 11 integration tests (happy path, role variants, validation, production guard, idempotency)

**Modified:**
- `api/src/server.ts` — conditional registration via dynamic `import()` inside `nodeEnv !== 'production'` block

### 2. Cookie & CORS Configuration

- `sameSite` changed from hardcoded `'strict'` to config-driven: `'strict'` in production/staging, `'lax'` in development/test (required for cross-port E2E requests)
- `CORS_ORIGIN` now supports comma-separated values for multi-port setups (dev :5173 + preview :4173)
- `/auth/refresh` rate limit bumped from `max: 5` to `max: 60` to accommodate E2E test volume (each test triggers a refresh)

**Modified:**
- `api/src/auth/cookies.ts` — `COOKIE_SAME_SITE` constant derived from `config.nodeEnv`
- `api/src/auth/cookies.test.ts` — updated `sameSite` assertions
- `api/src/auth/routes.ts` — bumped refresh rate limit to 60/min
- `api/src/auth/routes.test.ts` — updated `SameSite=Lax` header assertions, removed stale eslint-disable directives
- `api/src/config.ts` — `loadCorsOrigin()` supports comma-separated origins, returns `string | string[]`

### 3. Playwright E2E Infrastructure

Per-test auth via `freshTestSignin()` (Node.js `fetch()`) + `context.addCookies()` + `addInitScript` for localStorage/sessionStorage. `globalSetup` seeds test users in DB and writes user JSON files. No `storageState` files needed for auth.

**Created:**
- `web/e2e/global-setup.ts` — health check polling, per-role user seeding via test-signin, user JSON file writing
- `web/e2e/fixtures/e2e-fixtures.ts` — custom Playwright `test` fixture with per-test cookie injection + sessionStorage seeding + `createAuthenticatedContext()` helper for cross-role tests
- `web/e2e/fixtures/test-users.ts` — `TEST_USERS` constants, `readTestUser()`, `TestUserResponse` type
- `web/e2e/.auth/.gitkeep` — directory for user JSON files (gitignored)

**Modified:**
- `web/playwright.config.ts` — 4 projects, `globalSetup`, dual `webServer` array, `baseURL` derived from API hostname
- `web/vite.config.ts` — added `preview` section (host, port, https) matching `server` config
- `.gitignore` — exclude `web/e2e/.auth/*.json`

### 4. E2E Test Migration & Fixture Fixes

Migrated all spec files from mocked auth to real auth. Fixed stale mock fixtures where schemas had evolved (`character` → `characters` array, added `sort_order` to photos, removed `combiner_role`/`combined_form`/`component_characters`, added `continuity_family` to search results). Changed `route.continue()` to `route.fallback()` in catch-all handlers to prevent forwarding to the real API. Added `**/relationships` and `**/catalog/**` catch-all mocks for sub-resource requests.

**Modified:**
- `web/e2e/authenticated-session.spec.ts` — real auth via `e2e-fixtures`
- `web/e2e/protected-routes.spec.ts` — `createAuthenticatedContext` for authenticated test
- `web/e2e/admin-users.spec.ts` — real admin auth, `createAuthenticatedContext` for cross-role tests
- `web/e2e/catalog-browse.spec.ts` — fixed `characters` array, added relationships mock, `route.fallback()`
- `web/e2e/catalog-detail-pages.spec.ts` — fixed item/character mock schemas, added relationships mock, `route.fallback()`, photo test uses real item (`fm-02-margh`)
- `web/e2e/catalog-search.spec.ts` — fixed search result schemas, added relationships mock

### 5. ESLint Configuration

Added `no-unsafe-assignment` and `no-unsafe-member-access` to the API test file override. Removed 9 now-unnecessary `eslint-disable` comments from existing test files.

**Modified:**
- `api/eslint.config.js`
- `api/src/auth/webhooks.test.ts` — removed stale eslint-disable directives

---

## Technical Details

### Authentication Flow

```
globalSetup (runs once)
  → POST /auth/test-signin per role → seeds users in DB
  → Writes user JSON to .auth/{role}-user.json

Per test (via e2e-fixtures.ts context fixture)
  → freshTestSignin(role) via Node.js fetch → gets Set-Cookie header
  → context.addCookies([{ name: 'refresh_token', value, domain, secure: true }])
  → page.addInitScript → sets localStorage + sessionStorage
  → page.goto('/') → AuthProvider.init()
    → sessionFlag.check() → true
    → POST /auth/refresh (real API, cookie sent)
    → 200 → access token in memory, user from sessionStorage
    → Dashboard renders ✓
```

### Security

- Email constrained to `@e2e.test` TLD via AJV schema pattern
- Plugin throws at registration time if `nodeEnv === 'production'` (defense-in-depth)
- Dynamic `import()` in `server.ts` — module never loaded in production
- No audit log entries for test-signin (avoids noise in auth_events)

---

## Validation & Testing

| Module | Tests | Lint | Typecheck | Format | Build |
|--------|-------|------|-----------|--------|-------|
| API    | ✅ 658 passed | ✅ 0 errors | ✅ | ✅ | ✅ |
| Web    | ✅ 592 passed | ✅ 0 errors | ✅ | ✅ | ✅ |
| E2E    | ✅ 46 passed, 1 skipped | — | — | — | — |

---

## Impact Assessment

- **E2E test confidence**: Tests now exercise real JWT verification, real refresh token rotation, and real cookie handling — previously all bypassed by mocks
- **Developer workflow**: `npm run test:e2e` starts both servers automatically via `webServer` array
- **CI compatibility**: Requires a running PostgreSQL instance for the API; all other infrastructure is self-contained
- **No production impact**: Test-signin endpoint is never loaded in production builds

---

## Related Files

See Changes Implemented sections above for complete file lists.

---

## Status

✅ COMPLETE
