# Test Scenarios

Gherkin scenario documents for the project's test suites. These are written during the architecture phase (Phase 4) before test code is implemented.

See [TESTING_SCENARIOS.md](../guides/TESTING_SCENARIOS.md) for the scenario-driven testing philosophy.

## Naming Convention

- `E2E_` prefix — End-to-end scenarios (Playwright against the running web app)
- `INT_` prefix — Integration test scenarios (Vitest, multi-module or API tests)

## Scenario-to-Spec Mapping

<!-- Update this table as you add scenario documents and implement specs -->

| Scenario Document | Spec File | Status |
|---|---|---|
| [E2E_AUTHENTICATION.md](E2E_AUTHENTICATION.md) | `web/e2e/login-page.spec.ts` | ✅ Implemented |
| [E2E_PROTECTED_ROUTES.md](E2E_PROTECTED_ROUTES.md) | `web/e2e/protected-routes.spec.ts` | ✅ Implemented |
| [E2E_SESSION.md](E2E_SESSION.md) | `web/e2e/authenticated-session.spec.ts`, `web/e2e/session-persistence.spec.ts` | ✅ Implemented |

## Creating a New Scenario

1. Create a file in this directory with the appropriate prefix (e.g., `E2E_COLLECTION_MANAGEMENT.md`)
2. Write Gherkin scenarios covering happy path, error cases, and edge cases
3. Add an entry to the mapping table above
4. Get approval during the architecture phase before implementing tests
5. When writing tests, use Given/When/Then shorthand as test titles
