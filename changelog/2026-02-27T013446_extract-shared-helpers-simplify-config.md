# Extract Shared Helpers & Simplify Config Parsing

**Date:** 2026-02-27
**Time:** 01:34:46 PST
**Type:** Refactor
**Phase:** 1.2 — API Authentication

## Summary

Deduplicated repeated patterns in the API auth routes by extracting shared helpers for User-Agent sanitization, provider token verification with error reply, JWT access token signing, and integer config parsing. Moved `readSignedCookie` into `cookies.ts` for better module cohesion. Updated root `CLAUDE.md` with detailed web conventions and ESLint rule documentation.

---

## Changes Implemented

### 1. Auth Route Helper Extraction (`api/src/auth/routes.ts`)

Three duplicated code patterns were consolidated into reusable helpers:

**`sanitizeUserAgent(request, maxLength)`** — Replaced two nearly-identical functions (`getUserAgent` and `getRawUserAgent`) that duplicated the same regex sanitization logic with different truncation lengths. Both now delegate to a single parameterized helper.

**`verifyProviderTokenOrReply(provider, idToken, nonce, log, reply)`** — Extracted the try/catch pattern for provider token verification that was copy-pasted in both `/signin` and `/link-account` routes. Returns `ProviderClaims | null`; sends the 401/503 reply internally, so callers just check `if (!claims) return`.

**`signAccessToken(reply, userId, log, operation)`** — Extracted the JWT signing try/catch block that was duplicated in `/signin` and `/refresh`. Returns the signed token string or throws a plain `Error` for the global handler.

### 2. Refresh Token Extraction Simplification (`api/src/auth/routes.ts`)

Rewrote `extractRefreshToken()` body-parsing logic from a deeply-nested ternary expression into a sequential if-guard pattern, improving readability while preserving identical runtime behavior.

### 3. Cookie Helper Relocation (`api/src/auth/cookies.ts`)

Moved `readSignedCookie()` from `routes.ts` into `cookies.ts` — it's a cookie concern, not a route concern. This improves module cohesion and makes the helper available to future cookie consumers without importing the entire routes module.

### 4. Config Parsing (`api/src/config.ts`)

**`optionalInt(name, fallback, min, max)`** — Extracted the integer parsing + range validation pattern that was duplicated for `PORT` and `DB_POOL_MAX` into a reusable helper. Error message format was standardized to `"${name} must be a number between ${min} and ${max}, got: ${raw}"`.

### 5. Explicit Return Types (`api/src/index.ts`)

Added `Promise<void>` return type annotations to `main()` and `startup()` — previously inferred, now explicit for clarity and to satisfy stricter lint rules.

### 6. CLAUDE.md Documentation (`CLAUDE.md`)

- Expanded ESLint route-file override documentation (added `react-refresh/only-export-components` note)
- Replaced vague "relax unsafe-* and assertion rules" with the full list of relaxed rules for test files
- Added new **Web Project Conventions** section documenting path aliases, auth strategy, token storage, vitest config separation, and QueryClient instantiation pattern

---

## Technical Details

### Before/After: User-Agent Sanitization

```typescript
// Before: two functions with identical logic, different constants
function getUserAgent(request: FastifyRequest): string | null {
  const ua = request.headers['user-agent']
  if (typeof ua !== 'string') return null
  return ua.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, MAX_DEVICE_INFO_LENGTH) || null
}
function getRawUserAgent(request: FastifyRequest): string | null {
  const ua = request.headers['user-agent']
  if (typeof ua !== 'string') return null
  return ua.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, MAX_AUDIT_USER_AGENT_LENGTH) || null
}

// After: single parameterized helper
function sanitizeUserAgent(request: FastifyRequest, maxLength: number): string | null {
  const ua = request.headers['user-agent']
  if (typeof ua !== 'string') return null
  return ua.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maxLength) || null
}
function getUserAgent(request: FastifyRequest): string | null {
  return sanitizeUserAgent(request, MAX_DEVICE_INFO_LENGTH)
}
function getRawUserAgent(request: FastifyRequest): string | null {
  return sanitizeUserAgent(request, MAX_AUDIT_USER_AGENT_LENGTH)
}
```

### Before/After: Config Integer Parsing

```typescript
// Before: inline IIFE for DB_POOL_MAX, separate block for PORT
const rawPort = optional('PORT', '3000')
const parsedPort = parseInt(rawPort, 10)
if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(`PORT must be a valid port number (1–65535), got: ${rawPort}`)
}
poolMax: (() => {
  const raw = optional('DB_POOL_MAX', '20')
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < 1 || n > 1000) throw new Error(...)
  return n
})(),

// After: single reusable helper
const parsedPort = optionalInt('PORT', 3000, 1, 65535)
poolMax: optionalInt('DB_POOL_MAX', 20, 1, 1000),
```

### Provider Token Verification Pattern

```typescript
// Before (duplicated in /signin and /link-account):
let claims: ProviderClaims
try {
  claims = await verifyProviderToken(provider, id_token, nonce)
} catch (err) {
  if (err instanceof ProviderVerificationError) {
    return reply.code(401).send({ error: 'Invalid provider token' })
  }
  if (isNetworkError(err)) {
    fastify.log.error({ err }, '...')
    return reply.code(503).send({ error: 'Authentication service unavailable' })
  }
  throw err
}

// After:
const claims = await verifyProviderTokenOrReply(provider, id_token, nonce, fastify.log, reply)
if (!claims) return
```

---

## Validation & Testing

- Config test assertions updated for new error message format (`"must be a number between"` replaces `"must be a valid port number"`)
- No behavioral changes — all extractions are pure refactors preserving identical runtime behavior
- 6 files changed, +133 / −115 lines (net +18 lines, mostly documentation)

---

## Impact Assessment

- **Maintainability:** Eliminated three copy-paste patterns that would need synchronized updates. Future auth routes automatically get consistent error handling via `verifyProviderTokenOrReply`.
- **Module cohesion:** `readSignedCookie` now lives with other cookie helpers, not buried in a 800-line routes file.
- **Documentation:** CLAUDE.md now precisely documents which ESLint rules are relaxed in test files and web project conventions, reducing ambiguity for future contributors.

---

## Related Files

| File | Action |
|---|---|
| `api/src/auth/routes.ts` | Modified — extracted 3 helpers, simplified extractRefreshToken |
| `api/src/auth/cookies.ts` | Modified — received readSignedCookie from routes.ts |
| `api/src/config.ts` | Modified — extracted optionalInt helper |
| `api/src/config.test.ts` | Modified — updated error message assertions |
| `api/src/index.ts` | Modified — explicit return types on main/startup |
| `CLAUDE.md` | Modified — web conventions, ESLint rule details |

---

## Status

✅ COMPLETE
