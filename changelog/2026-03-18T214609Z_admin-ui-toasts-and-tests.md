# Admin UI — Toast Notifications & Comprehensive Mutation Tests

**Date:** 2026-03-18
**Time:** 21:46:09 UTC
**Type:** Feature
**Phase:** 1.5b (User Roles & Admin)
**Version:** v0.1.0

## Summary

Added Sonner toast notifications to the admin user management dashboard for all four mutation operations (role change, deactivate, reactivate, GDPR purge). Implemented a split error strategy: business-logic rejections (400/403/404/409) display persistent ErrorBanners, while transient errors show auto-dismissing toasts. Added comprehensive tests at unit, component, and E2E layers.

---

## Changes Implemented

### 1. Toast Notification Infrastructure

Installed Sonner via Shadcn CLI and mounted `<Toaster />` in the root layout. Fixed CLI-generated file to remove `next-themes` dependency (not applicable to Vite projects) and circular self-import.

**Created:**

- `web/src/components/ui/sonner.tsx` — Sonner `<Toaster>` wrapper with Tailwind oklch theme tokens

**Modified:**

- `web/src/routes/__root.tsx` — Mount `<Toaster />` inside `AuthProvider`, sibling of `ErrorBoundary`

### 2. Error Classification & Toast Integration

Added `isBannerError()` type predicate to classify API errors into persistent (banner) vs transient (toast) channels. Refactored `getMutationErrorMessage()` to delegate to `isBannerError()` for DRY status-code classification.

Updated `handleConfirm()` in `AdminUsersPage` to fire success toasts per mutation type and route errors to the appropriate channel. The purge dialog stays open on transient errors to preserve the typed "DELETE" confirmation input.

**Modified:**

- `web/src/admin/users/types.ts` — Added `isBannerError()`, refactored `getMutationErrorMessage()`
- `web/src/admin/users/AdminUsersPage.tsx` — Toast calls in `handleConfirm()`, functional `setPendingAction` update
- `web/src/admin/components/ConfirmDialog.tsx` — Removed trivial pass-through wrapper (code simplification)

### 3. Comprehensive Test Coverage

**Created:**

- `web/src/admin/__tests__/getMutationErrorMessage.test.ts` — 15 unit tests for `isBannerError` + `getMutationErrorMessage`
- `web/src/admin/__tests__/useAdminUserMutations.test.ts` — 7 hook tests for all 4 mutations (API calls, cache invalidation, error propagation)

**Modified:**

- `web/src/admin/__tests__/ConfirmDialog.test.tsx` — +2 tests (input reset on reopen, custom confirmLabel)
- `web/src/admin/__tests__/AdminUsersPage.test.tsx` — +11 tests (toast messages, ErrorBanner for 403/409, transient error toasts, dialog close/stay-open behavior)
- `web/e2e/admin-users.spec.ts` — +6 E2E tests (4 happy-path mutations, 2 error smoke tests)

---

## Technical Details

### Error Handling Matrix

| Error Condition          | Display Channel          | Dialog Behavior |
| ------------------------ | ------------------------ | --------------- |
| Success                  | `toast.success(message)` | Closes          |
| 400/403/404/409          | ErrorBanner (persistent) | Closes          |
| Transient + purge action | `toast.error(message)`   | Stays open      |
| Transient + other action | `toast.error(message)`   | Closes          |

### Key Design Decisions

- **No optimistic updates** — Admin mutations have server-side guards (last-admin protection, role escalation prevention) that make rejection plausible; post-success cache invalidation is safer
- **Purge dialog stays open on transient errors** — The `ConfirmDialog`'s `useEffect` resets the type-to-confirm input on `open` change; closing on a network error would force the admin to retype "DELETE"
- **Functional `setPendingAction` update** — Avoids stale closure in the `onError` callback that captures `pendingAction` at `handleConfirm` call time

---

## Validation & Testing

### Unit Tests

- 208 total (23 files) — all passing
- New: 35 tests across 2 new files + 3 extended files

### E2E Tests

- 23 total — all passing
- New: 6 tests (4 happy-path mutations + 2 error smoke tests)
- E2E toast assertions use `[data-sonner-toast]` scoped locators to avoid false positives

### Build & Lint

- TypeScript: zero errors
- ESLint: zero warnings
- Prettier: all files formatted
- Vite build: successful

---

## Impact Assessment

- Admin users now get immediate visual feedback for all mutation operations
- Error handling is clearer: business-logic rejections are persistent and readable; transient errors are non-intrusive
- Test coverage now spans the full mutation lifecycle from API client through UI feedback

---

## Related Files

**Created (3):**

- `web/src/components/ui/sonner.tsx`
- `web/src/admin/__tests__/getMutationErrorMessage.test.ts`
- `web/src/admin/__tests__/useAdminUserMutations.test.ts`

**Modified (7):**

- `web/src/routes/__root.tsx`
- `web/src/admin/users/types.ts`
- `web/src/admin/users/AdminUsersPage.tsx`
- `web/src/admin/components/ConfirmDialog.tsx`
- `web/src/admin/__tests__/ConfirmDialog.test.tsx`
- `web/src/admin/__tests__/AdminUsersPage.test.tsx`
- `web/e2e/admin-users.spec.ts`

**Dependencies:**

- Added: `sonner@^2.0.7`
- Removed: `next-themes@^0.4.6` (unused, pulled in by Shadcn CLI)

---

## Summary Statistics

- 3 files created, 7 files modified
- 35 new unit/component tests, 6 new E2E tests
- 1 npm dependency added, 1 removed
- 0 lint warnings, 0 type errors

---

## Status

✅ COMPLETE
