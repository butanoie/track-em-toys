# Track'em Toys API

Fastify 5 + TypeScript authentication API with Apple Sign-In, Google Sign-In, ES256 JWT tokens, and PostgreSQL.

## Prerequisites

- **Node.js 22 LTS**
- **PostgreSQL 17+**
- **OpenSSL** (for generating JWT keys)
- **dbmate** (for running migrations) — [install instructions](https://github.com/amacneil/dbmate#installation)

## Quick Start

```bash
# 1. Install dependencies
cd api
npm install

# 2. Create the database
createdb trackem_dev

# 3. Set up environment variables
cp .env.example .env
# Then fill in the values (see Environment Variables below)

# 4. Run database migrations
dbmate up

# 5. Start the dev server
npm run dev
```

The server starts at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

## Environment Variables

Copy `.env.example` to `.env` and fill in each value.

### Database

| Variable       | Required | Description                  |
| -------------- | -------- | ---------------------------- |
| `DATABASE_URL` | Yes      | PostgreSQL connection string |

Default for local dev:

```
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/trackem_dev
```

### JWT Signing (ES256)

| Variable          | Required | Description                                                     |
| ----------------- | -------- | --------------------------------------------------------------- |
| `JWT_PRIVATE_KEY` | Yes      | ES256 PEM private key (full contents including BEGIN/END lines) |
| `JWT_PUBLIC_KEY`  | Yes      | ES256 PEM public key (full contents including BEGIN/END lines)  |
| `JWT_KEY_ID`      | Yes      | Unique key identifier used as `kid` in JWT headers              |
| `JWT_ISSUER`      | No       | Token issuer claim (default: `track-em-toys`)                   |

Generate a key pair:

```bash
openssl ecparam -genkey -name prime256v1 -noout -out jwt-private.pem
openssl ec -in jwt-private.pem -pubout -out jwt-public.pem
```

Paste the full PEM file contents into the env vars. For `JWT_KEY_ID`, use any unique string (e.g. `key-2026-02-22` or a UUID).

### Apple Sign-In

All values come from [Apple Developer Portal → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/).

| Variable            | Required | Where to find it                                               |
| ------------------- | -------- | -------------------------------------------------------------- |
| `APPLE_TEAM_ID`     | Yes      | Top-right of Developer portal (10-char alphanumeric)           |
| `APPLE_KEY_ID`      | Yes      | Keys section — create a key with "Sign in with Apple" enabled  |
| `APPLE_PRIVATE_KEY` | Yes      | The `.p8` file downloaded at key creation (one-time download)  |
| `APPLE_BUNDLE_ID`   | Yes      | Your iOS app's bundle identifier under Identifiers → App IDs   |
| `APPLE_SERVICES_ID` | Yes      | Create under Identifiers → Services IDs (used for web sign-in) |

Requires a paid Apple Developer account ($99/year).

### Google Sign-In

All values come from [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials).

| Variable                   | Required | Where to find it                                                                 |
| -------------------------- | -------- | -------------------------------------------------------------------------------- |
| `GOOGLE_WEB_CLIENT_ID`     | Yes      | Create an OAuth 2.0 Client ID with type "Web application"                        |
| `GOOGLE_IOS_CLIENT_ID`     | Yes      | Create an OAuth 2.0 Client ID with type "iOS"                                    |
| `GOOGLE_DESKTOP_CLIENT_ID` | No       | Create an OAuth 2.0 Client ID with type "Desktop app" (for macOS native sign-in) |

For the web client, add `http://localhost:5173` as an authorized JavaScript origin. You also need an OAuth consent screen configured on the project.

The desktop client ID is used by the macOS app, which authenticates via `ASWebAuthenticationSession` + PKCE. Unlike iOS (which uses the Google Sign-In SDK as a public client), macOS uses the "Desktop app" client type which requires a `client_secret` in the token exchange. The secret is stored in the iOS app's `Info.plist` (gitignored, never in source code).

### TLS (Local HTTPS)

Both the API and web dev servers share a single TLS certificate stored in `.certs/` at the repo root. This is required for Apple Sign-In (which mandates HTTPS callbacks) and for the iOS/macOS native client.

| Variable        | Required | Description                                               |
| --------------- | -------- | --------------------------------------------------------- |
| `TLS_CERT_FILE` | No       | Path to PEM certificate file (default: unset — HTTP only) |
| `TLS_KEY_FILE`  | No       | Path to PEM private key file (default: unset — HTTP only) |

Both must be set together, or both left unset. For local dev, point them at the shared mkcert certs:

```
TLS_CERT_FILE=../.certs/cert.pem
TLS_KEY_FILE=../.certs/key.pem
```

#### Generating certs with mkcert

Install [mkcert](https://github.com/FiloSottile/mkcert) and run the CA setup once:

```bash
mkcert -install
```

Then generate the shared certificate from the repo root:

```bash
mkdir -p .certs
cd .certs
mkcert -cert-file cert.pem -key-file key.pem localhost 127.0.0.1 dev.track-em-toys.com
```

This creates a certificate valid for:

- **`localhost`** — web dev server (`https://localhost:5173`)
- **`127.0.0.1`** — iOS/macOS native client (avoids IPv6 loopback issues with `localhost`)
- **`dev.track-em-toys.com`** — optional custom domain for cookie scoping

The web Vite dev server (`web/vite.config.ts`) and the API server both reference `../.certs/cert.pem` and `../.certs/key.pem`, so a single `mkcert` invocation covers all local HTTPS services.

#### Trusting the CA in iOS Simulator

`mkcert -install` only adds the root CA to the macOS System keychain. The iOS Simulator has its own isolated trust store and will reject the certificate with `NSURLErrorDomain -1202`. Inject the root CA into the booted simulator:

```bash
xcrun simctl keychain booted add-root-cert "$(mkcert -CAROOT)/rootCA.pem"
```

Repeat after erasing a simulator or when using a new simulator instance for the first time.

#### Regenerating certs

If you need to add a new hostname (e.g. for a new service), re-run the `mkcert` command with all desired names. The `-cert-file` and `-key-file` flags overwrite the existing files in place. Restart both the API and web dev servers after regenerating.

### Server

| Variable      | Required | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `PORT`        | No       | Server port (default: `3000`)                          |
| `CORS_ORIGIN` | No       | Allowed CORS origin (default: `http://localhost:5173`) |

## Database Migrations

Migrations live in `db/migrations/` (dbmate's default) and are managed by [dbmate](https://github.com/amacneil/dbmate).

```bash
# Apply all pending migrations
dbmate up

# Roll back the last migration
dbmate down

# Check migration status
dbmate status
```

The current migrations create:

| File                            | Table/Function                                               |
| ------------------------------- | ------------------------------------------------------------ |
| `001_create_users.sql`          | `users` table with email uniqueness and `updated_at` trigger |
| `002_create_oauth_accounts.sql` | `oauth_accounts` table linking providers to users            |
| `003_create_refresh_tokens.sql` | `refresh_tokens` table with token rotation support           |
| `004_rls_session_context.sql`   | `current_app_user_id()` function for Row-Level Security      |
| `005_create_auth_events.sql`    | `auth_events` audit log table                                |

## NPM Scripts

| Script               | Description                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Start dev server with hot reload (tsx watch) |
| `npm run build`      | Compile TypeScript to `dist/`                |
| `npm start`          | Run the compiled production build            |
| `npm run typecheck`  | Type-check without emitting files            |
| `npm run lint`       | Run ESLint                                   |
| `npm run lint:fix`   | Run ESLint with auto-fix                     |
| `npm test`           | Run tests once (vitest)                      |
| `npm run test:watch` | Run tests in watch mode                      |

## API Endpoints

### Public

| Method | Path                      | Description                                                            |
| ------ | ------------------------- | ---------------------------------------------------------------------- |
| `GET`  | `/health`                 | Health check                                                           |
| `GET`  | `/.well-known/jwks.json`  | Public JWKS for token verification                                     |
| `GET`  | `/reference/`             | Interactive API documentation (Scalar)                                 |
| `GET`  | `/reference/openapi.json` | OpenAPI 3.0 JSON spec                                                  |
| `POST` | `/auth/signin`            | Sign in with Apple or Google (rate limit: 10/min per IP)               |
| `POST` | `/auth/refresh`           | Rotate refresh token for a new access token (rate limit: 5/min per IP) |

### Authenticated (requires `Authorization: Bearer <access_token>`)

| Method | Path                 | Description                                                    |
| ------ | -------------------- | -------------------------------------------------------------- |
| `GET`  | `/auth/me`           | Get current user profile and linked providers                  |
| `POST` | `/auth/logout`       | Revoke a refresh token                                         |
| `POST` | `/auth/link-account` | Link an additional OAuth provider (rate limit: 5/min per user) |

### Webhooks

| Method | Path                   | Description                                                                 |
| ------ | ---------------------- | --------------------------------------------------------------------------- |
| `POST` | `/auth/webhooks/apple` | Apple server-to-server notifications (consent revocation, account deletion) |

### Sign-In Request

```bash
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "id_token": "<id_token_from_provider>"
  }'
```

For Apple sign-in, include `nonce` (the SHA-256 hex hash of the raw nonce — this must match the hashed nonce embedded in Apple's ID token) and optionally `user_info.name` on first sign-in:

```bash
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "apple",
    "id_token": "<id_token_from_apple>",
    "nonce": "<sha256_hex_of_raw_nonce>",
    "user_info": { "name": "Jane Doe" }
  }'
```

### Response

```json
{
  "access_token": "<JWT>",
  "refresh_token": "<opaque token>",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "display_name": "Jane Doe",
    "avatar_url": null
  }
}
```

## API Documentation (Scalar)

The API ships with interactive documentation powered by [Scalar](https://scalar.com/), an OpenAPI-based API reference UI. It is **only available in development and test environments** — production returns 404.

### Accessing the Docs

With the dev server running (`npm run dev`):

| URL                                             | Description                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `https://localhost:3010/reference/`             | Interactive Scalar UI — browse endpoints, view request/response schemas, and send test requests |
| `https://localhost:3010/reference/openapi.json` | Raw OpenAPI 3.0 JSON spec — import into Postman, Insomnia, or other API clients                 |

> **Note:** Replace `3010` with your configured `PORT` if different. If running without TLS, use `http://` instead.

### What You Can Do in Scalar

- **Browse endpoints** — All registered routes are grouped by tag (`system`, `jwks`, `auth`)
- **View schemas** — Request bodies, response shapes, and validation rules are documented inline from Fastify's JSON Schema definitions
- **Send requests** — Use the built-in "Try it" feature to send real requests to your local server
- **Authentication** — For authenticated endpoints, add your JWT access token via the "Bearer Auth" security scheme in the UI

### How It Works

The documentation is auto-generated from Fastify route schemas — no separate OpenAPI spec file is maintained. When you add `schema` to a route definition (request body, query params, response), it automatically appears in Scalar.

Source: [`src/plugins/docs.ts`](src/plugins/docs.ts)

## Project Structure

```
api/
├── db/
│   └── migrations/          # SQL migration files (dbmate)
├── src/
│   ├── index.ts             # Entry point — starts server
│   ├── server.ts            # Fastify instance and plugin registration
│   ├── config.ts            # Environment variable loading and validation
│   ├── auth/
│   │   ├── routes.ts        # Auth endpoint handlers
│   │   ├── apple.ts         # Apple id_token verification
│   │   ├── google.ts        # Google id_token verification
│   │   ├── tokens.ts        # Refresh token generation and rotation
│   │   ├── key-store.ts     # ES256 key management (kid → key mapping)
│   │   ├── jwks.ts          # GET /.well-known/jwks.json route
│   │   ├── webhooks.ts      # Apple server-to-server webhook handler
│   │   ├── cookies.ts       # Signed cookie read/write helpers
│   │   ├── errors.ts        # HttpError class for transaction rollbacks
│   │   └── schemas.ts       # Fastify JSON Schema validation
│   ├── db/
│   │   ├── pool.ts          # PostgreSQL connection pool + transaction helper
│   │   └── queries.ts       # Parameterized SQL queries
│   ├── plugins/
│   │   └── docs.ts              # Swagger + Scalar API docs (non-production only)
│   ├── hooks/
│   │   └── set-user-context.ts  # Sets app.user_id for PostgreSQL RLS
│   └── types/
│       └── index.ts         # TypeScript interfaces and DTOs
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.js
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Test files live alongside their source files (e.g. `auth/apple.test.ts`).

## Troubleshooting

**`Missing required environment variable: ...`**
All variables listed as "Required" in the tables above must be set in your `.env` file. The server will not start with missing values.

**`ECONNREFUSED` on startup**
PostgreSQL is not running or `DATABASE_URL` is incorrect. Verify with:

```bash
psql $DATABASE_URL -c "SELECT 1"
```

**Migrations fail**
Ensure `dbmate` is installed and `DATABASE_URL` is set. If running outside the `api/` directory, export the variable first:

```bash
export DATABASE_URL=postgresql://...
dbmate -d ./api/migrations up
```

## Design Documents

- [Architecture Research](../docs/decisions/Architecture_Research_for_Toy_Collection_Catalog_and_Pricing_App.md) — PostgreSQL data model, OAuth2 strategy
- [User Authentication Implementation Plan](../docs/plans/User_Authentication_Implementation_Plan.md) — Full auth implementation sequence
