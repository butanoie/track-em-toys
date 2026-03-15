# Scenario-Driven Testing

A testing approach where behavior specifications (Gherkin-syntax scenarios) are written as documentation before test code. This creates a traceable link from requirement to running test — without the overhead of BDD tooling.

> **Note:** This project uses plain Playwright and Vitest — not Cucumber or playwright-bdd. See [ADR: Integration Testing Strategy](../decisions/ADR_Integration_Testing_Strategy.md) for the rationale. Gherkin is used here as a *specification language in markdown docs*, not as executable feature files.

## The Pattern

1. **Write scenario docs first** — During the architecture phase (Phase 4), before any test code
2. **Implement specs from scenarios** — Each scenario maps to a test case
3. **Update scenarios at doc gates** — Keep specs in sync with implementation reality

## Scenario Documents

Scenario documents live in `docs/test-scenarios/` and use Gherkin syntax to describe expected behavior.

### Naming Convention

- `E2E_` prefix — End-to-end scenarios (Playwright, against a running app)
- `INT_` prefix — Integration scenarios (Vitest, testing across modules)

### Structure

````markdown
# E2E: Authentication Flow

## Background

Given the web app is running
And the user is on the login page

## Scenarios

### Happy Path: OAuth Sign-In

```gherkin
Scenario: User signs in with Google
  Given the user has a Google account
  When they click the "Sign in with Google" button
  And complete the OAuth flow
  Then they are redirected to their collection dashboard
  And the navigation shows their display name
```

### Guard: Unauthenticated Access

```gherkin
Scenario: Unauthenticated user is redirected to login
  Given the user is not signed in
  When they navigate to the home page
  Then they are redirected to /login
  And the redirect parameter preserves the original URL
```

### Error: Failed Sign-In

```gherkin
Scenario: OAuth provider returns an error
  Given the user attempts to sign in
  When the OAuth provider returns an error response
  Then an error alert is displayed
  And the user remains on the login page
```
````

## Scenario-to-Spec Mapping

Each scenario document maps to one or more spec files. The mapping table in `docs/test-scenarios/README.md` tracks this relationship.

```markdown
| Scenario Document | Spec File | Status |
|---|---|---|
| E2E_AUTHENTICATION.md | web/e2e/login-page.spec.ts | ✅ Implemented |
| E2E_PROTECTED_ROUTES.md | web/e2e/protected-routes.spec.ts | ✅ Implemented |
| INT_TOKEN_REFRESH.md | api/src/auth/routes.test.ts | ✅ Implemented |
```

## Gherkin in Test Code

### Test Titles (Given/When/Then Shorthand)

For new tests, use Given/When/Then shorthand in test titles. This makes test intent clear without needing to read the implementation.

```typescript
// Recommended for new tests
test('Given unauthenticated user, When navigating to /, Then redirected to /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})
```

### Existing Tests

Existing tests use descriptive titles (e.g., `'unauthenticated user redirected to /login'`). These do not need to be refactored — the Given/When/Then convention applies to new tests going forward.

### JSDoc for Complex Scenarios

For tests covering multi-step flows, include the full Gherkin scenario as JSDoc:

````typescript
/**
 * ```gherkin
 * Scenario: Authenticated user accesses dashboard
 *   Given the user has a valid session
 *   When they navigate to the home page
 *   Then the collection dashboard is displayed
 *   And the page title shows "Your Collection"
 * ```
 */
test('Given valid session, When navigating to /, Then dashboard is displayed', async ({ page }) => {
  await setupAuthenticated(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /your collection/i })).toBeVisible()
})
````

## When to Write Scenario Docs

### Required (Feature Development)

During Phase 4 (Architecture Design) of non-trivial features, write scenario documents covering:
- **Happy path** — the primary success flow
- **Error cases** — what happens when things go wrong
- **Edge cases** — boundary conditions, empty states, concurrent access

These are reviewed as part of the architecture and updated at both documentation gates.

### Not Required

- Bug fixes — the test that reproduces the bug is sufficient
- Trivial changes — a config tweak doesn't need a scenario doc
- Unit tests for pure functions — these are self-documenting via input/output

## API Integration Test Scenarios

For API tests (Vitest + `fastify.inject()`), the same pattern applies but scenarios focus on request/response behavior:

````markdown
### Token Refresh: Valid Token

```gherkin
Scenario: Refresh with a valid token
  Given the user has a valid refresh token cookie
  When they POST to /auth/refresh
  Then a new access token is returned
  And a new refresh token cookie is set
  And the old refresh token is revoked
```

### Token Refresh: Reuse Detection

```gherkin
Scenario: Reuse of a previously rotated token
  Given the user presents a refresh token that was already rotated
  When they POST to /auth/refresh
  Then all user refresh tokens are revoked
  And a 401 response is returned
```
````

## Why This Matters

- **Specifications before implementation** — Forces design thinking before coding
- **Traceable requirements** — Every test traces back to a documented scenario
- **Living documentation** — Scenario docs are updated at doc gate checkpoints, staying in sync
- **Readable tests** — Given/When/Then titles make test intent immediately clear
- **No BDD tooling overhead** — Plain Playwright and Vitest, no Cucumber step definitions
