# Apple Server-to-Server Webhooks for Sign in with Apple Compliance

**Date:** 2026-03-10
**Time:** 14:17:14 AEDT
**Type:** Feature Addition
**Phase:** Phase 5 — Account Linking, Webhooks, and Hardening
**Version:** v0.5.0

## Summary

Implemented the Apple server-to-server webhook endpoint (`POST /auth/webhooks/apple`) that receives signed JWT notifications from Apple when a user revokes consent or deletes their Apple ID. The endpoint verifies JWT signatures against Apple's JWKS, dispatches event-specific mutations (token revocation, user deactivation), and always returns 200 to prevent retry storms. Includes 16 integration tests with ephemeral EC key pairs.

---

## Changes Implemented

### 1. Webhook Endpoint

**Created:**

- `api/src/auth/webhooks.ts` — Fastify plugin implementing `POST /auth/webhooks/apple`

**Key behaviors:**

- Accepts raw JWT string body (not JSON) via custom content-type parser
- Verifies JWT signature against Apple's JWKS (`https://appleid.apple.com/auth/keys`)
- Validates issuer (`https://appleid.apple.com`) and audience (bundle ID or services ID)
- Parses the `events` claim (JSON string inside the JWT) with type guard validation
- Dispatches to event-specific handlers within a `withTransaction` call
- Rate limited: 30 req/min per IP

**Event types handled:**

| Event             | Action                                      | Audit Event Type      |
| ----------------- | ------------------------------------------- | --------------------- |
| `consent-revoked` | Revoke all user refresh tokens              | `consent_revoked`     |
| `account-delete`  | Deactivate user + revoke all refresh tokens | `account_deactivated` |

Unknown event types are logged at debug level and ignored (returns 200).

### 2. Database Migration

**Created:**

- `api/db/migrations/010_add_consent_revoked_event_type.sql` — Adds `consent_revoked` to the `auth_events.event_type` CHECK constraint (with rollback)

### 3. Query Functions

**Modified:**

- `api/src/db/queries.ts` — Added `deactivateUser(client, userId)` function that sets `users.deactivated_at = NOW()`

### 4. Schema & Types

**Modified:**

- `api/src/auth/schemas.ts` — Added `appleWebhookSchema` with response schemas for 200 and 401
- `api/src/types/index.ts` — Added `'consent_revoked'` to `AuthEventType` union

### 5. Server Integration

**Modified:**

- `api/src/server.ts` — Mounted `appleWebhookRoute` at `/auth/webhooks/apple` as a separate plugin, registered before `authRoutes` to avoid the JSON content-type enforcement hook

### 6. Integration Tests

**Created:**

- `api/src/auth/webhooks.test.ts` — 16 integration tests (598 lines)

---

## Technical Details

### Why a Separate Plugin?

The main `authRoutes` plugin enforces `Content-Type: application/json` via a `preValidation` hook. Apple sends webhook payloads as raw JWT strings with no JSON content type. Mounting the webhook as a separate Fastify plugin with its own `addContentTypeParser('*', ...)` cleanly sidesteps this without weakening JSON enforcement for all other auth routes.

### Idempotent 200 Responses

Apple retries failed webhook deliveries aggressively. The endpoint always returns `{ ok: true }` with status 200, even when:

- The user doesn't exist (Apple `sub` not found in `oauth_accounts`)
- An unexpected error occurs during JWT verification (e.g., JWKS fetch failure)
- An unknown event type is received

Only explicit JWT validation failures (bad signature, expired, wrong issuer/audience) return 401.

### Audience Validation

Apple sends either the bundle ID (native iOS sign-in) or the services ID (web Sign in with Apple JS) as the `aud` claim, depending on which platform the user originally signed in from. Both are accepted via `getAllowedAudiences()`.

### Audit Log Resilience

Audit logging (`logAuthEvent`) is wrapped in try/catch within the transaction. If audit logging fails, the security-critical mutation (token revocation / user deactivation) still commits. Failures are logged at `error` level with descriptive messages.

### Transaction Context

`withTransaction` is called without a `userId` parameter because the webhook is unauthenticated — there's no RLS context to set. The `oauth_accounts` and `users` tables are queried without RLS filtering (they use provider + provider_user_id lookups, not user_id).

---

## Validation & Testing

### Test Coverage (16 tests)

| Category         | Tests | Details                                                                         |
| ---------------- | ----- | ------------------------------------------------------------------------------- |
| Happy path       | 2     | consent-revoked and account-delete with full assertion chain                    |
| JWT validation   | 6     | Invalid signature, expired, wrong issuer, wrong audience (×2), malformed events |
| Event structure  | 2     | Missing type/sub fields, non-string events claim                                |
| Unknown user     | 1     | Returns 200 when Apple sub not found (idempotent)                               |
| Unknown event    | 1     | Returns 200, no side effects                                                    |
| Audit resilience | 2     | Non-fatal audit log failure for each event type                                 |
| Transaction      | 1     | Verifies withTransaction called without userId                                  |
| Edge cases       | 2     | Empty payload rejection, services ID as valid audience                          |

### Test Strategy

- Ephemeral EC (P-256) key pairs generated per test run
- Jose `createRemoteJWKSet` mocked to return local key set
- Full integration tests via `fastify.inject()` (not unit tests)
- Mock assertions verify exact query arguments and call order

---

## Impact Assessment

- **App Store compliance** — Apple requires apps using Sign in with Apple to handle server-to-server notifications for consent revocation and account deletion
- **User privacy** — When a user revokes consent, all sessions are immediately invalidated; when Apple deletes an account, the user is deactivated and all sessions revoked
- **Operational safety** — Idempotent 200 responses prevent Apple retry storms; audit log failures don't block security-critical mutations
- **Future work** — User deactivation sets `deactivated_at` but hard deletion (30-day grace period) is deferred to a scheduled cleanup job in a later phase

---

## Related Files

**Created (2 files):**

- `api/src/auth/webhooks.ts` (168 lines)
- `api/src/auth/webhooks.test.ts` (598 lines)

**Modified (5 files):**

- `api/src/auth/schemas.ts` — webhook response schema
- `api/src/db/queries.ts` — `deactivateUser` function
- `api/src/types/index.ts` — `consent_revoked` event type
- `api/src/server.ts` — webhook plugin registration
- `api/db/schema.sql` — updated CHECK constraint

**Migration (1 file):**

- `api/db/migrations/010_add_consent_revoked_event_type.sql`

---

## Summary Statistics

| Metric              | Value                               |
| ------------------- | ----------------------------------- |
| Files created       | 2                                   |
| Files modified      | 5                                   |
| Migration files     | 1                                   |
| Total lines added   | ~846                                |
| Integration tests   | 16                                  |
| Test lines          | 598                                 |
| Event types handled | 2 (consent-revoked, account-delete) |

---

## Status

✅ COMPLETE
