# Integration Testing Strategy for Track'em Toys

**Date:** 2026-02-26
**Decision:** Playwright (`@playwright/test`) native, no BDD/Gherkin
**Scope:** Web SPA integration/E2E testing; Claude Code integration-tester subagent design

---

## Executive Summary

For the Track'em Toys web SPA, **plain Playwright (`@playwright/test`) is the recommended integration testing approach for 2026**. BDD/Gherkin adds indirection and maintenance overhead without proportional benefit for a developer-driven project. Playwright's native test runner provides full TypeScript support, parallel execution, a built-in trace viewer, and a single-file test format that is well-suited for authoring by a Claude Code subagent.

---

## Is BDD/Gherkin the Best Approach in 2026?

**No — BDD/Gherkin is no longer the default recommendation for most teams.**

BDD/Gherkin was designed to bridge communication between non-technical stakeholders and developers. The premise is that product owners write `.feature` files in natural language, and developers implement step definitions. In practice, this collaboration rarely materialises. Step definitions become a translation layer that developers maintain alone, adding indirection without the intended benefit.

### Arguments Against BDD/Gherkin for This Project

| Factor | Assessment |
|--------|-----------|
| Team size | Small/solo. No non-technical stakeholders writing feature files. |
| Maintenance cost | Every UI change requires updating both the feature file and its step definition. |
| AI agent authoring | A Claude Code subagent must generate both `.feature` files AND step definitions, doubling the output per scenario. |
| Debugging | Failures must be traced through Gherkin → step definition → Playwright action. Plain Playwright fails at the exact line. |
| TypeScript support | Cucumber.js step definitions use string/regex matching, losing TypeScript type-checking. |

### Arguments For BDD/Gherkin

- Human-readable test scenarios that serve as living documentation
- Reusable step definitions reduce duplication across many similar flows
- Useful if a QA team or product owner needs to read test specifications

### Verdict

BDD/Gherkin adds overhead without proportional benefit for a developer-driven project. Playwright's native `test()` blocks with `test.step()` grouping provide equivalent readability with significantly less abstraction.

---

## Framework Comparison

| Framework | Playwright Support | TypeScript | Vitest Integration | Active in 2026 | Notes |
|-----------|-------------------|------------|-------------------|----------------|-------|
| **@playwright/test** (native) | Native | Full | None (separate runner) | v1.58.2 | The standard. Best docs, best tooling. **Recommended.** |
| **playwright-bdd** | Native (wraps @playwright/test) | Partial | None | v8.4.2 | Best BDD+Playwright combo. Uses Playwright's runner under the hood. |
| **@cucumber/cucumber** | Via adapter | Partial | None | v12.7.0 | Canonical Cucumber.js. Requires a separate Playwright adapter. More complex setup. |
| **CodeceptJS** | Via helper | Limited | None | v3.7.6 | Higher-level DSL. Adds thick abstraction on top of Playwright. Not recommended. |
| **@vitest/browser** | Uses Playwright as provider | Full | Native | v4.0.18 | Runs Vitest tests in a real browser. NOT equivalent to E2E testing (see note below). |

### Note on @vitest/browser

Vitest 4.x has a mature browser mode that uses Playwright as a browser provider. This is for **component-level browser testing** (rendering individual components in a real browser), NOT full E2E/integration testing. It does not navigate to URLs, does not test against a running dev server, and does not support multi-page flows. It is a replacement for jsdom — not a replacement for Playwright's test runner.

---

## Playwright Without BDD — Trade-offs

### Advantages of Plain Playwright

1. **Single layer of abstraction.** The test file directly contains assertions and browser interactions. No step definitions to maintain.
2. **Full TypeScript support.** `page`, `expect`, and `test` are fully typed with auto-complete for selectors, locators, and assertions.
3. **Built-in fixtures.** `test.use({ storageState })` for auth state, `test.describe.configure({ mode: 'serial' })` for ordered tests, `test.step()` for logical grouping within a test.
4. **Parallel by default.** Tests run in parallel across workers. BDD frameworks often run serially.
5. **Trace viewer, codegen, UI mode.** `npx playwright codegen` generates test code by recording browser interactions. `npx playwright show-trace` replays failures frame-by-frame. These do not work with BDD wrappers.
6. **AI agent friendly.** A Claude Code subagent writes one file per test scenario with no coordination between multiple files.

### Disadvantages (and Mitigations)

| Disadvantage | Mitigation |
|---|---|
| Less "readable" to non-developers | Use `test.step('description', ...)` for logical grouping within tests |
| No forced step reuse | Use the Page Object Model pattern to centralise selectors and actions |
| No first-class tagging by business domain | Use `test.describe('auth')` blocks and file-based organisation |

---

## Integration with Vitest (Existing Test Suite)

Playwright tests and Vitest tests are **separate test suites with separate runners**. They complement each other.

| Aspect | Vitest (existing) | @playwright/test (new) |
|--------|-------------------|----------------------|
| Runner | `vitest` CLI | `playwright test` CLI |
| Config | `web/vitest.config.ts` | `web/e2e/playwright.config.ts` |
| Environment | jsdom (simulated browser) | Real Chromium/Firefox/WebKit |
| Speed | Fast (no browser) | Slower (launches browser) |
| What it tests | Components, hooks, utilities, API clients | Full user flows against a running dev server |
| npm script | `npm test` | `npm run test:e2e` |

### Recommended npm Scripts to Add

```json
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:headed": "playwright test --headed",
  "test:e2e:codegen": "playwright codegen http://localhost:5173"
}
```

---

## Recommended Folder Structure

```
web/
  e2e/                              # Top-level E2E directory (separate from src/)
    playwright.config.ts            # Playwright configuration
    tsconfig.json                   # Separate tsconfig for E2E tests
    fixtures/
      auth.ts                       # Authentication fixture (login helper, storageState)
      test-base.ts                  # Extended test with custom fixtures
    pages/                          # Page Object Models
      login.page.ts
      collection.page.ts
      toy-detail.page.ts
    tests/
      auth/
        login.spec.ts
        logout.spec.ts
        token-refresh.spec.ts
      collection/
        add-toy.spec.ts
        search.spec.ts
        browse.spec.ts
      navigation/
        routing.spec.ts
        deep-links.spec.ts
    helpers/
      api-seed.ts                   # Seed test data via API calls
      wait-for-api.ts               # Wait for backend readiness
    .auth/                          # gitignored: saved auth state
      user.json
  src/                              # Existing source (unchanged)
    auth/__tests__/                 # Existing Vitest unit tests (unchanged)
    lib/__tests__/
    components/__tests__/
  vitest.config.ts                  # Existing Vitest config (unchanged)
  package.json
```

**Why `web/e2e/` (not `web/src/__e2e__/` or a root-level `e2e/`):**

- E2E tests import from Playwright, not from the app source. A separate `tsconfig.json` under `web/e2e/` avoids polluting the app's type environment with Playwright globals.
- They live inside `web/` because they specifically test the web SPA, not the API or iOS app.
- `web/vitest.config.ts` discovers tests only within `src/` by default, so no exclusion is needed.

**Why Page Object Models:**

- POMs encapsulate selectors and common actions for each page.
- When the UI changes, only the POM file needs updating — not every test that touches that page.
- This is the Playwright team's own recommended pattern.

---

## Design for the Integration-Tester Claude Code Subagent

Plain Playwright `.spec.ts` files are significantly better than BDD feature files for a Claude Code subagent.

| Factor | Plain Playwright | BDD/Gherkin |
|--------|-----------------|-------------|
| Files per test | 1 (the `.spec.ts`) | 2–3 (`.feature` + step defs + POM) |
| Context window efficiency | Agent writes one coherent file | Agent must coordinate across multiple files with string-matched bindings |
| Error diagnosis | Stack trace points to exact line in spec | Trace routes through Gherkin parser → step matcher → actual code |
| Type safety | Full TypeScript throughout | Step definitions use string matching, losing type information |
| Validation loop | Agent runs `npx playwright test path/to/spec.ts` and gets pass/fail | Agent must run a generation step first (playwright-bdd), then run tests |
| Self-correction | Agent reads failure, edits same file, reruns | Agent must determine whether the failure is in the feature file, step def, or POM |

### Recommended Agent Workflow

1. Read the Page Object Models in `web/e2e/pages/` to understand available selectors and actions.
2. Write a `.spec.ts` file in the appropriate `web/e2e/tests/` subdirectory.
3. Run `cd web && npx playwright test e2e/tests/path/to/new-test.spec.ts --reporter=line` to validate.
4. If the test fails, read the error output, edit the spec, and rerun.
5. Run the full suite to check for regressions: `npx playwright test --reporter=line`.

### Locator Best Practices for Agent-Authored Tests

Prefer accessibility-first locators in this order:

1. `page.getByRole('button', { name: 'Sign in' })` — most resilient, tests accessibility too
2. `page.getByTestId('login-form')` — stable, intent-explicit `data-testid` attributes
3. `page.getByText('Welcome back')` — for text content assertions
4. `page.getByLabel('Email')` — for form fields
5. CSS selectors (e.g., `.login-button`) — last resort only

### Test Authoring Conventions

- Use `test.step('description', async () => { ... })` for logical grouping within a test
- Use Playwright's auto-retrying assertions (`expect(locator).toBeVisible()`) not manual `waitForSelector`
- Keep each `.spec.ts` focused on one user flow or feature area
- Run the test at least once before reporting completion

---

## Package Installation

```bash
# From the web/ directory
npm install -D @playwright/test
npx playwright install chromium
```

Playwright v1.58.2 is the latest stable release as of 2026-02-26. The `@playwright/test` package bundles the test runner and `expect` assertions — no additional assertion library is needed.

### Version Reference (as of 2026-02-26)

| Package | Latest Version |
|---------|---------------|
| @playwright/test | 1.58.2 |
| playwright-bdd | 8.4.2 (BDD fallback option) |
| @cucumber/cucumber | 12.7.0 |
| @vitest/browser | 4.0.18 |

---

## Testing Authentication Flows — The OAuth Constraint

### The Problem

Both login methods in the current web SPA use third-party OAuth flows that Playwright **cannot automate through the UI**:

- **Google**: The sign-in button renders in a cross-origin sandboxed iframe. Playwright cannot interact with iframes controlled by Google.
- **Apple**: Sign-in redirects to `appleid.apple.com`, which is entirely outside the app.

The literal flow of "click Sign in with Google → enter credentials → land on home page" cannot be tested end-to-end with Playwright. This is a fundamental constraint of OAuth, not something specific to this app's implementation.

### What Can Be Tested Without Extra Infrastructure

The following can be tested with Playwright today, without any auth seeding:

| Test | What it verifies |
|------|-----------------|
| Unauthenticated users hitting `/` are redirected to `/login` | Protected route guard works |
| Login page renders Google button and Apple button | UI renders correctly |
| Apple button shows "Redirecting to Apple…" while `isAppleLoading` is true | Loading state works |
| Error alert appears when sign-in fails | Error handling works |
| `redirect` search param is preserved in the login URL | Redirect logic works |

### What Requires an Auth-Seeded Session

The following require establishing an authenticated state before the test begins:

| Test | What it verifies |
|------|-----------------|
| Authenticated user lands on the home page | Post-auth routing works |
| Protected route shows loading spinner while `isLoading` is true | Loading state works |
| Logged-in user can log out and is redirected to `/login` | Logout flow works |
| Token refresh keeps the session alive | Refresh cycle works |

### The Auth Seeding Pattern

The standard Playwright approach for OAuth apps is to **seed auth state via the API directly** (bypassing the OAuth UI), save the session as `storageState`, and start tests from an authenticated state.

Two options for seeding:

**Option 1 — Test-only API endpoint (recommended)**

Add a `POST /auth/signin/test` endpoint to the API, guarded by `NODE_ENV=test`, that issues a real JWT session without OAuth provider validation. The Playwright fixture calls this endpoint, saves the resulting cookies/tokens as `storageState`, and all subsequent tests start as an authenticated user.

```
// web/e2e/fixtures/auth.ts (illustrative)
export async function seedAuthState(request: APIRequestContext): Promise<void> {
  const response = await request.post('/auth/signin/test', {
    data: { email: 'test@example.com' },
  })
  // Save state to web/e2e/.auth/user.json
}
```

**Option 2 — Real OAuth test credentials**

Use a Google/Apple service account with long-lived credentials. More complex to set up and maintain, and may violate provider terms of service for automation.

### Recommended Implementation Order

1. **Now**: Write the pre-auth Playwright tests (redirect behaviour, login page rendering). No new infrastructure needed.
2. **Before end-to-end auth testing**: Add the `POST /auth/signin/test` test-only endpoint to the API. This unblocks full login flow verification.
3. **After auth seeding is in place**: Write the post-auth tests (home page, logout, token refresh).

---

## Recommendation Summary

| Decision | Recommendation |
|----------|---------------|
| BDD vs plain Playwright | **Plain Playwright** |
| Test runner | **@playwright/test** (standalone, separate from Vitest) |
| Folder location | **`web/e2e/`** with its own `tsconfig.json` |
| Page Object Models | **Yes** — one POM per page/major feature area |
| Agent test format | **`.spec.ts` files** |
| BDD fallback (if required) | **playwright-bdd** v8.x (wraps Playwright's runner, preserves fixtures and trace viewer) |
| OAuth login flow testing | **Cannot automate OAuth UI** — requires `POST /auth/signin/test` API endpoint (Option 1) |
| Auth seeding approach | **Test-only API endpoint** guarded by `NODE_ENV=test` |
| Start integration testing now? | **Yes** — pre-auth tests today; full auth tests after seeding endpoint is added |
