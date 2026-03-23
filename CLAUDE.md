# CLAUDE.md — Track'em Toys Project

## NEVER EVER DO

These rules are ABSOLUTE:

### NEVER Publish Sensitive Data

- NEVER publish passwords, API keys, tokens to git/npm/docker
- Before ANY commit: verify no secrets included

### NEVER Read or Modify .env Files

- NEVER read, grep, search, or modify `.env` files — they contain secrets
- NEVER use `Grep`, `Bash`, `sed`, or any other tool to access `.env` file contents
- Only `.env.example` files may be read or modified directly
- When `.env` values are needed: **ask the user**
- When `.env` changes are needed: **provide instructions for the user** to make the changes
- NEVER commit `.env` to git
- ALWAYS verify `.env` is in `.gitignore`

### NEVER Modify these ios project files

- NEVER modify ios/\*_/_.pbxproj
- NEVER modify ios/\*_/_.xcworkspace

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
- ML: Core ML + Create ML, transfer learning image classification (≤ 10 MB models). Create ML requires single-level directories for `.labeledDirectories(at:)` — labels use `franchise__item` (`__` delimiter, not `/`)

## Data Architecture

- PostgreSQL: Shared catalog (no user_id) + private collections (user_id + RLS)
- SwiftData: Local-first with CloudKit sync, single-user architecture
- RLS uses (SELECT current_app_user_id()) subselect wrapper for initPlan caching
- `collection_items` is the first RLS-protected table — uses `FORCE ROW LEVEL SECURITY` + partial indexes on `WHERE deleted_at IS NULL`
- User-private tables must use `FORCE ROW LEVEL SECURITY` (without it, the DB owner bypasses all policies)
- JWT: ES256 asymmetric signing, JWKS discovery, SHA-256 refresh token hashing
- RLS policies: always use the (SELECT ...) wrapper, never bare function calls
- Catalog tables use UUID primary keys with a `slug` column for stable cross-references and URL-friendly API routes
- Catalog slugs are franchise-scoped: `UNIQUE(slug, franchise_id)` — NOT globally unique. Manufacturers and franchises remain globally unique.
- Seed data uses slug-based FK references — never integer IDs — to avoid fragile positional coupling
- Sample seed fixtures live in `api/db/seed/sample/`; full proprietary catalog data lives in a separate private repo activated via `SEED_DATA_PATH` env var
- Character relationships (combiners, vehicle-crew, binary bonds) are typed records in `relationships/*.json` and ingested into the `character_relationships` DB table. See `RELATIONSHIP_TYPE_REGISTRY` in `seed-validation.test.ts`
- Item-character associations use `item_character_depictions` junction table (through `character_appearances`) — NOT a direct FK on `items`. Items JSON keeps `character_slug` + `character_appearance_slug` for readability; ingest auto-generates depiction rows
- Item-to-item relationships (`item_relationships` table) support mold-origin, gift-set-contents, variant types. Seed data in `item_relationships/*.json`, ingested at step 6c
- Character symmetric relationship types: only `rival` and `sibling` (both sides have identical roles). Item relationships have NO symmetric types — `variant` uses `base`/`variant`, `mold-origin` uses directional roles, `gift-set-contents` uses `set`/`contents`
- Relationship API `role` field always describes the **related** entity (not the current entity) — consequence of the UNION ALL query returning the other side's role
- The `research-catalog` skill was moved to the private data repo — it no longer exists in `.claude/skills/`
- GI Joe vehicles are modeled as characters with `character_type: "Vehicle"` and `alt_mode` for vehicle description
- Slug disambiguation: GI Joe uses `-gijoe` suffix when colliding with Transformers slugs (e.g., `overlord-gijoe`, `shockwave-gijoe`)
- GDPR user deletion uses tombstone pattern: scrub PII (email, display_name, avatar_url), set `deleted_at`, keep the row so all FKs remain intact. NEVER use `ON DELETE CASCADE` or `ON DELETE SET NULL` on user FKs. App checks `deleted_at IS NOT NULL` to display "Deleted user". Phase 1.12 implements the deletion endpoint + UI.

## User Roles

- `users.role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'curator', 'admin'))`
- **user** — Browse catalog, manage own collection (post-ML)
- **curator** — All user powers + manage catalog items, characters, photos, review catalog_edits
- **admin** — All curator powers + user management, role assignment, account operations
- API: `requireRole(role)` Fastify preHandler middleware enforces role checks
- Web: Admin routes under `/admin/*`, code-split via lazy import; role checks in TanStack Router `beforeLoad`
- Catalog write operations (photo upload, item edits) require `curator` or `admin` role

## Development Strategy

- ML-accelerated, web-first roadmap: 1.4 (Seed) → 1.5 (Catalog API) → 1.5b (Roles) → 1.9 (Photos) → 4.0 (ML) → 2.0 (iOS)
- Collection features (private items, pricing, tags, CSV import, reporting) deferred until post-ML
- Photo enhancements (moderation, soft delete, captions, approval dashboard) deferred to Phase 1.9b (post-ML)
- Photo API endpoints have no LIMIT on returned photos — curators decide photo count, no API cap (decided 2026-03-23)
- `ADR_Performance_Scaling_Assessment.md` uses urgency-based tiers (NOW/SOON/10K users/multi-server/nice-to-have) — not all items are scale-dependent; some are pre-launch correctness fixes tracked in #109 and #110
- See `docs/plans/Development_Roadmap_v1_0.md` for full roadmap
- See `docs/decisions/2026-03-16_roadmap_session_decisions.md` for architectural decisions

## Refactoring Safety

**CRITICAL: Before removing or replacing any code during refactoring, check its git history to understand WHY it exists.** Code that looks redundant may be a deliberate bug fix.

- Run `git log -p --follow <file>` or `git blame` before deleting non-trivial logic
- **Check if the code was added as a bug fix** — look at commit messages for "fix:", "bugfix", or issue references
- **If replacing logic, verify behavioral equivalence** — a replacement that handles the happy path but drops an edge-case guard introduces a regression
- **Do not write comments claiming behavior that isn't implemented** — e.g., never claim state "resets automatically" unless the mechanism actually exists in the code
- See module-specific CLAUDE.md files for framework-specific refactoring rules

### Web Navigation

- `MainNav` (Dashboard | Catalog | My Collection) renders on all non-admin authenticated pages
- Admin pages use their own sidebar layout — do NOT render MainNav on admin routes
- Collection URLs: `/collection` (collection browse with franchise/condition/search filters in search params)
- Catalog URLs: `/catalog` (franchise list), `/catalog/:franchise` (hub, `?view=characters` toggles to characters view), `/catalog/:franchise/items` (items browse with filters in search params), `/catalog/:franchise/items/:slug` (item detail), `/catalog/:franchise/characters` (characters browse with filters in search params), `/catalog/:franchise/characters/:slug` (character detail)
- Manufacturer URLs: `/catalog/manufacturers` (manufacturer list), `/catalog/manufacturers/:slug` (hub), `/catalog/manufacturers/:slug/items` (items browse with filters in search params)

## Code Conventions

- Swift: async/await always, SwiftUI over UIKit, SF Symbols for icons
- TypeScript: strict mode, no 'any', Fastify schema validation
- React: functional components, TanStack Query for server state, Zod for schemas
- All: conventional commits with scope (ios, web, api, ml, shared, infra)

### Formatting (Prettier)

- Root `package.json` is a tooling host only (husky + lint-staged + prettier) — NOT an npm workspace
- `npm run prepare` is a reserved npm lifecycle hook (runs after `npm install`) — never use it as a custom script name
- `.prettierignore` does NOT auto-discover from subdirectories — per-module scripts use `--ignore-path ../.prettierignore`
- Prettier converts regex hex escapes (e.g. `\x00`) to literal bytes — place `eslint-disable` comments directly above the `.replace()` line, not above the enclosing expression

## Build Commands

See each module's CLAUDE.md for build, test, lint, and typecheck commands:
`api/CLAUDE.md`, `web/CLAUDE.md`, `ios/CLAUDE.md`, `ml/CLAUDE.md`

Root-level commands (run from repo root):

- `npm install` — install husky + lint-staged (required once after clone)
- `npm run format` — Prettier format entire repo
- `npm run format:check` — Prettier check entire repo (CI mode)

## Testing Requirements

Tests are mandatory, not optional — no code change is complete without corresponding tests. Use the appropriate test layer for what you're testing:

- Codex will review your code when you're done.

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

## Feature Development Gates

Non-trivial feature work requires verification and documentation gates. See [`docs/guides/DOC_GATE_REFERENCE.md`](docs/guides/DOC_GATE_REFERENCE.md) for the full checklist. The `.claude/rules/doc-gates-task-integration.md` rule enforces these as explicit tasks in every feature task list.

## Changelog

Create a changelog entry for:

- **Phase Completions** - When a major phase of work is completed
- **Infrastructure Changes** - New tools, frameworks, or development setup
- **Feature Additions** - New functionality or components
- **Breaking Changes** - Changes that affect existing functionality
- **Configuration Updates** - Major changes to build, lint, or test configuration
- **Documentation Standards** - New standards or enforcement mechanisms

### Changelog Format

**Location:** `changelog/` directory at project root. Filename: `YYYY-MM-DDTHHMMSSZ_descriptive-name.md`

**Generate timestamp:** `date -u '+%Y-%m-%dT%H%M%SZ'`

See `changelog/CLAUDE.md` for required sections, template structure, and best practices.
