# Track'em Toys

Toy collection catalog & pricing app for serious collectors. Track inventory, associate photos and barcode scans, monitor retail and resale pricing, and maintain insurance-grade records of collection value.

Initial focus: **Transformers** (official + third-party) and **G.I. Joe** (vintage through Classified Series), with an extensible data model for additional toy lines.

## Monorepo Structure

```
track-em-toys/
  api/          Node.js 22 + Fastify 5 + TypeScript — REST API with PostgreSQL
  web/          React 19 + TypeScript — SPA with TanStack Router/Query + Shadcn/ui
  ios/          Swift 6 + SwiftUI — iOS/macOS native app with SwiftData + CloudKit
  ml/           Core ML + Create ML — on-device toy image classification
  packages/     Shared Swift Package (TrackEmToysDataKit)
  docs/         Architecture decisions, requirements, and implementation plans
  changelog/    Timestamped changelog entries
```

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org/) | 22 LTS | API and web dev servers |
| [PostgreSQL](https://www.postgresql.org/) | 17+ | Database |
| [dbmate](https://github.com/amacneil/dbmate#installation) | Latest | Database migrations |
| [mkcert](https://github.com/FiloSottile/mkcert) | Latest | Local HTTPS certificates |
| [Xcode](https://developer.apple.com/xcode/) | 26.2 | iOS/macOS app (requires Apple Developer account) |

## Quick Start

### 1. Local HTTPS certificates

Apple Sign-In requires HTTPS. Generate shared certs used by both the API and web dev servers:

```bash
mkcert -install
mkdir -p .certs && cd .certs
mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 dev.track-em-toys.com
```

### 2. API

```bash
cd api
npm install
cp .env.example .env   # Fill in values — see api/README.md for details
createdb trackem_dev
dbmate up               # Run database migrations
npm run dev             # Starts on http://localhost:3000 (or HTTPS if TLS configured)
```

See [`api/README.md`](api/README.md) for full environment variable reference, endpoint documentation, and troubleshooting.

### 3. Web

```bash
cd web
npm install
cp .env.example .env   # Fill in API URL and OAuth client IDs
npm run dev             # Starts on https://dev.track-em-toys.com:5173
```

See [`web/README.md`](web/README.md) for configuration and development details.

### 4. iOS / macOS

Open `ios/track-em-toys.xcodeproj` in Xcode 26.2. See [`ios/README.md`](ios/README.md) for simulator setup and signing configuration.

### 5. ML

See [`ml/README.md`](ml/README.md) and [`ml/TRAINING.md`](ml/TRAINING.md) for the image classification training pipeline.

## Development Commands

| Command | Description |
|---------|-------------|
| `cd api && npm run dev` | API dev server with hot reload |
| `cd api && npm test` | API tests + lint |
| `cd api && npm run typecheck` | API type-check (no emit) |
| `cd web && npm run dev` | Web dev server (Vite) |
| `cd web && npm test` | Web unit tests (vitest) |
| `cd web && npm run test:e2e` | Web E2E tests (Playwright) |
| `cd web && npm run lint` | Web ESLint |
| `cd web && npm run typecheck` | Web type-check (tsc -b) |

## Architecture

- **Database:** PostgreSQL with shared catalog tables (no `user_id`) + private collection tables (Row-Level Security)
- **Auth:** OAuth2 via Apple Sign-In and Google Sign-In, ES256 JWT access tokens, database-backed refresh tokens with rotation
- **iOS data:** SwiftData with CloudKit sync, local-first single-user architecture
- **ML:** On-device inference via Core ML; transfer learning models kept under 10 MB

## Documentation

See [`docs/README.md`](docs/README.md) for an index of architecture decisions, requirements, and implementation plans.

## Project Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1.1 | Database migrations (auth tables, RLS) | Complete |
| 1.2 | API authentication (signin, refresh, logout, link-account) | Complete |
| 1.3 | Web SPA authentication (Google + Apple Sign-In) | Complete |
| 1.4 | Account settings UI (GET /auth/me, link-account flow) | Complete |
| 1.5 | Apple server-to-server webhooks | Complete |
| 1.6 | API documentation (Swagger + Scalar) | Complete |
| 2 | iOS native authentication | In progress |
| 3 | Catalog data model and API | Planned |
| 4 | ML image classification | Planned |
