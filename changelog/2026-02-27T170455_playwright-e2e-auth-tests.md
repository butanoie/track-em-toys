# Playwright E2E Test Suite & Auth Test Hardening

**Date:** 2026-02-27
**Time:** 17:04:55 PST
**Type:** Infrastructure / Testing
**Phase:** 1.3 — Web SPA Authentication

## Summary

Added a Playwright E2E test suite for browser-level testing of the auth flow against the Vite preview server (HTTPS, self-signed certs). Extended vitest unit test coverage with new suites for auth refresh scheduling, API client refresh mutex, and the authenticated route guard. Strengthened existing AuthProvider tests with fail-closed and session-expiry assertions.

---

## Changes Implemented

### 1. Playwright E2E Infrastructure

Set up `@playwright/test` as a dev dependency with a dedicated config, TypeScript project reference, and ESLint rule block. Vitest is configured to exclude the `e2e/` directory so the two runners don't overlap.

**Created:**
- `web/playwright.config.ts` — Chromium project, HTTPS base URL (`https://localhost:4173`), `ignoreHTTPSErrors`, Vite preview web server
- `web/tsconfig.e2e.json` — isolated TS project for E2E files (ES2022, strict, noEmit)

**Modified:**
- `web/package.json` — added `@playwright/test` dev dep, `test:e2e` and `test:e2e:ui` scripts
- `web/package-lock.json` — lockfile updated with playwright packages
- `web/tsconfig.json` — added `tsconfig.e2e.json` project reference
- `web/vitest.config.ts` — added `e2e/**` to `exclude` list
- `web/eslint.config.js` — added `playwright.config.ts` to `allowDefaultProject`, added relaxed rule block for `e2e/**/*.ts`
- `.gitignore` — added `playwright-report/` and `test-results/`

### 2. E2E Test Specs

Four Playwright spec files covering the core auth-gated user journey, plus a shared fixture module for mock auth setup.

**Created:**
- `web/e2e/fixtures/auth.ts` — `setupAuthenticated()` helper (injects localStorage session flag, sessionStorage user, mocks `/auth/refresh` route), `mockRefreshFailure()` for 401 scenarios
- `web/e2e/login-page.spec.ts` — login page renders heading + Apple sign-in button; unauthenticated `/` redirects to `/login`
- `web/e2e/protected-routes.spec.ts` — unauthenticated redirect, redirect param preserved, authenticated user accesses dashboard
- `web/e2e/authenticated-session.spec.ts` — dashboard renders collection heading + user name, sign-out redirects to `/login`, sign-out clears localStorage session flag
- `web/e2e/session-persistence.spec.ts` — session survives page reload (refresh re-called), 401 refresh expires session and redirects to login

### 3. New Vitest Unit Test Suites

**Created:**
- `web/src/auth/__tests__/auth-refresh-scheduling.test.tsx` — AuthProvider schedules `setTimeout` for proactive token refresh based on JWT `exp`, clears timer on logout
- `web/src/lib/__tests__/api-client-refresh-mutex.test.ts` — refresh mutex serializes concurrent 401 retries so only one `/auth/refresh` call is made
- `web/src/routes/__tests__/_authenticated.test.tsx` — authenticated layout guard: loading spinner while `isLoading`, outlet when authenticated, redirect to `/login` when unauthenticated, no redirect while loading

### 4. AuthProvider Test Additions

**Modified:**
- `web/src/auth/__tests__/AuthProvider.test.tsx` — added two new test cases:
  - *fail-closed refresh*: when refresh returns 401, cached sessionStorage user is NOT restored (no stale session)
  - *sessionexpired clears queryClient*: `auth:sessionexpired` event triggers the injected `queryClientClear` callback

### 5. Settings

**Modified:**
- `.claude/settings.json` — disabled `github@claude-plugins-official` plugin

---

## Technical Details

### Playwright Configuration

```typescript
// HTTPS against Vite preview (self-signed certs from mkcert)
const baseURL = 'https://localhost:4173'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL, ignoreHTTPSErrors: true },
  webServer: {
    command: 'npm run preview',
    url: baseURL,
    ignoreHTTPSErrors: true,
  },
})
```

The preview server reuses the HTTPS cert/key configured in `vite.config.ts`. `ignoreHTTPSErrors` is required because mkcert certificates are not trusted by Playwright's bundled Chromium.

### E2E Auth Fixture Pattern

Tests inject auth state via `page.addInitScript()` (runs before any app JS), then intercept the `/auth/refresh` API call with `page.route()` to return a mock access token. This avoids needing a running API server.

### TypeScript Project References

```
tsconfig.json
├── tsconfig.app.json   (src/ — React app)
├── tsconfig.node.json  (vite.config.ts, vitest.config.ts)
└── tsconfig.e2e.json   (e2e/ — Playwright specs)
```

Each project compiles independently with `tsc -b`. The E2E project uses `noEmit: true` (type-check only) and does not depend on the app project.

---

## Validation & Testing

### New Test Counts
- **Playwright E2E specs:** 4 files, 10 test cases
- **Vitest unit tests:** 3 new files + 2 new cases in existing file
- **Total vitest tests:** increased from 72 to ~85+

### Net File Impact
- 18 files changed, +798 lines

---

## Impact Assessment

- **Test confidence:** E2E tests validate the full auth flow in a real browser — login redirect, authenticated dashboard, sign-out, and session persistence/expiry — catching integration issues that unit tests miss.
- **Refresh mutex coverage:** The new mutex test confirms that concurrent 401s coalesce into a single refresh call, preventing token rotation races.
- **Fail-closed verification:** The new AuthProvider test explicitly asserts that a failed refresh does not fall back to a cached user, enforcing the security invariant.
- **CI readiness:** `npm run test:e2e` can be added to CI once Playwright browsers are installed (`npx playwright install chromium`).

---

## Related Files

| File | Action |
|---|---|
| `web/playwright.config.ts` | Created |
| `web/tsconfig.e2e.json` | Created |
| `web/e2e/fixtures/auth.ts` | Created |
| `web/e2e/login-page.spec.ts` | Created |
| `web/e2e/protected-routes.spec.ts` | Created |
| `web/e2e/authenticated-session.spec.ts` | Created |
| `web/e2e/session-persistence.spec.ts` | Created |
| `web/src/auth/__tests__/auth-refresh-scheduling.test.tsx` | Created |
| `web/src/lib/__tests__/api-client-refresh-mutex.test.ts` | Created |
| `web/src/routes/__tests__/_authenticated.test.tsx` | Created |
| `web/src/auth/__tests__/AuthProvider.test.tsx` | Modified |
| `web/package.json` | Modified |
| `web/package-lock.json` | Modified |
| `web/tsconfig.json` | Modified |
| `web/vitest.config.ts` | Modified |
| `web/eslint.config.js` | Modified |
| `.gitignore` | Modified |
| `.claude/settings.json` | Modified |

---

## Status

✅ COMPLETE
