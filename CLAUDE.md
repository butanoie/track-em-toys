# CLAUDE.md — Track'em Toys Project

## NEVER EVER DO

These rules are ABSOLUTE:

### NEVER Publish Sensitive Data
- NEVER publish passwords, API keys, tokens to git/npm/docker
- Before ANY commit: verify no secrets included

### NEVER Commit .env Files
- NEVER commit `.env` to git
- ALWAYS verify `.env` is in `.gitignore`

### NEVER Modify these ios project files
- NEVER modify ios/**/*.pbxproj
- NEVER modify ios/**/*.xcworkspace

### NEVER Force-Add Gitignored Files
- NEVER use `git add -f` or `--force` to commit files that are in `.gitignore`
- If a gitignored file needs to be tracked, ask the user to update `.gitignore` first

### NEVER App Store and DB migrations
- NEVER Submit to App Store (requires human)
- NEVER Modify provisioning profiles or entitlements GUIs
- NEVER Run database migrations on production without explicit instruction

## Project Overview
Toy collection catalog & pricing app for serious collectors.
Monorepo with four components: ios/, api/, web/, ml/
Plus shared Swift Package: packages/TrackEmToysDataKit/

## IDE Setup
- VS Code: Primary IDE for api/, web/, docs/, ml/ (workspace: track-em-toys.code-workspace)
- Xcode: iOS-only (ios/ and packages/TrackEmToysDataKit/ when created)
- Claude Code: Runs in VS Code integrated terminal or standalone

## Architecture
- iOS/macOS: Swift 6, SwiftUI, SwiftData + CloudKit sync, MVVM w/ @Observable
- Web: React 19 + TypeScript, Shadcn/ui, Tailwind CSS 4, TanStack Query
- Backend: Node.js 22 LTS, Fastify 5, TypeScript, PostgreSQL 17, ES256 JWT
- ML: Core ML + Create ML, transfer learning image classification (≤ 10 MB models)

## Data Architecture
- PostgreSQL: Shared catalog (no user_id) + private collections (user_id + RLS)
- SwiftData: Local-first with CloudKit sync, single-user architecture
- RLS uses (SELECT current_app_user_id()) subselect wrapper for initPlan caching
- JWT: ES256 asymmetric signing, JWKS discovery, SHA-256 refresh token hashing
- RLS policies: always use the (SELECT ...) wrapper, never bare function calls
- Catalog tables use UUID primary keys with a unique `slug` column for stable cross-references and URL-friendly API routes
- Seed data (`api/db/seed/`) uses slug-based FK references — never integer IDs — to avoid fragile positional coupling
- GDPR user deletion uses tombstone pattern: scrub PII (email, display_name, avatar_url), set `deleted_at`, keep the row so all FKs remain intact. NEVER use `ON DELETE CASCADE` or `ON DELETE SET NULL` on user FKs. App checks `deleted_at IS NOT NULL` to display "Deleted user".

## Refactoring Safety
**CRITICAL: Before removing or replacing any code during refactoring, check its git history to understand WHY it exists.** Code that looks redundant may be a deliberate bug fix.
- Run `git log -p --follow <file>` or `git blame` before deleting non-trivial logic
- **Check if the code was added as a bug fix** — look at commit messages for "fix:", "bugfix", or issue references
- **If replacing logic, verify behavioral equivalence** — a replacement that handles the happy path but drops an edge-case guard introduces a regression
- **Do not write comments claiming behavior that isn't implemented** — e.g., never claim state "resets automatically" unless the mechanism actually exists in the code
- See module-specific CLAUDE.md files for framework-specific refactoring rules

## Code Conventions
- Swift: async/await always, SwiftUI over UIKit, SF Symbols for icons
- TypeScript: strict mode, no 'any', Fastify schema validation
- React: functional components, TanStack Query for server state, Zod for schemas
- All: conventional commits with scope (ios, web, api, ml, shared, infra)

## Build Commands
See each module's CLAUDE.md for build, test, lint, and typecheck commands:
`api/CLAUDE.md`, `web/CLAUDE.md`, `ios/CLAUDE.md`

## Security Guidelines for Documentation

When documenting configuration and setup:

### DO Document ###
- How to obtain tokens (links to official sources)
- `.env.example` file locations and structure
- Configuration file format and options
- Error messages and troubleshooting
- Security best practices

### NEVER Document ###
- Actual token values
- API keys or secrets
- Hardcoded credentials
- Private authentication details

## Shell Scripts
- Always quote variables: `"$VAR"` not `$VAR` — unquoted variables cause word splitting and globbing bugs
- Never use `chmod 777` or `chmod a+w` — use minimum permissions needed (e.g. `chmod 755` for executables)
- Use `set -euo pipefail` at the top of scripts to fail fast on errors

## Documentation Accuracy
When editing `.md` files:
- Verify file paths referenced actually exist in the repo
- Verify code examples have correct syntax
- Never include actual secrets — only references to `.env.example`

## Testing Requirements

Tests are mandatory, not optional — no code change is complete without corresponding tests. Use the appropriate test layer for what you're testing:

### Unit Tests (always required)
- **What:** Pure functions, utilities, type guards, schema validation, business logic
- **Where:** Co-located `*.test.ts` files (API: `src/**/*.test.ts`, Web: `src/**/*.test.ts`)
- **Runner:** Vitest
- Cover primary functionality, edge cases, and error paths
- For updated code: update existing tests AND add new tests for new behavior

### Integration Tests (required for API routes and DB queries)
- **What:** API route handlers, database queries, middleware chains, multi-module interactions
- **Where:** API: `src/**/*.test.ts` using `fastify.inject()`
- **Runner:** Vitest
- Cover happy path, auth failure (401/403), validation failure (400), and key error paths
- See `api/CLAUDE.md` "Integration test coverage" checklist for required scenarios

### E2E Tests (required for user-facing flows)
- **What:** Full user flows through the web UI — login, navigation, forms, authenticated actions
- **Where:** `web/e2e/*.spec.ts`
- **Runner:** Playwright
- Use accessibility-first locators (`getByRole`, `getByLabel`, `getByTestId`)
- Use Given/When/Then format for test titles (see `docs/guides/TESTING_SCENARIOS.md`)
- Only required when the feature adds or changes user-facing behavior

### Test Scenarios (required for non-trivial features)
- Write Gherkin scenario documents in `docs/test-scenarios/` during architecture (Phase 4)
- Scenarios are written before test code and map 1:1 to test cases
- Update `docs/test-scenarios/README.md` mapping table when adding new scenarios
- See `docs/guides/TESTING_SCENARIOS.md` for format and conventions

### General Rules
- Run tests after writing them to verify they pass before considering the task done
- A feature touching API routes needs both unit tests AND integration tests
- A feature touching user-facing web flows needs unit tests AND E2E tests
- Bug fixes need a regression test at the appropriate layer

## Commit Standards
- NEVER commit unless the user explicitly says to commit — creating files, fixing bugs, or writing changelogs does NOT imply committing
- Completing a task (e.g. "create a changelog", "add ESLint") is NOT permission to commit; wait for explicit instruction
- Write clear, descriptive commit messages
- Follow conventional commits format
- Reference issue numbers when applicable
- Keep commits atomic and focused

## Feature Development Gates

These gates apply to any non-trivial feature work, whether using `/feature-dev` or working ad-hoc. Trivial changes (bug fixes, config tweaks, small additions) do not require them.

### Verification Gate

**CRITICAL: Run `/run-checks` before considering any implementation complete.** Do NOT skip this step. Do NOT rely on "it looks right" — run the automated checks. This catches issues that manual review misses (type errors, lint violations, failing tests).

- After implementation: run `/run-checks`
- After review fixes: run `/run-checks` again
- If checks fail, fix the issues and re-run — do not proceed with failures

### Post-Architecture Documentation Gate

**CRITICAL: After the architecture/plan is approved by the user, update documentation BEFORE writing implementation code.** Do NOT skip this step. Treat missing doc updates as a blocker.

See [`docs/guides/DOC_GATE_REFERENCE.md`](docs/guides/DOC_GATE_REFERENCE.md) for the full checklist and common mistakes.

### Post-Review Documentation Gate

**CRITICAL: After review issues have been fixed and checks pass, update documentation to reflect implementation reality BEFORE writing the summary.**

See [`docs/guides/DOC_GATE_REFERENCE.md`](docs/guides/DOC_GATE_REFERENCE.md) for the full checklist and common mistakes.

## Changelog

Create a changelog entry for:
- **Phase Completions** - When a major phase of work is completed
- **Infrastructure Changes** - New tools, frameworks, or development setup
- **Feature Additions** - New functionality or components
- **Breaking Changes** - Changes that affect existing functionality
- **Configuration Updates** - Major changes to build, lint, or test configuration
- **Documentation Standards** - New standards or enforcement mechanisms

### Changelog Format

**Location:** `changelog/` directory at project root. Filename: `YYYY-MM-DDTHHMMSS_descriptive-name.md`

**Generate timestamp:** `date '+%Y-%m-%dT%H%M%S'`

See `changelog/CLAUDE.md` for required sections, template structure, and best practices.
