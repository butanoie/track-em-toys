# Apple Sign-In Popup Migration & TLS Support

**Date:** 2026-02-27
**Time:** 18:52:56 UTC
**Type:** Feature / Refactor
**Phase:** 1.3 — Web SPA Authentication

## Summary

Migrated Apple Sign-In from a full-page redirect flow (form POST callback) to a popup-based flow (`usePopup: true`), eliminating the callback route, reducing sessionStorage usage, and simplifying nonce handling. Added optional TLS support to the API server and enabled HTTPS for the Vite dev server to satisfy Apple's HTTPS requirements for Sign in with Apple.

---

## Changes Implemented

### 1. Apple Sign-In — Redirect to Popup Migration

Replaced the redirect-based Apple OAuth flow with `usePopup: true`. The popup resolves a promise with the full `AppleSignInResponse`, keeping nonce and state in local JS variables instead of `sessionStorage`.

- `initiateAppleSignIn()` now returns `AppleSignInResult { idToken, rawNonce, userName? }` instead of `void`
- Nonce generation simplified from async SHA-256 double-hash to raw hex — Apple's JS SDK hashes internally
- CSRF state validation moved inline (compare local `state` var against popup response)
- User name extracted from first-time Apple authorization response; cached in `sessionStorage` for subsequent sign-ins
- Added typed interfaces: `AppleSignInAuthorization`, `AppleSignInUser`, `AppleSignInResponse`, `AppleSignInResult`

**Deleted:**

- `web/src/auth/AppleCallback.tsx` — redirect callback component (no longer needed)
- `web/src/auth/__tests__/AppleCallback.test.tsx` — callback test suite
- `web/src/routes/auth/apple-callback.tsx` — TanStack Router route definition

**Modified:**

- `web/src/auth/apple-auth.ts` — popup flow, typed SDK responses, simplified nonce
- `web/src/auth/LoginPage.tsx` — drive Apple sign-in via popup result
- `web/src/auth/__tests__/LoginPage.test.tsx` — updated for popup flow
- `web/src/auth/__tests__/apple-auth.test.ts` — new popup response handling tests
- `web/src/lib/auth-store.ts` — removed `appleNonce`/`appleState` session keys
- `web/src/lib/__tests__/auth-store.test.ts` — removed nonce/state key assertions
- `web/src/lib/api-client.ts` — removed `/auth/apple-callback` from auth endpoint list
- `web/src/routeTree.gen.ts` — removed `AuthAppleCallbackRoute`

### 2. API TLS Support

Added optional TLS configuration so the API server can terminate HTTPS directly (useful for local dev with mkcert or direct TLS termination in production).

**Modified:**

- `api/src/config.ts` — added `tls.certFile` / `tls.keyFile` optional config fields
- `api/src/config.test.ts` — tests for both-set, neither-set, and mismatched TLS vars
- `api/src/server.ts` — read cert/key files and pass HTTPS options to Fastify when configured
- `api/.env.example` — documented `TLS_CERT_FILE` / `TLS_KEY_FILE` vars

### 3. Vite HTTPS Dev Server

Configured the Vite dev server to serve over HTTPS using mkcert certificates, bound to `dev.track-em-toys.com`.

**Modified:**

- `web/vite.config.ts` — added `fs` import, `server.https` with cert/key, `host: 'dev.track-em-toys.com'`

### 4. Infrastructure

- `.gitignore` — added `.certs/` directory exclusion

---

## Technical Details

### Popup vs Redirect Flow

| Aspect         | Before (Redirect)                                        | After (Popup)                                   |
| -------------- | -------------------------------------------------------- | ----------------------------------------------- |
| OAuth delivery | Full-page redirect → form POST to `/auth/apple-callback` | Popup window → promise resolution               |
| Nonce storage  | `sessionStorage` (survives navigation)                   | Local variable (stays in memory)                |
| State/CSRF     | `sessionStorage` round-trip                              | Local variable comparison                       |
| Nonce hashing  | Client-side SHA-256 before passing to SDK                | Raw hex passed directly (SDK hashes internally) |
| Route needed   | `/auth/apple-callback` route + component                 | None                                            |
| Files          | 3 extra files (callback component, route, tests)         | 0 extra files                                   |

### Apple SDK Nonce Flow

```
Before:  raw → SHA-256(raw) → Apple SDK → JWT contains SHA-256(SHA-256(raw))  ✗ double-hash
After:   raw → Apple SDK → JWT contains SHA-256(raw)                          ✓ single-hash
```

The API's `apple-signin-auth` library hashes the nonce it receives before comparing to the JWT claim, so passing the raw nonce is correct.

### TLS Config Validation

`TLS_CERT_FILE` and `TLS_KEY_FILE` must both be set or both be unset — setting only one throws at startup to prevent misconfiguration.

---

## Validation & Testing

### Test Changes

- Deleted: `AppleCallback.test.tsx` (~150 lines of redirect callback tests)
- Added: 7 new popup response handling tests in `apple-auth.test.ts` covering:
  - Token + nonce extraction from popup response
  - CSRF state mismatch rejection
  - User name extraction from first-time authorization
  - User name caching in sessionStorage
  - Fallback to cached name on subsequent sign-ins
  - Undefined userName when no data and no cache
  - Raw nonce (not hash) passed to Apple SDK init
  - `usePopup: true` configuration verification
- Added: TLS config tests (both-set, neither-set, cert-only, key-only)
- Updated: LoginPage tests for popup-based flow

### Net File Impact

- 17 files changed, +429 / −585 lines (net −156 lines)
- 3 files deleted

---

## Impact Assessment

- **Security:** Nonce/state no longer persisted in sessionStorage — reduced attack surface. State validation is fail-closed (rejects on absence or mismatch).
- **UX:** Popup flow avoids full-page navigation — users stay on the login page throughout the sign-in process.
- **Developer Experience:** HTTPS dev server enables testing Apple Sign-In locally (Apple requires HTTPS redirect URIs). mkcert certificates work with the new `.certs/` convention.
- **Simplification:** Removed 3 files and ~156 net lines. One fewer route to maintain.

---

## Related Files

| File                                            | Action   |
| ----------------------------------------------- | -------- |
| `web/src/auth/apple-auth.ts`                    | Modified |
| `web/src/auth/LoginPage.tsx`                    | Modified |
| `web/src/auth/AppleCallback.tsx`                | Deleted  |
| `web/src/auth/__tests__/AppleCallback.test.tsx` | Deleted  |
| `web/src/auth/__tests__/LoginPage.test.tsx`     | Modified |
| `web/src/auth/__tests__/apple-auth.test.ts`     | Modified |
| `web/src/lib/auth-store.ts`                     | Modified |
| `web/src/lib/__tests__/auth-store.test.ts`      | Modified |
| `web/src/lib/api-client.ts`                     | Modified |
| `web/src/routeTree.gen.ts`                      | Modified |
| `web/src/routes/auth/apple-callback.tsx`        | Deleted  |
| `web/vite.config.ts`                            | Modified |
| `api/src/config.ts`                             | Modified |
| `api/src/config.test.ts`                        | Modified |
| `api/src/server.ts`                             | Modified |
| `api/.env.example`                              | Modified |
| `.gitignore`                                    | Modified |

---

## Status

✅ COMPLETE
