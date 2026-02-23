# Track'em Toys API

Fastify 5 + TypeScript authentication API with Apple Sign-In, Google Sign-In, ES256 JWT tokens, and PostgreSQL.

## Prerequisites

- **Node.js 22 LTS**
- **PostgreSQL 15+**
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

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |

Default for local dev:
```
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/trackem_dev
```

### JWT Signing (ES256)

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_PRIVATE_KEY` | Yes | ES256 PEM private key (full contents including BEGIN/END lines) |
| `JWT_PUBLIC_KEY` | Yes | ES256 PEM public key (full contents including BEGIN/END lines) |
| `JWT_KEY_ID` | Yes | Unique key identifier used as `kid` in JWT headers |
| `JWT_ISSUER` | No | Token issuer claim (default: `track-em-toys`) |

Generate a key pair:

```bash
openssl ecparam -genkey -name prime256v1 -noout -out jwt-private.pem
openssl ec -in jwt-private.pem -pubout -out jwt-public.pem
```

Paste the full PEM file contents into the env vars. For `JWT_KEY_ID`, use any unique string (e.g. `key-2026-02-22` or a UUID).

### Apple Sign-In

All values come from [Apple Developer Portal → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/).

| Variable | Required | Where to find it |
|----------|----------|------------------|
| `APPLE_TEAM_ID` | Yes | Top-right of Developer portal (10-char alphanumeric) |
| `APPLE_KEY_ID` | Yes | Keys section — create a key with "Sign in with Apple" enabled |
| `APPLE_PRIVATE_KEY` | Yes | The `.p8` file downloaded at key creation (one-time download) |
| `APPLE_BUNDLE_ID` | Yes | Your iOS app's bundle identifier under Identifiers → App IDs |
| `APPLE_SERVICES_ID` | Yes | Create under Identifiers → Services IDs (used for web sign-in) |

Requires a paid Apple Developer account ($99/year).

### Google Sign-In

Both values come from [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials).

| Variable | Required | Where to find it |
|----------|----------|------------------|
| `GOOGLE_WEB_CLIENT_ID` | Yes | Create an OAuth 2.0 Client ID with type "Web application" |
| `GOOGLE_IOS_CLIENT_ID` | Yes | Create an OAuth 2.0 Client ID with type "iOS" |

For the web client, add `http://localhost:5173` as an authorized JavaScript origin. You also need an OAuth consent screen configured on the project.

### Server

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `3000`) |
| `CORS_ORIGIN` | No | Allowed CORS origin (default: `http://localhost:5173`) |

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

| File | Table/Function |
|------|----------------|
| `001_create_users.sql` | `users` table with email uniqueness and `updated_at` trigger |
| `002_create_oauth_accounts.sql` | `oauth_accounts` table linking providers to users |
| `003_create_refresh_tokens.sql` | `refresh_tokens` table with token rotation support |
| `004_rls_session_context.sql` | `current_app_user_id()` function for Row-Level Security |
| `005_create_auth_events.sql` | `auth_events` audit log table |

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled production build |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm test` | Run tests once (vitest) |
| `npm run test:watch` | Run tests in watch mode |

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/.well-known/jwks.json` | Public JWKS for token verification |
| `POST` | `/auth/signin` | Sign in with Apple or Google (rate limit: 10/min per IP) |
| `POST` | `/auth/refresh` | Rotate refresh token for a new access token (rate limit: 5/min per IP) |

### Authenticated (requires `Authorization: Bearer <access_token>`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/logout` | Revoke a refresh token |
| `POST` | `/auth/link-account` | Link an additional OAuth provider (rate limit: 5/min per user) |

### Sign-In Request

```bash
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "id_token": "<id_token_from_provider>"
  }'
```

For Apple sign-in, include `nonce` (raw nonce string) and optionally `user_info.name` on first sign-in:

```bash
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "apple",
    "id_token": "<id_token_from_apple>",
    "nonce": "<raw_nonce>",
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
│   │   └── schemas.ts       # Fastify JSON Schema validation
│   ├── db/
│   │   ├── pool.ts          # PostgreSQL connection pool + transaction helper
│   │   └── queries.ts       # Parameterized SQL queries
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
