# Test Scenarios

Gherkin scenario documents for the project's test suites. These are written during the architecture phase (Phase 4) before test code is implemented.

See [TESTING_SCENARIOS.md](../guides/TESTING_SCENARIOS.md) for the scenario-driven testing philosophy.

## Naming Convention

- `E2E_` prefix — End-to-end scenarios (Playwright against the running web app)
- `INT_` prefix — Integration test scenarios (Vitest, multi-module or API tests)

## Scenario-to-Spec Mapping

<!-- Update this table as you add scenario documents and implement specs -->

| Scenario Document                                  | Spec File                                                                      | Status         |
| -------------------------------------------------- | ------------------------------------------------------------------------------ | -------------- |
| [E2E_AUTHENTICATION.md](E2E_AUTHENTICATION.md)     | `web/e2e/login-page.spec.ts`                                                   | ✅ Implemented |
| [E2E_PROTECTED_ROUTES.md](E2E_PROTECTED_ROUTES.md) | `web/e2e/protected-routes.spec.ts`                                             | ✅ Implemented |
| [E2E_SESSION.md](E2E_SESSION.md)                   | `web/e2e/authenticated-session.spec.ts`, `web/e2e/session-persistence.spec.ts` | ✅ Implemented |
| [E2E_REAL_AUTH.md](E2E_REAL_AUTH.md)               | `api/src/auth/test-signin.test.ts`, `web/e2e/global-setup.ts`, all E2E specs   | ✅ Implemented |
| [INT_SEED_INGESTION.md](INT_SEED_INGESTION.md)     | `api/src/db/seed-integration.test.ts`                                          | ✅ Implemented |

### Planned Scenarios (ML-Accelerated Roadmap)

| Scenario Document                                            | Phase                                                                                                                                                         | Status                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [INT_CATALOG_API.md](INT_CATALOG_API.md)                     | `api/src/catalog/*/routes.test.ts`                                                                                                                            | ✅ Implemented                          |
| [INT_ENTITY_RELATIONSHIPS.md](INT_ENTITY_RELATIONSHIPS.md)   | `api/src/catalog/relationships/routes.test.ts`, `api/src/db/seed-integration.test.ts`, `web/src/catalog/components/__tests__/CharacterRelationships.test.tsx` | Scenarios written                       |
| [INT_USER_ROLES.md](INT_USER_ROLES.md)                       | `api/src/auth/role.test.ts`, `api/src/admin/routes.test.ts`                                                                                                   | ✅ Implemented                          |
| [E2E_CATALOG_MANUFACTURERS.md](E2E_CATALOG_MANUFACTURERS.md) | `web/e2e/catalog-manufacturers.spec.ts`                                                                                                                       | Scenarios written                       |
| [E2E_CATALOG_SEARCH.md](E2E_CATALOG_SEARCH.md)               | `web/e2e/catalog-search.spec.ts`                                                                                                                              | ✅ Implemented                          |
| [E2E_CATALOG_DETAIL_PAGES.md](E2E_CATALOG_DETAIL_PAGES.md)   | `web/e2e/catalog-detail-pages.spec.ts`                                                                                                                        | Scenarios written                       |
| E2E_CATALOG_BROWSING.md                                      | 1.7 Web Catalog UI                                                                                                                                            | Not started                             |
| [INT_PHOTO_MANAGEMENT.md](INT_PHOTO_MANAGEMENT.md)           | `api/src/catalog/photos/routes.test.ts`                                                                                                                       | Scenarios written                       |
| E2E_PHOTO_UPLOAD.md                                          | 1.9 Photo Management (curator UI)                                                                                                                             | Not started                             |
| [E2E_ADMIN_DASHBOARD.md](E2E_ADMIN_DASHBOARD.md)             | `web/src/admin/__tests__/*.test.tsx`, `web/e2e/admin-users.spec.ts`                                                                                           | ✅ Implemented (real auth, mocked data) |
| [INT_ML_EXPORT.md](INT_ML_EXPORT.md)                         | `api/src/catalog/ml-export/routes.test.ts`                                                                                                                    | ✅ Implemented                          |
| E2E_GDPR_DELETION.md                                         | 1.12 Account Deletion                                                                                                                                         | Not started                             |
| [UNIT_ML_TRAINING_DATA.md](UNIT_ML_TRAINING_DATA.md)         | `ml/src/*.test.ts`                                                                                                                                            | ✅ Implemented                          |
| [INT_COLLECTION_API.md](INT_COLLECTION_API.md)               | `api/src/collection/routes.test.ts`                                                                                                                           | ✅ Implemented                          |
| [E2E_COLLECTION_MANAGEMENT.md](E2E_COLLECTION_MANAGEMENT.md) | `web/e2e/collection.spec.ts`                                                                                                                                  | ✅ Implemented                          |
| [E2E_COLLECTION_EXPORT_IMPORT.md](E2E_COLLECTION_EXPORT_IMPORT.md) | `web/e2e/collection-export-import.spec.ts`                                                                                                              | ✅ Implemented                          |
| [INT_Seed_Sync.md](INT_Seed_Sync.md)                         | `api/db/seed/sync.test.ts`                                                                                                                                    | Scenarios written                       |

## Creating a New Scenario

1. Create a file in this directory with the appropriate prefix (e.g., `E2E_COLLECTION_MANAGEMENT.md`)
2. Write Gherkin scenarios covering happy path, error cases, and edge cases
3. Add an entry to the mapping table above
4. Get approval during the architecture phase before implementing tests
5. When writing tests, use Given/When/Then shorthand as test titles
