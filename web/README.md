# Track'em Toys Web

React 19 SPA for the Track'em Toys collector catalog. Provides Google and Apple Sign-In, account settings, and will expand to catalog browsing, collection management, and pricing dashboards.

## Prerequisites

- **Node.js 22 LTS**
- **Local HTTPS certificates** — see root README for mkcert setup
- **API server running** — the web app calls the API at the URL specified in `VITE_API_URL`

## Quick Start

```bash
npm install
cp .env.example .env   # Fill in values (see Environment Variables below)
npm run dev             # https://dev.track-em-toys.com:5173
```

## Environment Variables

Copy `.env.example` to `.env` and fill in each value.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | API base URL (e.g., `http://localhost:3000`) |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth Web Client ID from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| `VITE_APPLE_SERVICES_ID` | Yes | Apple Services ID for web sign-in from [Apple Developer Portal](https://developer.apple.com/account/resources/) |
| `VITE_APPLE_REDIRECT_URI` | Yes | Apple Sign-In callback URL (e.g., `https://dev.track-em-toys.com:5173/auth/apple-callback`) |

All `VITE_` prefixed variables are exposed to the browser at build time (Vite convention).

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server with HTTPS and HMR |
| `npm run build` | Type-check (`tsc -b`) then bundle with Vite |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only (no emit, no bundle) |
| `npm run lint` | Run ESLint (flat config, type-checked) |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm test` | Run unit tests once (vitest + jsdom) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run test:e2e:ui` | Run Playwright tests with interactive UI |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 |
| Language | TypeScript (strict mode, no `any`) |
| Build | Vite 6 |
| Routing | TanStack Router (file-based, auto code-splitting) |
| Server state | TanStack Query |
| Styling | Tailwind CSS 4 |
| Components | Shadcn/ui (Radix UI primitives) |
| Icons | Lucide React |
| Validation | Zod |
| Unit tests | Vitest + Testing Library + jsdom |
| E2E tests | Playwright |
| Linting | ESLint 9 (flat config) + typescript-eslint 8 |

## Project Structure

```
web/
├── src/
│   ├── main.tsx                    # Entry point
│   ├── routes/
│   │   ├── __root.tsx              # Root layout (QueryClient, AuthProvider)
│   │   ├── login.tsx               # Public login page
│   │   ├── _authenticated.tsx      # Auth guard layout (redirects to /login)
│   │   └── _authenticated/         # Protected routes
│   ├── auth/
│   │   ├── AuthProvider.tsx        # Auth context and state management
│   │   ├── useAuth.ts             # Auth hook
│   │   ├── LoginPage.tsx          # Login UI (Google + Apple buttons)
│   │   ├── SettingsPage.tsx       # Account settings and provider linking
│   │   ├── apple-auth.ts         # Apple Sign-In JS SDK integration
│   │   ├── google-auth.ts        # Google Sign-In integration
│   │   └── hooks/                 # Auth-related query hooks
│   ├── components/
│   │   ├── ui/                    # Shadcn/ui components
│   │   └── ErrorBoundary.tsx      # Error boundary wrapper
│   └── lib/
│       ├── api-client.ts          # HTTP client with auth token injection and refresh
│       ├── auth-store.ts          # Session storage helpers
│       ├── utils.ts               # Tailwind cn() helper
│       └── zod-schemas.ts         # Shared Zod schemas for API responses
├── .env.example
├── vite.config.ts                  # Vite config (TanStack Router plugin, TLS, path alias)
├── vitest.config.ts                # Separate vitest config (jsdom, no Router plugin)
├── eslint.config.js                # ESLint 9 flat config
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.app.json               # App source (noEmit: true)
└── tsconfig.node.json              # Build/config files
```

## Key Conventions

- **No `any`** — ESLint enforces `no-explicit-any` as an error
- **All API data validated with Zod** — every `response.json()` goes through `.parse()`
- **Server state via TanStack Query only** — no `useState` + `fetch` for API data
- **API calls in dedicated hooks/files** — never inline in components
- **Access tokens in memory only** — never persisted to storage; `localStorage` holds only a boolean session flag
- **Path alias** — `@/*` maps to `./src/*`

## Vite Dev Server

The dev server runs on `https://dev.track-em-toys.com:5173` using mkcert certificates from `../.certs/`. The custom hostname is configured in `vite.config.ts`. Add this to `/etc/hosts` if not already present:

```
127.0.0.1 dev.track-em-toys.com
```
