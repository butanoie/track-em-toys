# User Authentication Implementation Plan

**Date:** 2026-02-22
**Status:** Draft
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

- `api/migrations/001_create_users.sql`
- `api/migrations/002_create_oauth_accounts.sql`
- `api/migrations/003_create_refresh_tokens.sql`
- `api/migrations/004_rls_session_context.sql`
- `api/migrations/005_create_auth_events.sql`

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

| Data | Retention | Mechanism |
|------|-----------|-----------|
| `users` rows | Until account deletion request | Hard delete via API or Apple webhook |
| `oauth_accounts.raw_profile` | 30 days after account creation | Application-level cleanup job nullifies the column |
| `refresh_tokens` (expired/revoked) | 60 days after expiry/revocation | Scheduled cleanup job (Phase 5) |
| `auth_events` | 90 days | Scheduled cleanup job; extend if compliance requires longer |
| `device_info` on refresh_tokens | Bounded by token cleanup (60 days) | Deleted with the parent refresh_token row |

### Account Deletion Procedure

When a user requests deletion (or Apple sends `account-delete` webhook):
1. Set `users.deactivated_at = NOW()` — immediately blocks auth middleware
2. Revoke all active refresh tokens for the user
3. Log `account_deactivated` event in `auth_events`
4. Schedule hard delete of `users` row after a 30-day grace period (allows undo)
5. `ON DELETE CASCADE` automatically removes `oauth_accounts` and `refresh_tokens`
6. `ON DELETE SET NULL` on `auth_events` preserves audit trail with `user_id = NULL`

### `raw_profile` Cleanup

The `oauth_accounts.raw_profile` JSONB column stores the full provider response on first sign-in. The application layer should:
- Only read `sub`, `email`, `email_verified`, `name`, and `picture` from the payload at sign-in time
- A scheduled job nullifies `raw_profile` on rows older than 30 days:
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
    index.ts               — Entry point
    server.ts              — Fastify instance, plugin registration
    config.ts              — Env var loading + validation
    db/
      pool.ts              — pg Pool singleton
      queries.ts           — Parameterized SQL query functions
    auth/
      routes.ts            — Auth route registration
      apple.ts             — Apple id_token verification + client secret gen
      google.ts            — Google id_token verification
      tokens.ts            — Refresh token creation/rotation, SHA-256 hashing
      key-store.ts         — ES256 key loading, kid→public key map for rotation
      jwks.ts              — GET /.well-known/jwks.json (jose exportJWK)
      schemas.ts           — JSON Schema for request/response validation
    hooks/
      set-user-context.ts  — onRequest: SET app.user_id for RLS
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
8. Generate 15-min access JWT (ES256) + 30-day refresh token (random 32 bytes, SHA-256 hashed in DB)
9. Log `signin` event to `auth_events` with IP and user-agent

> **Transaction requirement:** Steps 3–9 must execute within a single database transaction. If any step fails, roll back to prevent orphaned records (e.g., user created without oauth_account). Use `pg` client's `BEGIN`/`COMMIT`/`ROLLBACK` via a dedicated client from the pool.

> **Concurrent first-login:** Two simultaneous first-login requests for the same provider user will race to step 6. Use `INSERT INTO oauth_accounts ... ON CONFLICT (provider, provider_user_id) DO NOTHING RETURNING *`. If the insert returns no row, retry the lookup (step 3) to find the row created by the other request.

**POST /auth/refresh** — Rate limit: 5/min per IP
```
Request:  { refresh_token: string }
Response: { access_token, refresh_token }
```
Flow: Hash token → find in DB (not revoked, not expired) → revoke old → create new (rotation) → issue new access JWT. Revoke + create must be atomic (single transaction).

**POST /auth/logout** — Requires valid access token
```
Request:  { refresh_token: string }
Response: 204 No Content
```

**POST /auth/link-account** — Requires valid access token, rate limit: 5/min per user
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
    private: keyStore.getPrivateKey(),  // current signing key PEM
    public: async (request, token) => {
      const { kid } = token.header
      return keyStore.getPublicKey(kid)  // returns PEM for the matching kid
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
})

// Signing: const token = await reply.jwtSign({ sub: userId })
// Verifying: await request.jwtVerify() → sets request.user
```

**`jose`** provides the JWKS endpoint for external verification:
```typescript
// Expose public keys as JWKS for service-to-service verification
import { exportJWK } from 'jose'

fastify.get('/.well-known/jwks.json', async () => {
  const jwk = await exportJWK(publicKey)
  return { keys: [{ ...jwk, kid: process.env.JWT_KEY_ID, alg: 'ES256', use: 'sig' }] }
})
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
- Rejects tokens from deactivated users: check `users.deactivated_at IS NOT NULL` with a short-TTL in-memory cache (60s) to avoid a DB query on every request. Cache is invalidated when `deactivated_at` is set via the deactivation endpoint.
- Returns 401 if missing/invalid/expired

### RLS Context Hook

- `onRequest` hook after auth middleware on DB-accessing routes
- Executes `SELECT set_config('app.user_id', $1, true)` with `request.user.id`

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
```

### Validation

- `curl` / `httpie` against all 4 endpoints
- Unit tests for `apple.ts` and `google.ts` with mocked JWKS
- Integration tests with `fastify.inject()` + `testcontainers` PostgreSQL

---

## Phase 3: Web SPA Authentication

**Goal:** Login page, token management, protected routes in the React 19 + Vite app.

### Key Libraries

```
@react-oauth/google ^0.12   react-router ^7   @tanstack/react-query ^5
```

Apple Sign-In on web: Apple JS SDK via script tag (no React wrapper exists).

### Directory Structure

```
web/src/
  auth/
    AuthProvider.tsx         — React context: user state, login/logout
    useAuth.ts               — Hook to access auth context
    LoginPage.tsx            — Apple + Google sign-in buttons
    AuthCallback.tsx         — Apple web redirect handler (form_post)
    ProtectedRoute.tsx       — Redirect to login if unauthenticated
    token-storage.ts         — Access token in memory, refresh token in httpOnly cookie
  api/
    client.ts                — Fetch wrapper with auto-refresh on 401
```

### Token Storage Strategy

**httpOnly cookies for refresh token (recommended):**
- API sets `refresh_token` as `httpOnly; Secure; SameSite=Strict` cookie
- Access token stored in memory only (AuthProvider state variable)
- On page refresh: call `POST /auth/refresh` (cookie sent automatically) to get fresh access token
- XSS-proof: refresh token invisible to JavaScript

**Auto-refresh pattern in `client.ts`:**
- Intercept 401 responses → call `/auth/refresh` → retry original request
- Request queue prevents concurrent refresh calls
- If refresh fails → redirect to login

### Apple Sign-In on Web

Apple uses a redirect flow (not popup). User goes to Apple, authenticates, Apple POSTs `id_token` back to a callback URL. `AuthCallback.tsx` extracts the token and sends to `POST /auth/signin`.

### Google Sign-In on Web

`@react-oauth/google` `GoogleLogin` component → on success, extract `credentialResponse.credential` (the `id_token`) → send to `POST /auth/signin`.

### Validation

- Component tests with mocked API client
- Test auto-refresh interceptor (mock 401 → refresh → retry)
- Playwright E2E: login flow with mocked network layer

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

| Event | Action |
|-------|--------|
| `consent-revoked` | Revoke all refresh tokens for that Apple oauth_account |
| `account-delete` | Set `users.deactivated_at`, revoke tokens, log event, schedule hard delete after 30 days (see Data Retention section) |

### Refresh Token Reuse Detection

If a revoked token is presented → revoke ALL refresh tokens for that user (possible token theft) + log `token_reuse_detected` event to `auth_events`.

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

- Rate limiting on all auth endpoints (configured in Phase 2)
- `Content-Type: application/json` enforcement (blocks CSRF via form submission)
- `Referer`/`Origin` header check as defense-in-depth
- Refresh token rotation on every use
- ES256 asymmetric JWT signing with `kid` header for zero-downtime key rotation
- Auth event audit log for incident investigation and token reuse detection

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

| File | Purpose |
|------|---------|
| `docs/Architecture_Research_for_Toy_Collection_Catalog_and_Pricing_App.md` | Auth schema, token strategy, RLS patterns, provider quirks |
| `docs/Toy_Collection_Catalog_Requirements_v1_0.md` | Functional requirements, implementation phases |
| `docs/Frontend_Framework_Recommendation_2026.md` | Web stack decisions (React 19, Shadcn/ui, TanStack Query) |
| `CLAUDE.md` | Project constraints (no pbxproj edits, Swift 6, migration conventions, .env rules) |
