# User Authentication Implementation Plan

**Date:** 2026-02-22
**Status:** Phases 1.1–1.3 Complete, Phase 4 (iOS) In Progress
**Phase:** 1 — Foundation
**Depends on:** Architecture Research (complete), API Framework Decision (Node.js + Fastify)

## Context

Track'em Toys needs user authentication before any private collection features can be built. The architecture research document already defines the auth strategy: OAuth2 via Apple Sign-In and Google Sign-In, with a unified backend endpoint, short-lived JWTs, and database-backed refresh tokens. This plan turns that research into an actionable implementation sequence across all four monorepo components.

**API Framework Decision: Node.js 22 LTS + Fastify 5 + TypeScript**

- `apple-signin-auth` is the most maintained Apple Sign-In library (handles JWKS caching, client secret generation, token verification)
- `google-auth-library` provides `OAuth2Client.verifyIdToken()` with built-in caching
- TypeScript shared between API and web frontend
- Aligns with existing CLAUDE.md build command: `cd api && npm run dev`

---

## Phase 1: Database Migrations

**Goal:** Create auth tables, audit log, RLS session context function, and indexes.

### Files to Create

- `api/db/migrations/001_create_users.sql`
- `api/db/migrations/002_create_oauth_accounts.sql`
- `api/db/migrations/003_create_refresh_tokens.sql`
- `api/db/migrations/004_rls_session_context.sql`
- `api/db/migrations/005_create_auth_events.sql`

### Schema

**users**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| email | VARCHAR(255) | |
| email_verified | BOOLEAN | NOT NULL, DEFAULT FALSE |
| display_name | VARCHAR(255) | |
| avatar_url | TEXT | |
| deactivated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Case-insensitive unique index: `UNIQUE (LOWER(email))` — application layer must also normalize emails to lowercase on insert.

**oauth_accounts**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | FK → users(id) ON DELETE CASCADE |
| provider | VARCHAR(50) | NOT NULL |
| provider_user_id | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | |
| is_private_email | BOOLEAN | NOT NULL, DEFAULT FALSE |
| raw_profile | JSONB | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Unique constraint: `(provider, provider_user_id)`
Indexes: `(user_id)`, `(provider, LOWER(email))`

**refresh_tokens**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | FK → users(id) ON DELETE CASCADE |
| token_hash | CHAR(64) | UNIQUE, NOT NULL — SHA-256 hex digest |
| device_info | VARCHAR(255) | |
| expires_at | TIMESTAMPTZ | NOT NULL |
| revoked_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Partial index: `(expires_at) WHERE revoked_at IS NULL`

**auth_events** (audit log)
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | FK → users(id) ON DELETE SET NULL |
| event_type | VARCHAR(50) | NOT NULL, CHECK (see below) |
| ip_address | INET | |
| user_agent | VARCHAR(512) | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Event types (enforced by CHECK constraint): `signin`, `refresh`, `logout`, `link_account`, `token_reuse_detected`, `account_deactivated`
Indexes: `(user_id)`, `(event_type, created_at)`, `(created_at)` — last index supports the 90-day cleanup job

> `ON DELETE SET NULL` preserves audit history after account deletion — the event row remains with `user_id = NULL`.

**RLS session context function** (used by all future RLS policies):

```sql
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.user_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;
```

RLS policies on `user_collection_items`, `user_pricing_records`, `user_wantlist` will be added when those tables are created in later feature phases.

### Migration Runner

Use `dbmate` — plain SQL files, no ORM coupling, tracks applied migrations in a `schema_migrations` table.

### Validation

- Run migrations against local PostgreSQL
- Verify tables with `\d+ tablename`
- Test `current_app_user_id()` function with `SELECT set_config('app.user_id', '<uuid>', true); SELECT current_app_user_id();`
- Insert test auth event and verify indexes

---

## Data Retention & Encryption at Rest

### Encryption at Rest

All PostgreSQL storage volumes **must** use provider-managed encryption at rest:

- **AWS RDS:** AES-256 encryption enabled at instance creation (default for new instances)
- **GCP Cloud SQL:** Google-managed encryption keys (enabled by default)
- **Local dev:** Not required — dev databases contain only test data

Column-level encryption (via `pgcrypto`) is not used because:

- Email addresses must support `UNIQUE` constraints and indexed lookups
- Provider-level disk encryption covers the threat model (unauthorized disk access)
- Application-level encryption would add query complexity without meaningful benefit for this data classification

### Data Retention Policies

| Data                               | Retention                          | Mechanism                                                   |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `users` rows                       | Until account deletion request     | Hard delete via API or Apple webhook                        |
| `oauth_accounts.raw_profile`       | 30 days after account creation     | Application-level cleanup job nullifies the column          |
| `refresh_tokens` (expired/revoked) | 60 days after expiry/revocation    | Scheduled cleanup job (Phase 5)                             |
| `auth_events`                      | 90 days                            | Scheduled cleanup job; extend if compliance requires longer |
| `device_info` on refresh_tokens    | Bounded by token cleanup (60 days) | Deleted with the parent refresh_token row                   |

### Account Deletion Procedure

When a user requests deletion (or Apple sends `account-delete` webhook):

1. Set `users.deactivated_at = NOW()` — immediately blocks auth middleware
2. Revoke all active refresh tokens for the user
3. Log `account_deactivated` event in `auth_events`
4. Schedule hard delete of `users` row after a 30-day grace period (allows undo)
5. `ON DELETE CASCADE` automatically removes `oauth_accounts` and `refresh_tokens`
6. `ON DELETE SET NULL` on `auth_events` preserves audit trail with `user_id = NULL`

### `raw_profile` Cleanup

The `oauth_accounts.raw_profile` JSONB column stores only whitelisted fields from the provider response (`sub`, `email_verified`) — not the full claims payload. The application layer extracts `sub`, `email`, `email_verified`, `name`, and `picture` from claims at sign-in time and stores them in typed columns; `raw_profile` is a minimal audit record.

A scheduled job nullifies `raw_profile` on rows older than 30 days:

```sql
UPDATE oauth_accounts SET raw_profile = NULL
WHERE raw_profile IS NOT NULL AND created_at < NOW() - INTERVAL '30 days';
```

---

## Phase 2: API Server + Auth Endpoints

**Goal:** Stand up Fastify server with auth endpoints, JWT middleware, and database connection pool.

### Directory Structure

```
api/
  src/
    index.ts               — Entry point, graceful shutdown
    server.ts              — Fastify instance, plugin registration, Content-Type enforcement
    config.ts              — Env var loading + validation (rejects CORS_ORIGIN=*)
    db/
      pool.ts              — pg Pool singleton, withTransaction(fn, userId?) for RLS
      queries.ts           — Parameterized SQL query functions
    auth/
      routes.ts            — Auth route registration, HttpError for transaction aborts
      apple.ts             — Apple id_token verification (explicit issuer validation)
      google.ts            — Google id_token verification
      tokens.ts            — Refresh token creation/rotation, SHA-256 hashing
      cookies.ts           — httpOnly cookie helpers for refresh token (set/clear)
      key-store.ts         — ES256 key loading, kid→public key map for rotation
      jwks.ts              — GET /.well-known/jwks.json (jose exportJWK)
      schemas.ts           — JSON Schema for request/response validation (with maxLength)
    types/
      index.ts             — User, OAuthAccount, TokenPayload types
  package.json
  tsconfig.json
  .env.example
```

### Key Dependencies

```
fastify ^5            @fastify/cors ^10       @fastify/cookie ^11
@fastify/jwt ^9       @fastify/rate-limit ^10
apple-signin-auth ^1  google-auth-library ^9
jose ^5               pg ^8                   dotenv ^16
tsx (dev)             vitest (dev)            @types/pg (dev)
```

**Library roles:**

- `@fastify/jwt` — Request lifecycle JWT operations: `reply.jwtSign()`, `request.jwtVerify()`, dynamic secret callback for `kid`-based key rotation. Uses `fast-jwt` internally for ES256 support.
- `@fastify/cookie` — Sets and reads `httpOnly; Secure; SameSite=Strict` cookies for refresh tokens on the web client. The API sets the refresh token as a cookie on signin/refresh responses; the browser sends it automatically on `/auth/refresh` requests (see Phase 3 Token Storage Strategy).
- `jose` — JWKS utilities: `exportJWK()` to build the public key set, `createLocalJWKSet()` for verification, and exposes `GET /.well-known/jwks.json` for future service-to-service token verification.

### Endpoints

**POST /auth/signin** — Rate limit: 10/min per IP

```
Request:  { provider: "apple" | "google", id_token: string, nonce?: string, user_info?: { name?: string } }
Response: { access_token, refresh_token, user: { id, email, display_name, avatar_url } }
Cookie:   Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/auth
```

`nonce` is required when `provider = "apple"` (raw nonce for replay protection; see Apple Sign-In Nonce).
Flow:

1. Validate `id_token` with provider library (Apple accepts both Bundle ID and Services ID as audience; Google accepts both Web and iOS client IDs). For Apple, verify the `nonce` claim matches the server-generated nonce (see Apple Sign-In Nonce below).
2. Extract `sub`, `email`, `email_verified` from claims
3. Look up `oauth_accounts` by `(provider, provider_user_id)`
4. If found → load existing user
5. If not found + `email_verified = true` from token → check `users` by email where `users.email_verified = true` (account linking). Both sides must have verified emails to prevent email takeover.
6. If not found + no match → create new user + oauth_account
7. Apple first login: store `user_info.name` as `display_name` (sent only once by Apple — persist name client-side until confirmed saved; see Apple Name Persistence below)
8. Generate 30-day refresh token inside the transaction (random 32 bytes, SHA-256 hashed in DB). Sign the 15-min access JWT (ES256) **after** the transaction commits.
9. Log `signin` event to `auth_events` with IP and user-agent
10. Set refresh token as `httpOnly; Secure; SameSite=Strict` cookie on the response (web clients use cookie; native clients use JSON body)

> **Transaction requirement:** Steps 3–7 and 9 execute within a single database transaction; step 8 (JWT signing via `reply.jwtSign()`) is deferred to **after** the transaction commits. This decouples the HTTP/JWT layer from the database lifecycle — if JWT signing fails after commit, no orphaned DB state is created (the user simply retries). The transaction returns `userId` + `refreshToken` + `user`, and the route handler signs the JWT after `COMMIT`. Never call `reply.send()` or `reply.jwtSign()` inside a transaction callback.

> **Concurrent first-login:** Two simultaneous first-login requests for the same provider user will race to step 6. To prevent orphan user rows, insert `oauth_accounts` **first** (with `ON CONFLICT (provider, provider_user_id) DO NOTHING RETURNING *`). If the insert succeeds, the winning request creates the user and links it via `updateOAuthAccountUserId`. If the insert returns no row, re-fetch the existing `oauth_account` and its user — and validate the user is not deactivated before proceeding.

> **Deactivation checks on race-condition paths:** Every code path that re-fetches a user after a concurrent-insert conflict must validate `user.deactivated_at IS NULL`. This is enforced by the shared `handleOAuthConflict()` helper which calls `assertNotDeactivated()` on the resolved user.

**POST /auth/refresh** — Rate limit: 5/min per token hash (falls back to IP if no body)

```
Request:  { refresh_token?: string }   — optional; also accepted via httpOnly cookie
Response: { access_token, refresh_token }
```

Rate-limiting keys on the token hash (not just IP) to prevent bypass via IP rotation.
The refresh token is accepted from the JSON body **or** the `refresh_token` httpOnly cookie (web clients send it automatically). Body takes precedence if both are present.
Flow: Hash token → check for reuse (revoked token presented → revoke ALL user tokens + log `token_reuse_detected`) → find active token in DB (not revoked, not expired) → check user not deactivated → revoke old → create new (rotation) → issue new access JWT after transaction commits. Revoke + create must be atomic (single transaction). The rotated refresh token is set as an httpOnly cookie on the response.

**POST /auth/logout** — Requires valid access token

```
Request:  { refresh_token?: string }   — optional; also accepted via httpOnly cookie
Response: 204 No Content
```

Before revoking, the endpoint verifies the refresh token belongs to the authenticated user (`token.user_id === request.user.sub`). Returns 403 if the token belongs to a different user. Clears the httpOnly cookie on the response.

**POST /auth/link-account** — Requires valid access token, rate limit: 5/min per user (keyed by user ID, not IP)

```
Request:  { provider: "apple" | "google", id_token: string, nonce?: string }
Response: { user with updated linked accounts }
Errors:   409 — provider account already linked to a different user
          409 — user already has an account with this provider
```

`nonce` is required when `provider = "apple"`.

Flow: Verify `id_token` (+ nonce for Apple) → check if `(provider, provider_user_id)` exists for another user → 409 if so → check if current user already has this provider → 409 if so → insert new `oauth_accounts` row → return updated user.

### JWT Signing Strategy

Use **ES256 (ECDSA P-256)** asymmetric signing with two libraries working together:

**`@fastify/jwt`** handles the request lifecycle with a single registration using the dynamic secret callback (supports key rotation from day one):

```typescript
// Single plugin registration — dynamic secret resolves keys by kid
fastify.register(jwt, {
  decode: { complete: true },
  secret: {
    private: keyStore.getPrivateKey(), // current signing key PEM
    public: async (request, token) => {
      const { kid } = token.header;
      return keyStore.getPublicKey(kid); // returns PEM for the matching kid
    },
  },
  sign: {
    algorithm: 'ES256',
    expiresIn: '15m',
    iss: 'track-em-toys',
    aud: 'track-em-toys-api',
    kid: keyStore.getCurrentKid(),
  },
  verify: {
    allowedIss: ['track-em-toys'],
    allowedAud: ['track-em-toys-api'],
  },
});

// Signing: const token = await reply.jwtSign({ sub: userId })
// Verifying: await request.jwtVerify() → sets request.user
```

**`jose`** provides the JWKS endpoint for external verification:

```typescript
// Expose public keys as JWKS for service-to-service verification
import { exportJWK } from 'jose';

fastify.get('/.well-known/jwks.json', async () => {
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid: process.env.JWT_KEY_ID, alg: 'ES256', use: 'sig' }] };
});
```

**Key rotation procedure:**

1. Generate new ES256 key pair, assign a new `kid`
2. Deploy with both old and new public keys in the key store
3. New tokens are signed with the new `kid`
4. After 15 min (max token lifetime), remove the old public key
5. Update `/.well-known/jwks.json` accordingly

### Apple Sign-In Nonce

Prevent `id_token` replay by including a server-generated nonce:

**Client-side (iOS and web):**

1. Generate 32 random bytes, hex-encode → `rawNonce`
2. SHA-256 hash the raw nonce → `hashedNonce`
3. Include `hashedNonce` in the Apple auth request (`ASAuthorizationAppleIDRequest.nonce` on iOS, `nonce` param in Apple JS SDK on web)
4. Send `rawNonce` alongside `id_token` in `POST /auth/signin`

**API-side:**

1. SHA-256 hash the received `rawNonce`
2. Compare against the `nonce` claim inside the decoded `id_token`
3. Reject if they don't match or if `nonce` is missing

The `apple-signin-auth` library's `verifyIdToken()` accepts a `nonce` option for this verification.

> Google Sign-In does not use client-side nonce — Google's `id_token` verification via `google-auth-library` validates `aud`, `iss`, and expiry, which is sufficient per Google's documentation.

### Auth Middleware

- `@fastify/jwt`'s `request.jwtVerify()` as `preHandler` hook on all routes except `/auth/signin`, `/auth/refresh`, `/health`, `/.well-known/jwks.json`
- Resolves public key by `kid` header via dynamic secret callback
- Verifies `iss = 'track-em-toys'` and `aud = 'track-em-toys-api'` (configured in plugin registration)
- Attaches decoded `sub` (user_id) to `request.user`
- Logs JWT verification failures at `debug` level for troubleshooting (expired, malformed, wrong audience, unknown kid) while returning a generic 401 to clients (no information leakage)
- Rejects tokens from deactivated users: check `users.deactivated_at IS NOT NULL` with a short-TTL in-memory cache (60s) to avoid a DB query on every request. Cache is invalidated when `deactivated_at` is set via the deactivation endpoint.
- Returns 401 if missing/invalid/expired

### RLS Context via `withTransaction`

RLS context (`app.user_id`) is **not** set via a Fastify hook. An `onRequest` hook would execute `set_config` on a connection that is immediately returned to the pool — the route handler's business logic would then get a different connection where `app.user_id` is unset, silently bypassing RLS.

Instead, `withTransaction(fn, userId?)` accepts an optional `userId` parameter and executes `SELECT set_config('app.user_id', $1, true)` as the first statement inside the transaction, on the same connection that executes the business logic:

```typescript
// Authenticated routes pass request.user.sub:
const result = await withTransaction(async (client) => {
  // client already has app.user_id set — RLS policies apply
  await client.query('SELECT * FROM user_collection_items');
}, request.user.sub);
```

### Environment Variables

See `api/.env.example`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/trackem_dev
JWT_PRIVATE_KEY=<ES256 PEM private key — generate with: openssl ecparam -genkey -name prime256v1 -noout>
JWT_PUBLIC_KEY=<ES256 PEM public key — derive with: openssl ec -pubout>
JWT_KEY_ID=<unique key identifier for kid header>
JWT_ISSUER=track-em-toys
APPLE_TEAM_ID=     APPLE_KEY_ID=     APPLE_PRIVATE_KEY=
APPLE_BUNDLE_ID=   APPLE_SERVICES_ID=
GOOGLE_WEB_CLIENT_ID=   GOOGLE_IOS_CLIENT_ID=
PORT=3000          CORS_ORIGIN=http://localhost:5173
TRUST_PROXY=false
```

**Config validation at startup:**

- `CORS_ORIGIN=*` is rejected when credentials are enabled (prevents CORS bypass)
- Empty string env vars are treated as unset (not silently used)
- `TRUST_PROXY=true` enables Fastify's `trustProxy` for correct `request.ip` behind reverse proxies

### Input Validation

All request body fields have `maxLength` constraints enforced by Fastify JSON Schema validation:

- `id_token`: 8192 chars (JWT tokens can be large)
- `nonce`: 256 chars
- `user_info.name`: 255 chars (matches DB column limit)
- `refresh_token`: 256 chars

User-supplied `display_name` values are sanitized (control characters stripped, whitespace trimmed) before storage.

The `raw_profile` JSONB column stores only whitelisted fields (`sub`, `email_verified`) — not the full OAuth claims payload — to minimize PII accumulation.

### Validation

- `curl` / `httpie` against all 4 endpoints
- Unit tests for `apple.ts` and `google.ts` with mocked JWKS
- Integration tests with `fastify.inject()` + `testcontainers` PostgreSQL

---

## Phase 3: Web SPA Authentication

**Goal:** Scaffold the React 19 + Vite web app and implement login page, in-memory token management, silent refresh, protected routes, and OAuth sign-in flows.

**Status:** Not started. The `web/` directory is currently empty; this phase includes project scaffolding.

**Depends on:** Phase 2 (API auth endpoints) — complete as of commit `8e7f52b`.

> **Note:** Phase 3 and Phase 4 can run in parallel (both depend only on Phase 2).

### Prerequisite: Project Scaffolding

The `web/` directory does not yet exist. Before any auth work, scaffold the project:

```bash
cd web
npm create vite@latest . -- --template react-ts
npm install react@19 react-dom@19
npm install -D @types/react@19 @types/react-dom@19
npm install @tanstack/react-query @tanstack/react-router zod
npm install -D tailwindcss @tailwindcss/vite
npx shadcn@latest init
```

Create `web/.env.example`:

```env
VITE_API_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=<Google OAuth Web Client ID>
VITE_APPLE_SERVICES_ID=<Apple Services ID for web>
VITE_APPLE_REDIRECT_URI=http://localhost:5173/auth/apple-callback
```

> **NEVER** commit `web/.env` to git. Only `.env.example` is committed.

### Key Libraries

```
@tanstack/react-query ^5    — Server state, auth query caching
@tanstack/react-router ^1   — File-based routing with auth guards
@react-oauth/google ^0.12   — Google Sign-In button + credential flow
zod ^3                       — Runtime validation of API responses
```

Apple Sign-In on web: Apple JS SDK loaded via `<script>` tag (no maintained React wrapper exists). The SDK is loaded dynamically in `apple-auth.ts` to avoid blocking initial page load.

### Directory Structure

```
web/src/
  lib/
    api-client.ts              — Fetch wrapper: base URL, credentials, Content-Type, 401 interceptor
    auth-store.ts              — In-memory access token singleton (module-scoped, not React state)
    zod-schemas.ts             — Zod schemas for all auth API response types
  auth/
    AuthProvider.tsx            — React context: user state, isAuthenticated, isLoading
    useAuth.ts                  — Hook: exposes login, logout, user, isAuthenticated
    LoginPage.tsx               — Apple + Google sign-in buttons (public route)
    AppleCallback.tsx           — Apple web redirect handler (form_post → POST /auth/signin)
    ProtectedRoute.tsx          — Auth guard component for TanStack Router
    google-auth.ts              — Google credential extraction helper
    apple-auth.ts               — Apple JS SDK loader + nonce generation + redirect trigger
  routes/
    __root.tsx                  — Root layout with AuthProvider + QueryClientProvider
    _authenticated.tsx          — Authenticated layout (wraps ProtectedRoute)
    _authenticated/
      index.tsx                 — Dashboard (placeholder)
    login.tsx                   — LoginPage route
    auth/
      apple-callback.tsx        — AppleCallback route
```

### API Client (`api-client.ts`)

A thin wrapper around `fetch` that handles authentication concerns.

**Critical implementation details from the API:**

1. **`credentials: 'include'`** — Required on ALL requests to `VITE_API_URL`. The refresh token cookie has `SameSite=Strict; Path=/auth`, so the browser only sends it on requests to `/auth/*` paths. But `credentials: 'include'` must be set globally because the API's CORS is configured with `credentials: true` and the browser will reject responses without the matching request credential mode.

2. **`Content-Type: application/json`** — Required on all POST requests. The API enforces this via a `preValidation` hook and returns 415 if missing. This also serves as CSRF defense-in-depth (browsers cannot send `application/json` via form submission).

3. **`Authorization: Bearer <access_token>`** — Attached from the in-memory token store on all requests except `/auth/signin` and `/auth/refresh`.

4. **Do NOT send `X-Client-Type` header** — The API checks for `X-Client-Type: native` to distinguish iOS/Android clients. Web clients must NOT send this header. Its absence tells the API to use cookie-based refresh token delivery (the API returns `refresh_token: null` in the JSON body for web clients and sets the token as an httpOnly cookie instead).

5. **Do NOT send `refresh_token` in request bodies** — Web clients rely entirely on the httpOnly cookie for refresh token delivery. The `/auth/refresh` and `/auth/logout` endpoints read the cookie automatically. Sending the token in the body would require JavaScript access to it, which defeats the purpose of httpOnly cookies.

**401 interceptor with refresh queue:**

```typescript
// Pseudocode — actual implementation in api-client.ts

let refreshPromise: Promise<boolean> | null = null;

async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  const response = await baseFetch(url, withAuthHeaders(options));

  if (response.status === 401 && !url.includes('/auth/refresh')) {
    // Deduplicate concurrent refresh attempts with a shared promise
    if (!refreshPromise) {
      refreshPromise = attemptRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise;
    if (refreshed) {
      // Retry the original request with the new access token
      return baseFetch(url, withAuthHeaders(options));
    }

    // Refresh failed — clear auth state, redirect to login
    authStore.clear();
    window.location.href = '/login';
  }

  return response;
}
```

The shared `refreshPromise` acts as a mutex: if three requests all get 401 simultaneously, only one `/auth/refresh` call is made. The other two wait on the same promise and then retry with the new access token.

### Token Storage Strategy

**Refresh token: httpOnly cookie (managed entirely by the API)**

- The API sets the cookie on `/auth/signin` and `/auth/refresh` responses
- The API clears the cookie on `/auth/logout` responses
- JavaScript has zero access to the refresh token — this is the design intent
- Cookie attributes: `HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=2592000` (30 days)
- The cookie's `Path=/auth` scope means it is only sent on requests to `/auth/*` endpoints

**Access token: in-memory only (module-scoped variable, NOT React state)**

- Stored in a module-scoped variable in `auth-store.ts`, not in React state or context
- This prevents the token from appearing in React DevTools or component tree snapshots
- The `AuthProvider` reads from this store but does not hold the token as state itself
- On page refresh / new tab: the token is lost (by design) — a silent `/auth/refresh` call restores it
- On tab close: the token is gone — the 30-day refresh cookie allows re-authentication
- NEVER stored in `localStorage`, `sessionStorage`, or cookies — only in JavaScript memory

```typescript
// auth-store.ts — singleton module
let accessToken: string | null = null;

export const authStore = {
  getToken: () => accessToken,
  setToken: (token: string) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};
```

### Zod Schemas (`zod-schemas.ts`)

Define schemas matching the exact API response shapes from `api/src/auth/schemas.ts` and `api/src/types/index.ts`:

```typescript
import { z } from 'zod';

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
});

// Web clients receive refresh_token: null (token is in httpOnly cookie)
export const AuthResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.null(),
  user: UserResponseSchema,
});

// Web clients receive refresh_token: null on refresh too
export const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.null(),
});

export const LinkAccountResponseSchema = UserResponseSchema.extend({
  linked_accounts: z.array(
    z.object({
      provider: z.enum(['apple', 'google']),
      email: z.string().nullable(),
    })
  ),
});

export const ApiErrorSchema = z.object({
  error: z.string(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type LinkAccountResponse = z.infer<typeof LinkAccountResponseSchema>;
```

> **Why `refresh_token: z.null()`?** The API returns `refresh_token: null` in JSON for web clients. The actual refresh token is in the `Set-Cookie` header, invisible to JavaScript. The Zod schema enforces this expectation — if the API ever accidentally sends a non-null token to a web client, the parse will fail and the error will be caught immediately.

### AuthProvider and useAuth Hook

**AuthProvider.tsx** manages:

- `user: UserResponse | null` — current authenticated user (React state)
- `isLoading: boolean` — true during initial silent refresh on mount
- `isAuthenticated: boolean` — derived from `user !== null`

**Initialization flow (on app mount):**

1. `AuthProvider` mounts with `isLoading = true`
2. Calls `POST /auth/refresh` with `credentials: 'include'` (cookie sent automatically)
3. If successful: parse response with `TokenResponseSchema`, store `access_token` in `authStore`, restore cached `UserResponse` from `sessionStorage`
4. If refresh fails (401): user is not authenticated — set `isLoading = false`, `user = null`
5. App renders login page or authenticated content based on state

> **Design note:** The initial silent refresh is the ONLY way to restore auth state after a page refresh. There is no user data in `localStorage`. This is a security trade-off: slightly slower initial load (one extra HTTP round-trip) in exchange for zero persistent client-side tokens.

**Problem: `/auth/refresh` does not return user data.** The API's refresh endpoint returns only `{ access_token, refresh_token }` — no user object. Solution:

- **Cache the `UserResponse` in `sessionStorage`** (NOT the tokens — just the user profile: id, email, display_name, avatar_url). On page refresh, do the silent refresh to get a new access token, then use the cached user profile. Cache key: `trackem:user`. Clear on logout.
- Future: a `GET /auth/me` endpoint can replace this pattern cleanly (Phase 5 candidate).

**useAuth hook:**

```typescript
interface AuthContext {
  user: UserResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithGoogle: (credential: string) => Promise<void>;
  signInWithApple: (idToken: string, nonce: string, userName?: string) => Promise<void>;
  logout: () => Promise<void>;
}
```

### TanStack Query Integration

Auth state is NOT managed via TanStack Query. The `AuthProvider` context owns the auth lifecycle (login, refresh, logout) because auth is a side-effect-heavy singleton concern, not a cacheable server query.

TanStack Query IS used for all authenticated API calls after login:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Do not retry auth failures — the 401 interceptor handles refresh
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 3;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});
```

On logout, call `queryClient.clear()` to purge all cached data.

### Google Sign-In on Web

Use `@react-oauth/google` with the One Tap / button flow (NOT the redirect flow):

1. Wrap app with `<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>`
2. Render `<GoogleLogin onSuccess={handleGoogleSuccess} />` on the login page
3. On success: `credentialResponse.credential` is the `id_token` (a JWT string)
4. POST to `/auth/signin` with `{ provider: 'google', id_token: credential }` — no `X-Client-Type` header
5. Parse response with `AuthResponseSchema`
6. Store `access_token` in `authStore`, cache `user` in `sessionStorage`, set React state

> **No nonce needed for Google** — Google's `id_token` verification validates `aud`, `iss`, and `exp`, which is sufficient.

### Apple Sign-In on Web

Apple Sign-In on web uses a **redirect flow** with `form_post` response mode.

**Setup (`apple-auth.ts`):**

1. Load Apple JS SDK dynamically (to avoid blocking initial page load)
2. Generate nonce client-side:
   ```typescript
   async function generateNonce(): Promise<{ raw: string; hashed: string }> {
     const bytes = crypto.getRandomValues(new Uint8Array(32));
     const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
     const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
     const hashed = Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('');
     return { raw, hashed };
   }
   ```
3. Store `rawNonce` and `state` in `sessionStorage` before redirect
4. Initialize and trigger:
   ```typescript
   AppleID.auth.init({
     clientId: import.meta.env.VITE_APPLE_SERVICES_ID,
     scope: 'name email',
     redirectURI: import.meta.env.VITE_APPLE_REDIRECT_URI,
     state: crypto.randomUUID(), // CSRF protection
     nonce: hashedNonce,
     usePopup: false,
   });
   AppleID.auth.signIn();
   ```

**Callback handling (`AppleCallback.tsx`):**

Apple POSTs back to the redirect URI with `application/x-www-form-urlencoded` body containing `id_token`, `code`, `state`, and optionally `user` (JSON string, sent only on first authorization).

Since a pure SPA cannot receive Apple's form_post directly, use an API relay approach:

- The API accepts Apple's callback at `POST /auth/apple-callback`, extracts `id_token` and `user` fields, then redirects to `GET /auth/apple-callback?token=<id_token>&user=<encoded_user>` on the web app
- The SPA route reads these query params, retrieves `rawNonce` and `state` from `sessionStorage`, validates state (CSRF check), then calls `POST /auth/signin`

**Apple Name Persistence (web):**

- Store `user.name` from Apple's first-time callback in `sessionStorage`
- Only clear after receiving a successful `/auth/signin` response that includes a `display_name`
- If signin fails, the name remains in `sessionStorage` for retry

### Logout Flow

1. Call `POST /auth/logout` with `credentials: 'include'` and `Authorization: Bearer <access_token>`
   - Do NOT send refresh token in body — the API reads it from the httpOnly cookie
   - The API clears the cookie in the response
2. Clear `authStore` (in-memory access token)
3. Clear `sessionStorage` (cached user profile)
4. Call `queryClient.clear()` to purge all TanStack Query caches
5. Navigate to `/login`

If the logout API call fails (e.g., network error), still perform steps 2–5 client-side. The refresh token will expire naturally (30 days).

### Route Protection

Use TanStack Router's layout routes:

```typescript
// _authenticated.tsx — layout route
function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return <LoadingSpinner />
  if (!isAuthenticated) throw redirect({ to: '/login' })

  return <Outlet />
}
```

All routes under `_authenticated/` are protected. `/login` and `/auth/apple-callback` are public.

### Silent Refresh Scheduling

In addition to the reactive 401 interceptor, implement a proactive timer:

```typescript
function scheduleRefresh(accessToken: string): void {
  const payload = JSON.parse(atob(accessToken.split('.')[1]));
  const expiresAt = payload.exp * 1000;
  const refreshAt = expiresAt - 60_000; // 60 seconds before expiry
  const delay = Math.max(refreshAt - Date.now(), 0);

  refreshTimerId = window.setTimeout(async () => {
    await attemptRefresh();
  }, delay);
}
```

Cancel the timer on logout.

### Error Handling

```typescript
class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { error: string }
  ) {
    super(body.error);
    this.name = 'ApiError';
  }
}
```

| Status | Meaning                      | Web Client Action                                    |
| ------ | ---------------------------- | ---------------------------------------------------- |
| 401    | Access token expired/invalid | Silent refresh via interceptor (automatic)           |
| 403    | Account deactivated          | Show "account deactivated" message, clear auth state |
| 409    | Conflict (link-account)      | Show provider already linked message                 |
| 415    | Content-Type missing         | Bug — fix the fetch wrapper                          |
| 429    | Rate limited                 | Show "too many attempts, try again later"            |

### Environment Variables

| Variable                  | Required | Description                                    |
| ------------------------- | -------- | ---------------------------------------------- |
| `VITE_API_URL`            | Yes      | API base URL (`http://localhost:3000` for dev) |
| `VITE_GOOGLE_CLIENT_ID`   | Yes      | Google OAuth Web Client ID                     |
| `VITE_APPLE_SERVICES_ID`  | Yes      | Apple Services ID (web)                        |
| `VITE_APPLE_REDIRECT_URI` | Yes      | Apple callback URL for form_post redirect      |

The `VITE_` prefix is required for Vite to expose these to client-side code. None of these are secrets.

### Implementation Subtasks

1. **Project scaffolding** — Vite + React 19 + TypeScript + Tailwind CSS 4 + Shadcn/ui + TanStack Query + TanStack Router + Zod. Verify `npm run dev` serves on port 5173.
2. **Zod schemas and API client** — `zod-schemas.ts`, `auth-store.ts`, `api-client.ts` with 401 interceptor and refresh mutex. Unit tests.
3. **AuthProvider and useAuth** — React context, silent refresh on mount, user caching in `sessionStorage`. Unit tests.
4. **Google Sign-In** — `@react-oauth/google` integration, LoginPage with Google button, end-to-end flow to AuthProvider. Component tests.
5. **Apple Sign-In** — Apple JS SDK loader, nonce generation, redirect trigger, `AppleCallback` route. Component tests.
6. **Route protection** — TanStack Router layout routes, redirect logic. Component tests.
7. **Logout flow** — Logout button, API call, state cleanup, cache purge. Component tests.
8. **Silent refresh timer** — Proactive token refresh before expiry. Unit tests.
9. **E2E tests** — Playwright: full Google and Apple flows, silent refresh on page reload, logout, 401 interceptor retry.

### Validation

- Unit tests: `auth-store`, `api-client` (interceptor/mutex), Zod schemas, nonce generation
- Component tests (Vitest + Testing Library): `LoginPage`, `ProtectedRoute`, `AppleCallback`
- Playwright E2E: login flows with mocked credentials, silent refresh on reload, logout

---

## Phase 4: iOS Authentication

**Goal:** Apple + Google sign-in, Keychain token storage, auth state management in SwiftUI.

> **Note:** Phase 3 and Phase 4 can run in parallel (both depend only on Phase 2).

### Files to Create

```
ios/track-em-toys/
  Auth/
    AuthManager.swift             — @Observable, manages auth state
    AppleSignInCoordinator.swift  — ASAuthorizationController delegate
    GoogleSignInCoordinator.swift — Google Sign-In SDK wrapper
    KeychainHelper.swift          — Keychain read/write/delete wrappers
    AuthView.swift                — SwiftUI login screen
  Networking/
    APIClient.swift               — Base HTTP client with auth headers
    AuthEndpoints.swift           — /auth/signin, /auth/refresh, /auth/logout calls
```

### Apple Sign-In (Native — No SDK Needed)

Built into iOS via `AuthenticationServices` framework:

1. Generate 32 random bytes → hex-encode as `rawNonce`, SHA-256 hash as `hashedNonce`
2. Create `ASAuthorizationAppleIDProvider` + request with scopes `[.fullName, .email]`
3. Set `request.nonce = hashedNonce`
4. Present `ASAuthorizationController`
5. In delegate: extract `appleIDCredential.identityToken` (Data → UTF-8 String = `id_token`)
6. `fullName` and `email` are nil on subsequent sign-ins — persist name in Keychain until confirmed saved (see Apple Name Persistence below)
7. Send `id_token` + `rawNonce` to `POST /auth/signin`

### Google Sign-In (Requires SDK)

- Add `GoogleSignIn` SPM package
- Configure with iOS client ID
- Call `GIDSignIn.sharedInstance.signIn(withPresenting:)` → extract `user.idToken.tokenString`
- Send to `POST /auth/signin`

### Token Storage

- Access token: in-memory (`AuthManager.accessToken`)
- Refresh token: iOS Keychain via `Security` framework (`SecItemAdd`/`SecItemCopyMatching`/`SecItemDelete`)
- NOT UserDefaults, NOT SwiftData

### Auth State

```swift
@Observable
final class AuthManager: Sendable {
    var currentUser: User?
    var isAuthenticated: Bool { currentUser != nil }
    var isLoading: Bool = true  // during initial refresh on launch

    func signInWithApple(idToken: String, userInfo: AppleUserInfo?) async throws
    func signInWithGoogle(idToken: String) async throws
    func refreshAccessToken() async throws
    func signOut() async
}
```

App root switches between `AuthView` and `MainTabView` based on `authManager.isAuthenticated`.

### Apple Name Persistence

Apple sends `fullName` only on the very first authorization. If the `POST /auth/signin` request fails after Apple delivers the name, the name is lost permanently. Mitigation:

- **iOS:** Immediately persist `fullName` to Keychain after receiving it from `ASAuthorizationAppleIDCredential`. Only delete from Keychain after the API confirms the user was created with a `display_name`.
- **Web:** Store `fullName` in `sessionStorage` after receiving it from Apple's `form_post` callback. Clear after successful `/auth/signin` response.
- **API:** The `user_info.name` field in `POST /auth/signin` is optional. If the user already exists and has no `display_name`, accept and save it on subsequent sign-ins too (idempotent upsert).

### Validation

- Unit test `AuthManager` with mock `APIClient`
- XCUITest: tap "Sign in with Apple," verify system sheet appears
- Test Keychain operations with XCTest

---

## Phase 5: Account Linking, Webhooks, and Hardening

### Account Linking

For Apple private relay users (`@privaterelay.appleid.com`) who can't be auto-linked by email:

- "Link Account" option in user settings (web + iOS)
- Flow: user is signed in → taps "Link Google Account" → Google sign-in → sends `id_token` to `POST /auth/link-account`

### Apple Webhook Endpoint

**POST /auth/webhooks/apple** — Verify JWT signature with Apple's JWKS

| Event             | Action                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `consent-revoked` | Revoke all refresh tokens for that Apple oauth_account                                                                |
| `account-delete`  | Set `users.deactivated_at`, revoke tokens, log event, schedule hard delete after 30 days (see Data Retention section) |

### Refresh Token Reuse Detection

> **Note:** Already implemented in Phase 2 (`POST /auth/refresh`). If a revoked token is presented → revoke ALL refresh tokens for that user (possible token theft) + log `token_reuse_detected` event to `auth_events`. The refresh endpoint rate limit is keyed by token hash (not just IP) to prevent bypass via IP rotation.

### Cleanup Jobs

Scheduled tasks (pg_cron or application-level).

> **Batching:** For tables that grow large (`auth_events`, `refresh_tokens`), use batched deletes to avoid long-running locks: `DELETE FROM ... WHERE ctid IN (SELECT ctid FROM ... LIMIT 10000)` in a loop until zero rows affected. Consider partitioning `auth_events` by month if volume exceeds ~1M rows/month.

**Refresh token cleanup (60 days):**

```sql
DELETE FROM refresh_tokens
WHERE (expires_at < NOW() - INTERVAL '60 days')
   OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '60 days');
```

**Auth events cleanup (90 days):**

```sql
DELETE FROM auth_events WHERE created_at < NOW() - INTERVAL '90 days';
```

**raw_profile cleanup (30 days):**

> **Note:** As of Phase 2, `raw_profile` only stores whitelisted fields (`sub`, `email_verified`), not full OAuth claims. This cleanup job is still useful for data minimization but the PII risk is significantly reduced.

```sql
UPDATE oauth_accounts SET raw_profile = NULL
WHERE raw_profile IS NOT NULL AND created_at < NOW() - INTERVAL '30 days';
```

**Deactivated account hard delete (30-day grace period):**

```sql
DELETE FROM users
WHERE deactivated_at IS NOT NULL AND deactivated_at < NOW() - INTERVAL '30 days';
```

### Security Hardening

Already implemented in Phase 2:

- ✅ Rate limiting on all auth endpoints (per-IP for signin, per-user for link-account, per-token-hash for refresh)
- ✅ Refresh token rotation on every use with reuse detection
- ✅ ES256 asymmetric JWT signing with `kid` header for zero-downtime key rotation
- ✅ Auth event audit log for incident investigation and token reuse detection
- ✅ Input validation with `maxLength` constraints on all request fields
- ✅ `raw_profile` PII minimization (whitelisted fields only)
- ✅ Display name sanitization (control characters stripped)
- ✅ CORS origin validation (rejects `*` with credentials)
- ✅ `trustProxy` configuration for correct IP resolution behind reverse proxies
- ✅ Transaction error handling via `HttpError` (no `reply.send()` or `reply.jwtSign()` inside transactions)
- ✅ `Content-Type: application/json` enforcement on all POST `/auth/*` endpoints (blocks CSRF via form submission)
- ✅ httpOnly cookie for refresh token (`Secure; SameSite=Strict; path=/auth`)
- ✅ Logout token ownership verification (prevents revoking another user's token)
- ✅ Deactivation checks on all race-condition fallback paths
- ✅ JWT signing deferred to after transaction COMMIT (decouples HTTP/JWT from DB lifecycle)
- ✅ Debug-level logging for JWT verification failures (aids troubleshooting without leaking info to clients)

Remaining for Phase 5:

- `Referer`/`Origin` header check as defense-in-depth

---

## Credential Acquisition Checklist

Before implementation begins:

- [ ] Apple Developer account (paid, $99/year)
- [ ] Apple App ID with "Sign in with Apple" capability
- [ ] Apple Services ID for web (configure domain + return URL)
- [ ] Apple Sign-In key (.p8 file) — one-time download, store securely
- [ ] Apple Team ID + Key ID from Developer portal
- [ ] Google Cloud project with OAuth consent screen
- [ ] Google OAuth 2.0 Client ID (Web) — with authorized origins/redirects
- [ ] Google OAuth 2.0 Client ID (iOS) — with Bundle ID
- [ ] ES256 key pair: `openssl ecparam -genkey -name prime256v1 -noout -out jwt-private.pem && openssl ec -in jwt-private.pem -pubout -out jwt-public.pem`
- [ ] Local PostgreSQL instance for development

---

## Implementation Sequence

```
Phase 1 ──→ Phase 2 ──→ Phase 3 (web) ──→ Phase 5
                    └──→ Phase 4 (iOS) ──┘
```

Phases 3 and 4 can run in parallel since both depend only on the API (Phase 2).

---

## Key Reference Files

| File                                                                                 | Purpose                                                                            |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `docs/decisions/Architecture_Research_for_Toy_Collection_Catalog_and_Pricing_App.md` | Auth schema, token strategy, RLS patterns, provider quirks                         |
| `docs/requirements/Toy_Collection_Catalog_Requirements_v1_0.md`                      | Functional requirements, implementation phases                                     |
| `docs/decisions/Frontend_Framework_Recommendation_2026.md`                           | Web stack decisions (React 19, Shadcn/ui, TanStack Query)                          |
| `CLAUDE.md`                                                                          | Project constraints (no pbxproj edits, Swift 6, migration conventions, .env rules) |
