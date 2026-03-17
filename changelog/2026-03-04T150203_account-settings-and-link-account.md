# Account Settings UI with GET /auth/me and Link-Account Flow

**Date:** 2026-03-04
**Time:** 15:02:03 -0800
**Type:** Feature
**Phase:** 1.2 (API Auth) / 1.3 (Web SPA Auth)
**Version:** v0.3.0

## Summary

Added the `GET /auth/me` endpoint returning the authenticated user's profile with linked OAuth accounts, and built account settings pages on both web (React + TanStack Query) and iOS (SwiftUI). Also fixed a production bug where `linked_accounts` was always empty due to a `pg` driver type mismatch in the OAuth row type guard.

---

## Changes Implemented

### 1. GET /auth/me API Endpoint

New authenticated endpoint returning the current user's profile and linked OAuth providers.

**Route:** `GET /auth/me`
- Returns user profile fields plus a `linked_accounts` array (provider + email per account)
- Uses `fastify.authenticate` preHandler and rate-limited to 20 req/min
- Calls `findUserWithAccounts` to JOIN users with oauth_accounts in a single query
- Returns 401 if the JWT `sub` is invalid or the user is not found

**Modified:**
- `api/src/auth/routes.ts` — Added `/me` route handler
- `api/src/auth/schemas.ts` — Added `meSchema` with response JSON Schema

**Tests added:**
- `api/src/auth/routes.test.ts` — 108 lines of new test coverage for the `/me` endpoint

### 2. Web Settings Page

Full account settings page built with React, TanStack Query, and Shadcn/ui components.

**Created:**
- `web/src/auth/SettingsPage.tsx` — Settings page showing user profile, role badge, linked accounts, and link-account buttons
- `web/src/auth/hooks/useMe.ts` — TanStack Query hook wrapping `GET /auth/me`
- `web/src/auth/hooks/useLinkAccount.ts` — Mutation hook for linking additional OAuth providers
- `web/src/components/ui/badge.tsx` — Shadcn Badge component
- `web/src/components/ui/card.tsx` — Shadcn Card component
- `web/src/routes/_authenticated/settings.tsx` — TanStack Router route for `/settings`

**Modified:**
- `web/src/routes/_authenticated/index.tsx` — Added navigation link to settings
- `web/src/routeTree.gen.ts` — Auto-regenerated route tree
- `web/eslint.config.js` — Minor rule adjustment

**Tests added:**
- `web/src/auth/__tests__/SettingsPage.test.tsx` — 294 lines covering rendering, loading states, error states, and link-account interactions
- `web/src/auth/hooks/__tests__/useMe.test.ts` — Hook unit tests
- `web/src/auth/hooks/__tests__/useLinkAccount.test.ts` — Mutation hook unit tests

### 3. iOS Settings Screen

SwiftUI account settings view with linked account display and sign-in integration.

**Created:**
- `ios/track-em-toys/Settings/AccountSettingsView.swift` — SwiftUI view showing profile info, linked providers, and link-account buttons
- `ios/track-em-toys/Networking/AuthEndpoints.swift` — `GET /auth/me` API client
- `ios/track-em-toys/Networking/NetworkModels.swift` — Response models for the me endpoint

**Modified:**
- `ios/track-em-toys/App/TrackEmToysApp.swift` — Added settings navigation
- `ios/track-em-toys/Auth/AuthManager.swift` — Added account linking methods

**Tests added:**
- `ios/track-em-toysTests/Auth/AuthManagerTests.swift` — 23 lines for account linking
- `ios/track-em-toysTests/Networking/AuthEndpointsTests.swift` — 84 lines for endpoint construction
- `ios/track-em-toysTests/Networking/NetworkModelsTests.swift` — 93 lines for model decoding

### 4. Bug Fix: Empty linked_accounts in Production

Fixed a bug where `isCompleteOAuthRow` in `api/src/db/queries.ts` checked `typeof oa_created_at === 'string'`, but the `pg` driver returns `TIMESTAMPTZ` columns as JavaScript `Date` objects — not strings. This caused the type guard to always return `false`, making `linked_accounts` an empty array even when OAuth accounts existed.

**Fix:** Widened the type from `string` to `Date | string` and replaced `typeof oa_created_at === 'string'` with `oa_created_at != null`.

**Modified:**
- `api/src/db/queries.ts` — Fixed `UserWithAccountsRow` type and `isCompleteOAuthRow` type guard
- `api/src/db/queries.test.ts` — Updated tests to reflect corrected types

---

## Technical Details

### GET /auth/me Response Shape

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "User Name",
  "role": "user",
  "linked_accounts": [
    { "provider": "apple", "email": "user@privaterelay.appleid.com" },
    { "provider": "google", "email": "user@gmail.com" }
  ]
}
```

### pg Driver TIMESTAMPTZ Behavior

The `pg` driver auto-parses `TIMESTAMPTZ` columns into JavaScript `Date` objects by default (type OID 1184). Code that checks `typeof column === 'string'` against these values will always fail at runtime, even though TypeScript's structural typing may not catch the mismatch at compile time if the type is declared as `string`.

---

## Validation & Testing

| Module | Tests Added | Coverage |
|--------|-------------|----------|
| API (`routes.test.ts`) | +108 lines | `/me` happy path, 401 unauthorized, user not found |
| API (`queries.test.ts`) | +8 lines | Type guard fix verification |
| Web (`SettingsPage.test.tsx`) | +294 lines | Render, loading, error, link-account interactions |
| Web (`useMe.test.ts`) | +53 lines | Query hook unit tests |
| Web (`useLinkAccount.test.ts`) | +75 lines | Mutation hook unit tests |
| iOS (`AuthManagerTests`) | +23 lines | Account linking |
| iOS (`AuthEndpointsTests`) | +84 lines | Endpoint construction |
| iOS (`NetworkModelsTests`) | +93 lines | Model decoding |

---

## Impact Assessment

- **Cross-module feature**: One of the first features touching all three modules (api, web, ios) in a single PR
- **User-facing**: Users can now view their profile, see which OAuth providers are linked, and link additional providers
- **Bug fix**: Resolves an issue where linked accounts were invisible despite existing in the database
- **UI components**: Introduced Shadcn Badge and Card components, reusable across future web pages

---

## Related Files

**Created (12):**
- `api/src/auth/routes.test.ts` (new test coverage)
- `web/src/auth/SettingsPage.tsx`
- `web/src/auth/__tests__/SettingsPage.test.tsx`
- `web/src/auth/hooks/useMe.ts`
- `web/src/auth/hooks/__tests__/useMe.test.ts`
- `web/src/auth/hooks/useLinkAccount.ts`
- `web/src/auth/hooks/__tests__/useLinkAccount.test.ts`
- `web/src/components/ui/badge.tsx`
- `web/src/components/ui/card.tsx`
- `web/src/routes/_authenticated/settings.tsx`
- `ios/track-em-toys/Settings/AccountSettingsView.swift`
- `ios/track-em-toys/Networking/AuthEndpoints.swift`
- `ios/track-em-toys/Networking/NetworkModels.swift`

**Modified (8):**
- `api/src/auth/routes.ts`
- `api/src/auth/schemas.ts`
- `api/src/db/queries.ts`
- `api/src/db/queries.test.ts`
- `api/src/types/index.ts`
- `ios/track-em-toys/App/TrackEmToysApp.swift`
- `ios/track-em-toys/Auth/AuthManager.swift`
- `web/src/routes/_authenticated/index.tsx`

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Files created | 12 |
| Files modified | 8 |
| Lines added | ~1,526 |
| Lines removed | ~46 |
| Modules touched | 3 (api, web, ios) |
| Bugs fixed | 1 (pg TIMESTAMPTZ type guard) |
| UI components added | 2 (Badge, Card) |

---

## Status

✅ COMPLETE
