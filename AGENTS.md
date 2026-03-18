# AGENTS.md — Track'em Toys

> Instructions for AI coding agents working in this repository.

## Project Overview

Toy collection catalog & pricing app for serious collectors.
Monorepo with four modules: `ios/`, `api/`, `web/`, `ml/`, plus a shared Swift Package at `packages/TrackEmToysDataKit/`.

## Things to Avoid

- Never commit `.env` files or secrets
- Never modify `ios/**/*.pbxproj` or `ios/**/*.xcworkspace`
- Never use `git add -f` on gitignored files
- Never use `SELECT *` or `RETURNING *` — list explicit columns
- Never run production database migrations without explicit instruction

## Build & Test Commands

### API (`api/`)

```bash
cd api && npm run dev         # Dev server (https://localhost:3010)
cd api && npm run build       # TypeScript compile
cd api && npm test            # Vitest + ESLint
cd api && npm run typecheck   # tsc type-check only
cd api && npm run lint        # ESLint only
cd api && npm run lint:fix    # ESLint auto-fix
```

### Web (`web/`)

```bash
cd web && npm run dev         # Dev server
cd web && npm run build       # tsc -b + Vite bundle
cd web && npm run test        # Vitest (run once)
cd web && npm run typecheck   # tsc -b (type-only)
cd web && npm run lint        # ESLint
cd web && npm run lint:fix    # ESLint auto-fix
cd web && npm run test:e2e    # Playwright e2e tests
```

## Tech Stack

- **API**: Node.js 22 LTS, Fastify 5, TypeScript strict, PostgreSQL 17
- **Web**: React 19, TypeScript strict, Vite 6, TanStack Router + Query, Tailwind CSS 4, Shadcn/ui
- **iOS**: Swift 6, SwiftUI, SwiftData + CloudKit sync
- **ML**: Core ML + Create ML

## Key Conventions

- TypeScript strict mode, no `any` — both API and Web
- Conventional commits with scope: `feat(api):`, `fix(web):`, `docs:`, etc.
- All DB changes via migration files in `api/db/migrations/`
- Catalog tables use UUID PKs with a unique `slug` column for stable references
- Seed data uses slug-based FK references — never integer IDs
- OAuth-only authentication (Apple + Google Sign-In)
- Tests are mandatory for all code changes

