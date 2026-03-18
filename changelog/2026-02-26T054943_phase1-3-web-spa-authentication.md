# Phase 1.3 — Web SPA Authentication

**Date:** 2026-02-26
**Time:** 05:49:43 UTC
**Type:** Phase Completion
**Phase:** 1.3 — Web SPA Authentication
**Version:** v0.1.3

## Summary

Implemented the complete Phase 1.3 web SPA authentication system for Track'em Toys. The React 19 + TypeScript + Vite project was scaffolded from scratch into the existing `web/` directory, with full Google and Apple Sign-In flows, a 401-interceptor with refresh mutex, silent refresh scheduling, and route protection via TanStack Router layout routes. All 72 unit and component tests pass with zero TypeScript errors.

---

## Changes Implemented

### 1. Project Scaffolding

**Created:**

- `web/package.json` — React 19, TanStack Query v5, TanStack Router v1, Zod, Tailwind CSS 4, Vitest, Testing Library
- `web/tsconfig.json`, `web/tsconfig.app.json`, `web/tsconfig.node.json` — TypeScript strict mode with `@/` path alias
- `web/vite.config.ts` — Vite + React + Tailwind CSS 4 + TanStack Router plugin (auto-generates `routeTree.gen.ts`)
- `web/vitest.config.ts` — Vitest with jsdom environment, `@/` alias, `IS_REACT_ACT_ENVIRONMENT`
- `web/index.html` — App entry point
- `web/.env.example` — Documents required env vars (never committed)
- `web/components.json` — Shadcn/ui configuration

**Dependencies installed:**

- `react@^19`, `react-dom@^19`
- `@tanstack/react-query@^5`, `@tanstack/react-router@^1`, `@tanstack/router-plugin`
- `zod@^3`
- `@react-oauth/google@^0.12`
- `tailwindcss@^4`, `@tailwindcss/vite`
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@radix-ui/react-slot`
- `vitest@^3`, `@testing-library/react@^16`, `@testing-library/user-event@^14`, `jsdom`

### 2. Zod Schemas (`src/lib/zod-schemas.ts`)

- `UserResponseSchema` — uuid id, nullable email/display_name/avatar_url
- `AuthResponseSchema` — access_token (min 1), `refresh_token: null` (web clients use cookie), user
- `TokenResponseSchema` — access_token, `refresh_token: null`
- `LinkAccountResponseSchema` — extends User with linked_accounts array
- `ApiErrorSchema` — `{ error: string }`
- All schemas export inferred TypeScript types

### 3. Auth Store (`src/lib/auth-store.ts`)

- Module-scoped `accessToken` singleton (never in React state, never in localStorage)
- `authStore.getToken()`, `setToken()`, `clear()` — pure in-memory token management
- `refreshTimer.set()`, `cancel()` — manages the proactive silent refresh timer ID
- `SESSION_KEYS` constants for all sessionStorage keys

### 4. API Client (`src/lib/api-client.ts`)

- `ApiError` class with `status` and `body: { error: string }`
- `apiFetch()` — fetch wrapper with `credentials: 'include'`, automatic `Content-Type: application/json` on POST/PUT/PATCH, Bearer token injection (skipped for auth endpoints)
- **401 interceptor with refresh mutex** — single `refreshPromise` deduplicates concurrent 401s; retries original request after successful refresh; clears state and redirects to `/login` on refresh failure
- `apiFetchJson<T>()` — throws typed `ApiError` on non-2xx; all JSON parsed as `unknown` first

### 5. AuthProvider (`src/auth/AuthProvider.tsx`)

- React context managing `user: UserResponse | null`, `isLoading`, `isAuthenticated`
- **Silent refresh on mount** — POSTs to `/auth/refresh` with `credentials: 'include'`; restores cached user from `sessionStorage` on success
- **Proactive refresh scheduling** — parses JWT `exp` claim, schedules `window.setTimeout` 60 seconds before expiry
- `signInWithGoogle(credential)` — POSTs to `/auth/signin`, validates with `AuthResponseSchema`, stores token + user
- `signInWithApple(idToken, nonce, userName?)` — same flow, clears Apple session storage on success
- `logout()` — calls `/auth/logout`, clears authStore + sessionStorage + queryClient, cancels refresh timer

### 6. useAuth Hook (`src/auth/useAuth.ts`)

- Single-line hook that reads `AuthContext`, throws if used outside provider

### 7. Google Sign-In (`src/auth/google-auth.ts`, `src/auth/LoginPage.tsx`)

- `extractGoogleCredential()` — validates CredentialResponse and returns the id_token string
- `LoginPage` — renders `<GoogleLogin>` button + Apple button, handles errors with `role="alert"` messages
- `<GoogleOAuthProvider>` wraps the root in `__root.tsx`

### 8. Apple Sign-In (`src/auth/apple-auth.ts`, `src/auth/AppleCallback.tsx`)

- `initiateAppleSignIn()` — dynamically loads Apple JS SDK, generates SHA-256 nonce pair, stores `rawNonce` + `state` in sessionStorage, calls `AppleID.auth.signIn()`
- `AppleCallback` — reads query params from TanStack Router `useSearch`, validates CSRF state, calls `signInWithApple`, navigates to `/` on success
- Apple user name stored in sessionStorage and cleared after successful sign-in

### 9. Route Structure (`src/routes/`)

- `__root.tsx` — `QueryClientProvider` + `GoogleOAuthProvider` + `AuthProvider` wrapper
- `_authenticated.tsx` — layout route that throws `redirect({ to: '/login' })` when not authenticated
- `_authenticated/index.tsx` — Dashboard placeholder with logout button
- `login.tsx` — Public login route
- `auth/apple-callback.tsx` — Apple OAuth callback route

### 10. Route Tree (`src/routeTree.gen.ts`)

- Auto-generated by `@tanstack/router-plugin/vite` on build
- Defines all type-safe route relationships

### 11. UI Components (`src/components/ui/`)

- `button.tsx` — Shadcn/ui Button with CVA variants
- `src/lib/utils.ts` — `cn()` helper using clsx + tailwind-merge
- `src/index.css` — CSS custom properties for light/dark theme

---

## Technical Details

### Token Security Architecture

```
Access Token:  In-memory module variable (authStore)
               Never written to localStorage/sessionStorage/cookie
               Cleared on logout and failed refresh

Refresh Token: httpOnly cookie (managed by API)
               JS has zero access
               Sent automatically via credentials: 'include'
               Path=/auth — only sent to /auth/* endpoints

User Profile:  sessionStorage (trackem:user)
               Cached because /auth/refresh doesn't return user
               Cleared on logout
```

### 401 Refresh Mutex Pattern

```typescript
let refreshPromise: Promise<boolean> | null = null;

if (!refreshPromise) {
  refreshPromise = attemptRefresh().finally(() => {
    refreshPromise = null;
  });
}
const refreshed = await refreshPromise;
```

Three simultaneous 401s → one `/auth/refresh` call, all three await the same promise.

### Apple Sign-In Flow

1. Browser: Generate nonce pair (raw + SHA-256 hash), store raw in sessionStorage
2. Browser: `AppleID.auth.signIn()` → redirects to Apple with hashed nonce
3. Apple: POSTs `id_token` + `user` to API at `/auth/apple-callback`
4. API: Extracts fields, redirects to `GET /auth/apple-callback?token=...&user=...`
5. SPA: `AppleCallback` reads query params, retrieves raw nonce, calls `/auth/signin`

---

## Validation & Testing

### Build Output

```
✓ 199 modules transformed
✓ built in 831ms
dist/index.html                           0.46 kB
dist/assets/index-*.css                  12.40 kB (gzip: 3.30 kB)
```

### Test Results

```
Test Files  9 passed (9)
     Tests  72 passed (72)
  Duration  1.59s
```

### Test Coverage by Area

| File                      | Tests                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `zod-schemas.test.ts`     | 14 — all schema validation paths                             |
| `auth-store.test.ts`      | 8 — token CRUD, timer cancel                                 |
| `api-client.test.ts`      | 14 — headers, 401 interceptor, refresh mutex, error handling |
| `google-auth.test.ts`     | 3 — credential extraction                                    |
| `apple-auth.test.ts`      | 6 — nonce generation, sessionStorage management, SDK load    |
| `AuthProvider.test.tsx`   | 8 — silent refresh, sign-in, logout, state management        |
| `LoginPage.test.tsx`      | 8 — render, Google/Apple buttons, error states               |
| `AppleCallback.test.tsx`  | 8 — CSRF, error states, navigation, session cleanup          |
| `ProtectedRoute.test.tsx` | 3 — loading, unauthenticated redirect, authenticated outlet  |

### Pre-Submission Checklist

- `no 'any' type` — Zero results in production source (routeTree.gen.ts is generated with `@ts-nocheck`)
- `no useState + fetch` — Zero results
- `no direct fetch outside hooks` — AuthProvider.doRefresh uses direct fetch intentionally (auth bootstrap, avoids circular dependency)
- `Zod validation` — All `response.json()` and `JSON.parse()` results typed as `unknown` first, then validated
- `no 'as T' without runtime check` — All casts preceded by type guards

---

## Impact Assessment

- **Development** — Web SPA can now authenticate via Google and Apple; dev server at `http://localhost:5173`
- **Security** — Refresh tokens in httpOnly cookies (zero JS access); access tokens in-memory only; CSRF protection on Apple callback via state parameter
- **Performance** — Proactive token refresh 60s before expiry; shared refresh mutex prevents thundering herd on 401s
- **Testing** — 72 tests covering all auth flows; mocks ensure tests don't require a running API

---

## Related Files

**Created:**

- `web/package.json`
- `web/tsconfig.json`, `web/tsconfig.app.json`, `web/tsconfig.node.json`
- `web/vite.config.ts`
- `web/vitest.config.ts`
- `web/index.html`
- `web/components.json`
- `web/.env.example`
- `web/src/vite-env.d.ts`
- `web/src/index.css`
- `web/src/main.tsx`
- `web/src/test-setup.ts`
- `web/src/routeTree.gen.ts`
- `web/src/lib/utils.ts`
- `web/src/lib/zod-schemas.ts`
- `web/src/lib/auth-store.ts`
- `web/src/lib/api-client.ts`
- `web/src/auth/AuthProvider.tsx`
- `web/src/auth/useAuth.ts`
- `web/src/auth/LoginPage.tsx`
- `web/src/auth/AppleCallback.tsx`
- `web/src/auth/ProtectedRoute.tsx`
- `web/src/auth/google-auth.ts`
- `web/src/auth/apple-auth.ts`
- `web/src/components/ui/button.tsx`
- `web/src/routes/__root.tsx`
- `web/src/routes/_authenticated.tsx`
- `web/src/routes/_authenticated/index.tsx`
- `web/src/routes/login.tsx`
- `web/src/routes/auth/apple-callback.tsx`
- `web/src/lib/__tests__/zod-schemas.test.ts`
- `web/src/lib/__tests__/auth-store.test.ts`
- `web/src/lib/__tests__/api-client.test.ts`
- `web/src/auth/__tests__/google-auth.test.ts`
- `web/src/auth/__tests__/apple-auth.test.ts`
- `web/src/auth/__tests__/AuthProvider.test.tsx`
- `web/src/auth/__tests__/LoginPage.test.tsx`
- `web/src/auth/__tests__/AppleCallback.test.tsx`
- `web/src/auth/__tests__/ProtectedRoute.test.tsx`

**Modified:**

- `.gitignore` — Added `web/.env` and `web/.env.local`

## Status

COMPLETE — Build passes, 72/72 tests pass, zero TypeScript errors.
