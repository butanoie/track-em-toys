# Session Expired Toast — Graceful Mid-Session Expiry UX

**Date:** 2026-04-01
**Time:** 23:48:05 UTC
**Type:** Bug Fix
**Phase:** 1.3 (Web SPA Auth)
**Version:** v1.3.1

## Summary

Fixed a UX issue where expired refresh tokens mid-session silently cleared curator-only UI controls (e.g., photo management) without any user notification. The app now shows a persistent Sonner toast with a "Sign in" action button instead of silently stripping permissions or performing a jarring redirect to login.

---

## Changes Implemented

### 1. Session Expired State in Auth Context

Added `sessionExpired` boolean to `AuthContextValue`. Set to `true` when a proactive refresh cycle or 401 interceptor detects an expired session. Reset to `false` on successful re-login.

**Modified:**

- `web/src/auth/AuthProvider.tsx` — Added `sessionExpired` state, persistent Sonner toast on both expiry paths (`handleRefreshCycle` and `handleSessionExpired`), toast dismissal on sign-in

### 2. Route Guard Behavior

Updated `_authenticated.tsx` to skip login redirect when `sessionExpired` is true, allowing users to continue browsing public catalog data with the toast visible.

**Modified:**

- `web/src/routes/_authenticated.tsx` — Added `sessionExpired` check to redirect guard and render condition

### 3. Test Coverage

Added 3 new tests and updated existing tests for the new behavior.

**Modified:**

- `web/src/auth/__tests__/AuthProvider.test.tsx` — Mock for `sonner`, updated session expired test (toast instead of navigate), added `sessionExpired` default and toast dismissal tests
- `web/src/routes/__tests__/_authenticated.test.tsx` — Added `sessionExpired` to all mocks, new test for mid-session expiry rendering Outlet
- `web/src/auth/__tests__/auth-test-helpers.tsx` — Added `session-expired` testid to `TestConsumer`
- `web/src/auth/__tests__/LoginPage.test.tsx` — Added `sessionExpired: false` to `makeAuthContext`
- `web/src/auth/__tests__/SettingsPage.test.tsx` — Added `sessionExpired: false` to `makeAuthContext`
- `web/src/components/__tests__/AppHeader.test.tsx` — Added `sessionExpired: false` to `makeAuthContext`
- `web/src/admin/__tests__/admin-test-helpers.tsx` — Added `sessionExpired: false` to `makeAdminAuthContext`

### 4. Documentation

- `web/CLAUDE.md` — Documented `sessionExpired` pattern, `SESSION_EXPIRED_TOAST_ID` deduplication, and `makeAuthContext` update requirement

---

## Technical Details

### Toast Deduplication

Both expiry paths (proactive refresh and 401 interceptor) use the same `SESSION_EXPIRED_TOAST_ID` constant. Sonner replaces toasts with the same `id`, preventing duplicate notifications if both paths fire in sequence.

### Expiry Path Differentiation

| Scenario | `sessionExpired` | Behavior |
|----------|-----------------|----------|
| Never authenticated | `false` | Redirect to `/login` |
| Session expired mid-browse | `true` | Toast shown, user keeps browsing |
| Explicit logout | `false` | Redirect to `/login` |
| Page reload with expired session | `false` | Redirect to `/login` |

---

## Validation & Testing

```
Typecheck: Zero errors
Tests:     98 files, 731 tests passed
Lint:      Zero warnings
```

---

## Impact Assessment

- **User experience:** Curators browsing the catalog no longer lose their place when a session expires — they see a clear toast with a "Sign in" button
- **Auth flow:** No change to the security model — auth state is still properly cleared, just the UI response is gentler
- **Test maintenance:** Future `AuthContextValue` field additions must update `makeAuthContext` helpers (documented)

---

## Related Files

| File | Action |
|------|--------|
| `web/src/auth/AuthProvider.tsx` | Modified |
| `web/src/routes/_authenticated.tsx` | Modified |
| `web/src/auth/__tests__/AuthProvider.test.tsx` | Modified |
| `web/src/routes/__tests__/_authenticated.test.tsx` | Modified |
| `web/src/auth/__tests__/auth-test-helpers.tsx` | Modified |
| `web/src/auth/__tests__/LoginPage.test.tsx` | Modified |
| `web/src/auth/__tests__/SettingsPage.test.tsx` | Modified |
| `web/src/components/__tests__/AppHeader.test.tsx` | Modified |
| `web/src/admin/__tests__/admin-test-helpers.tsx` | Modified |
| `web/CLAUDE.md` | Modified |

## Summary Statistics

- **Files changed:** 11
- **Lines added:** ~185
- **Lines removed:** ~39
- **New tests:** 3
- **Updated tests:** 5

---

## Status

✅ COMPLETE
