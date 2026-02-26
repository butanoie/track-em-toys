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
- Xcode: iOS-only (ios/ and packages/TrackEmToysDataKit/)
- Claude Code: Runs in VS Code integrated terminal or standalone

## Architecture
- iOS/macOS: Swift 6, SwiftUI, SwiftData + CloudKit sync, MVVM w/ @Observable
- Web: React 19 + TypeScript, Shadcn/ui, Tailwind CSS 4, TanStack Query
- Backend: Node.js 22 LTS, Fastify 5, TypeScript, PostgreSQL 17, ES256 JWT
- ML: Core ML + Create ML, transfer learning image classification (~7 MB models)

## Data Architecture
- PostgreSQL: Shared catalog (no user_id) + private collections (user_id + RLS)
- SwiftData: Local-first with CloudKit sync, single-user architecture
- RLS uses (SELECT current_app_user_id()) subselect wrapper for initPlan caching
- JWT: ES256 asymmetric signing, JWKS discovery, SHA-256 refresh token hashing
- RLS policies: always use the (SELECT ...) wrapper, never bare function calls


## Code Conventions
- Swift: async/await always, SwiftUI over UIKit, SF Symbols for icons
- TypeScript: strict mode, no 'any', Fastify schema validation
- React: functional components, TanStack Query for server state, Zod for schemas
- All: conventional commits with scope (ios, web, api, ml, shared, infra)

## Build Commands
- iOS: xcodebuild -scheme track-em-toys -destination 'platform=iOS Simulator,name=iPhone 16'
- API: cd api && npm run dev
- Web: cd web && npm run dev
- Tests (API): cd api && npm test
- Tests (Web): cd web && npm run test
- Lint (Web): cd web && npm run lint
- Lint fix (Web): cd web && npm run lint:fix
- Typecheck (Web): cd web && npm run typecheck


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

## Project Structure
Monorepo. Four active components: ios/, packages/TrackEmToysDataKit/, api/, web/

## CRITICAL RULES
- New Swift files go in ios/track-em-toys/ — Xcode uses folder references (blue folders),
  auto-detected, no .pbxproj edit needed

## Testing Requirements
- ALWAYS write unit tests for any new or updated code
- Tests are mandatory, not optional — no code change is complete without corresponding tests
- For new code: write tests covering the primary functionality, edge cases, and error paths
- For updated code: update existing tests to reflect changes AND add new tests for new behavior
- Swift tests go in the Xcode test target using XCTest or Swift Testing framework
- API tests use the project's configured test runner (e.g., vitest, jest)
- Web tests use the project's configured test runner
- Run tests after writing them to verify they pass before considering the task done

## iOS / Swift
- Swift 6, strict concurrency
- SwiftUI only (no UIKit/AppKit unless forced by a framework)
- SwiftData for persistence, async/await throughout, SF Symbols for icons
- Minimum deployment: iOS 17, macOS 14

## API
Stack: Node.js 22 LTS, Fastify 5, TypeScript strict mode, PostgreSQL 17, vitest.

### Fastify Conventions
- Plugin functions MUST be `async (fastify: FastifyInstance, _opts: object): Promise<void>`
- ALL response schemas MUST have `additionalProperties: false` and `required: [...]`
- Array item schemas also need `additionalProperties: false` and `required`
- NEVER use `void` before a synchronous method call — it suppresses errors silently

### Database Conventions
- NEVER use `SELECT *` or `RETURNING *` — always list explicit columns matching the TypeScript interface
- Column lists must stay in sync with the corresponding TypeScript type in `src/types/index.ts`
- ALL DB changes via migration files in `api/db/migrations/`, never direct schema edits

### Cookie Handling
- Cookies are signed via `@fastify/cookie` with `signed: true`
- ALWAYS read signed cookies with `request.unsignCookie(request.cookies[NAME])`
- NEVER read `request.cookies[NAME]` directly — returns raw `s:value.hmac` wire format
- Check `.valid === true` before using the value; `.valid === false` means tampered → 401

### OAuth / JWT Security
- Provider `aud` claims MUST be normalized before comparison:
  `const audList = Array.isArray(aud) ? aud : [aud]`
- `client_type` ('native' | 'web') is derived from the verified `aud` claim at signin, stored
  in `refresh_tokens`, and inherited on rotation — NEVER trust client-supplied headers for this
- Access tokens: ES256 asymmetric signing; refresh tokens: SHA-256 hashed before DB storage
- `/signin` calls `withTransaction` without `userId` (user may not exist yet) — auth tables
  must permit unauthenticated access (`app.user_id = ''`) during signin

### Type Safety
- NEVER use `as T` without a preceding runtime check or type guard function
- NEVER use `as unknown as T` — write a proper type guard instead
- Response schema nullability must match the actual return type (e.g. `string | null`, not `string`)
- Provider claim types that may be `string | string[]` must be handled for both shapes

## Web
Stack: React 19, TypeScript strict mode, Vite 6, TanStack Router + Query, Tailwind CSS 4, Shadcn/ui, vitest.

### ESLint
- Flat config at `web/eslint.config.js` using ESLint 9 + typescript-eslint 8
- Type-checked linting via `recommendedTypeChecked` with `projectService: true`
- `react-hooks` plugin enforces Rules of Hooks and exhaustive deps
- `react-refresh` plugin ensures Vite HMR compatibility
- `src/routeTree.gen.ts` is auto-generated by TanStack Router — excluded from linting
- Route files (`src/routes/**/*.tsx`) have `only-throw-error` disabled (`throw redirect(...)` is a TanStack Router pattern)
- Build/tool config files (`*.config.js`, `*.config.ts`) have `no-unsafe-*` disabled — untyped third-party build plugins

### TypeScript Typecheck
- `npm run typecheck` runs `tsc -b` — checks all project references (`tsconfig.app.json` + `tsconfig.node.json`) without emitting files
- `tsconfig.app.json` has `noEmit: true`, so `tsc -b` is purely a type check with no build output
- Different from `build`: the `build` script runs `tsc -b && vite build` (type check + bundle); `typecheck` is type-only validation
- Run before committing, in CI, and after adding new files or changing types
- Catches type errors that ESLint type-checked rules may not cover (e.g., missing imports, incorrect generics, declaration emit errors)

### Web Type Safety
- `@typescript-eslint/no-explicit-any`: `error` — enforces project no-any policy
- All `@typescript-eslint/no-unsafe-*` rules are enabled in production source code
- Test files (`*.test.ts`, `*.test.tsx`) relax unsafe-* and assertion rules for mocking
- Async event handlers must be wrapped: `onClick={() => { void handleAsync() }}` (satisfies `no-misused-promises`)
- NEVER use `as unknown as T` in non-test code — write a proper type guard instead

## Commit Standards
- NEVER commit unless the user explicitly says to commit — creating files, fixing bugs, or writing changelogs does NOT imply committing
- Completing a task (e.g. "create a changelog", "add ESLint") is NOT permission to commit; wait for explicit instruction
- Write clear, descriptive commit messages
- Follow conventional commits format
- Reference issue numbers when applicable
- Keep commits atomic and focused

Create a changelog entry for:
- **Phase Completions** - When a major phase of work is completed
- **Infrastructure Changes** - New tools, frameworks, or development setup
- **Feature Additions** - New functionality or components
- **Breaking Changes** - Changes that affect existing functionality
- **Configuration Updates** - Major changes to build, lint, or test configuration
- **Documentation Standards** - New standards or enforcement mechanisms

### Changelog File Format

**Location:** `changelog/` directory at project root

**Filename Format:** `YYYY-MM-DDTHHMMSS_descriptive-name.md`

**Example:** `2026-01-27T082828_testing-infrastructure-setup.md`

**Generate Timestamp:**
```bash
date '+%Y-%m-%dT%H%M%S'
```

### Required Sections

Every changelog entry must include:

#### Header Metadata
```markdown
# Title - Brief Description

**Date:** YYYY-MM-DD
**Time:** HH:MM:SS TZ
**Type:** [Phase Completion | Infrastructure | Feature | Configuration | etc.]
**Phase:** [If applicable]
**Version:** vX.Y.Z
```

#### Core Sections
1. **Summary** - Brief overview of what was accomplished (2-3 sentences)
2. **Changes Implemented** - Detailed breakdown of all changes
3. **Technical Details** - Configuration, code snippets, technical specifics
4. **Validation & Testing** - Proof that changes work (test results, quality checks)
5. **Impact Assessment** - How this affects development, team, or project
6. **Related Files** - List of created/modified/deleted files
7. **Status** - ✅ COMPLETE or current status

#### Optional Sections (Use When Relevant)
- **Documentation Benefits** - How this improves documentation
- **Next Steps** - What can be done after this change
- **Future Enhancements** - Recommended improvements
- **References** - Links to documentation, guides, or external resources
- **Summary Statistics** - Numbers (files changed, tests added, coverage %, etc.)
- **Comparison** - Before/after comparisons or tool comparisons
- **Bug Fixes** - Issues resolved during implementation

### Changelog Best Practices

**Level of Detail:**
- Be comprehensive - changelogs are historical records
- Include specific file paths, line counts, and metrics
- Show verification results (test output, lint results, build success)
- Document configuration changes with code examples
- Explain WHY changes were made, not just WHAT changed

**Writing Style:**
- Use clear headings and subsections
- Include code blocks for examples
- Use checkmarks (✅) for completed items
- Use tables for structured data
- Include command examples with output
- Link to related documentation files

**Examples to Follow:**
- See `changelog/2026-01-25T231357_phase1-completion.md` for phase completion example
- See `changelog/2026-01-25T233843_static-analysis-documentation-enforcement.md` for infrastructure example
- See `changelog/2026-01-27T082828_testing-infrastructure-setup.md` for detailed technical example

### Changelog Template Structure

```markdown
# Title - Brief Description

**Date:** YYYY-MM-DD
**Time:** HH:MM:SS TZ
**Type:** [Type]
**Version:** vX.Y.Z

## Summary

[2-3 sentence overview]

---

## Changes Implemented

### 1. [Category]

[Detailed description]

**Created:**
- File paths and purposes

**Modified:**
- File paths and changes

---

## Technical Details

### [Subsection]

[Code examples, configuration details]

---