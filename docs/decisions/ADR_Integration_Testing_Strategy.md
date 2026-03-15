# ADR: Integration Testing Strategy

**Date:** 2026-02-26
**Status:** Accepted and implemented
**Decision:** Plain Playwright (`@playwright/test`), no BDD/Gherkin tooling

---

## Context

The web SPA needs E2E/integration testing alongside existing Vitest unit tests. The key question was whether to use BDD/Gherkin tooling (Cucumber, playwright-bdd) or plain Playwright.

BDD/Gherkin was designed to bridge communication between non-technical stakeholders and developers — product owners write `.feature` files in natural language, developers implement step definitions. In practice, this collaboration rarely materializes on small teams.

### Factors Considered

| Factor | Assessment |
|--------|-----------|
| Team size | Small/solo. No non-technical stakeholders writing feature files. |
| Maintenance cost | BDD requires updating both the feature file and step definition for every UI change. |
| AI agent authoring | A Claude Code subagent must generate 2–3 files per scenario with BDD vs. 1 with plain Playwright. |
| Debugging | BDD failures trace through Gherkin → step definition → Playwright action. Plain Playwright fails at the exact line. |
| TypeScript support | Cucumber.js step definitions use string/regex matching, losing type-checking. |

### Alternatives Evaluated

| Framework | Verdict |
|-----------|---------|
| **@playwright/test** (native) | **Chosen.** Full TypeScript, parallel execution, trace viewer, single-file tests. |
| **playwright-bdd** | Best BDD+Playwright combo, but adds step definition overhead without proportional benefit. |
| **@cucumber/cucumber** | Canonical Cucumber.js. Requires separate Playwright adapter. Most complex setup. |
| **CodeceptJS** | Higher-level DSL. Adds thick abstraction. Not recommended. |
| **@vitest/browser** | Component-level browser testing only — NOT equivalent to E2E. Not a Playwright replacement. |

---

## Decision

Use **plain Playwright** (`@playwright/test`) as a standalone test runner, separate from Vitest.

- Vitest: components, hooks, utilities, API clients (jsdom, fast)
- Playwright: full user flows against a running dev server (real browser, slower)
- Use `test.step()` for logical grouping within tests (equivalent readability to BDD)
- Use the Page Object Model pattern to centralize selectors and actions

> **Note:** Gherkin syntax is still used as a *specification language* in `docs/test-scenarios/` markdown files. This provides the documentation benefit of BDD without the tooling overhead. See `docs/guides/TESTING_SCENARIOS.md`.

---

## Target Folder Structure

```
web/e2e/
  playwright.config.ts
  tsconfig.json               # Separate from app — avoids polluting type environment
  fixtures/
    auth.ts                   # Auth seeding fixture
  pages/                      # Page Object Models (not yet created)
    login.page.ts
    collection.page.ts
  tests/                      # Organized by feature area (not yet created)
    auth/
    collection/
    navigation/
  helpers/
    api-seed.ts               # Seed test data via API calls
```

**Current state:** Specs are flat in `web/e2e/`. The `pages/` and `tests/` subdirectories should be created when the E2E suite grows beyond the initial auth specs.

---

## OAuth Testing Constraint

Both OAuth providers (Google, Apple) use cross-origin flows that Playwright cannot automate through the UI. This is a fundamental constraint of OAuth, not specific to this app.

**Solution:** Seed auth state via the API directly, bypassing the OAuth UI.

- **Implemented:** `web/e2e/fixtures/auth.ts` provides `setupAuthenticated()` for E2E tests
- **Not yet implemented:** A `POST /auth/signin/test` endpoint (guarded by `NODE_ENV=test`) that issues a real JWT session without provider validation — needed for full login flow verification

### What Can Be Tested Without Auth Seeding

- Unauthenticated redirect to `/login`, login page rendering, error states, redirect param preservation

### What Requires Auth Seeding

- Post-auth routing, logout flow, token refresh, authenticated UI state

---

## Consequences

**Positive:**
- Single-file test format — easy for both humans and AI agents to author and debug
- Full TypeScript type safety throughout test code
- Access to Playwright's trace viewer, codegen, and UI mode
- No step definition maintenance burden

**Negative:**
- No forced step reuse (mitigated by Page Object Model pattern)
- Less readable to non-developers (mitigated by `test.step()` grouping and Gherkin scenario docs)

**Trade-off accepted:** We use Gherkin as documentation (in `docs/test-scenarios/`), not as executable feature files. This gives us the specification benefit without the tooling cost.
