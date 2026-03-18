# Gherkin Test Scenarios and E2E Title Updates

**Date:** 2026-03-15
**Time:** 19:37:50 UTC
**Type:** Testing Infrastructure
**Phase:** Phase 5 — Account Linking, Webhooks, and Hardening
**Version:** v0.5.2

## Summary

Created Gherkin scenario documents for all authentication E2E tests and updated E2E test titles to Given/When/Then format. This closes the loop on the tiered testing requirements introduced in the preceding SDLC guides commit by providing concrete test scenarios that map 1:1 to Playwright spec files. Also fixed TanStack Router warnings about test files in the routes directory.

---

## Changes Implemented

### 1. Gherkin Scenario Documents

**Created:**

- `docs/test-scenarios/E2E_AUTHENTICATION.md` — login page rendering scenarios (Apple button, branding, unauthenticated access)
- `docs/test-scenarios/E2E_PROTECTED_ROUTES.md` — route guard scenarios (redirect to login, return-to param preservation, authenticated access)
- `docs/test-scenarios/E2E_SESSION.md` — session lifecycle scenarios (persistence across reload, sign out, expired refresh token handling)

### 2. E2E Test Title Updates

**Modified:**

- `web/e2e/login-page.spec.ts` — test title updated to Given/When/Then format
- `web/e2e/protected-routes.spec.ts` — test titles updated to Given/When/Then format
- `web/e2e/authenticated-session.spec.ts` — titles updated, JSDoc Gherkin scenarios added to sign-out test
- `web/e2e/session-persistence.spec.ts` — titles updated, JSDoc Gherkin scenarios added to reload persistence and expired refresh tests

### 3. Scenario-to-Spec Mapping

**Modified:**

- `docs/test-scenarios/README.md` — populated mapping table linking each scenario document to its corresponding spec file

### 4. TanStack Router Config Fix

**Modified:**

- `web/vite.config.ts` — added `routeFileIgnorePattern` to TanStack Router plugin config to suppress warnings about `src/routes/__tests__/` test files being picked up as route definitions

---

## Technical Details

### Given/When/Then Title Format

Test titles follow the pattern established in `docs/guides/TESTING_SCENARIOS.md`:

```typescript
// Before
test('renders Apple login button', async ({ page }) => {

// After
test('Given the login page, When it renders, Then it shows the Apple sign-in button', async ({ page }) => {
```

### JSDoc Gherkin Annotations

Complex multi-step tests include inline Gherkin scenarios as JSDoc comments for traceability:

```typescript
/**
 * Scenario: Session persists across page reload
 *   Given the user has an authenticated session
 *   When the page is reloaded
 *   Then the user remains authenticated
 *   And the dashboard content is visible
 */
test('Given an authenticated session, When the page reloads, Then the session persists', ...);
```

### Route Ignore Pattern

```typescript
// web/vite.config.ts
TanStackRouterVite({
  routeFileIgnorePattern: '__tests__',
  // ...
});
```

This prevents TanStack Router's file-based routing from treating test files under `src/routes/__tests__/` as route modules.

---

## Impact Assessment

- **Test traceability:** Each E2E test now maps to a documented Gherkin scenario, making it clear what user behavior is being verified
- **Onboarding:** New contributors can read the scenario documents to understand expected behavior without running the tests
- **Build cleanliness:** Suppressing TanStack Router warnings removes noise from the dev server console

## Related Files

**Created (3 files):**

- `docs/test-scenarios/E2E_AUTHENTICATION.md`
- `docs/test-scenarios/E2E_PROTECTED_ROUTES.md`
- `docs/test-scenarios/E2E_SESSION.md`

**Modified (5 files):**

- `docs/test-scenarios/README.md`
- `web/e2e/authenticated-session.spec.ts`
- `web/e2e/login-page.spec.ts`
- `web/e2e/protected-routes.spec.ts`
- `web/e2e/session-persistence.spec.ts`
- `web/vite.config.ts`

## Summary Statistics

- 9 files changed, +174 lines, −12 lines (net +162)
- 3 new scenario documents covering 8+ test scenarios
- 4 E2E spec files updated with Given/When/Then titles

## Status

✅ COMPLETE
