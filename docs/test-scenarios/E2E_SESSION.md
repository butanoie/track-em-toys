# E2E: Session Management

## Background

Given the web app is running
And the user has an authenticated session (seeded via `setupAuthenticated()`)

## Scenarios

### Happy Path: Dashboard Shows User Identity

```gherkin
Scenario: Authenticated user sees dashboard with their name
  Given the user has a valid session
  When they navigate to the home page
  Then the "Your Collection" heading is visible
  And the user's display name is shown in the UI
```

### Sign Out: Redirects and Clears Session

```gherkin
Scenario: User signs out successfully
  Given the user is on the dashboard
  When they click the "Sign Out" button
  Then they are redirected to /login
  And the session flag is removed from localStorage
```

### Persistence: Session Survives Page Reload

```gherkin
Scenario: Session persists across page reload
  Given the user is on the dashboard
  When they reload the page
  Then the refresh token endpoint is called
  And the dashboard is displayed again with "Your Collection" heading
```

### Expiry: Expired Refresh Token Clears Session

```gherkin
Scenario: Expired refresh token redirects to login
  Given the user is on the dashboard
  And the refresh token has expired (server returns 401)
  When they reload the page
  Then AuthProvider detects the failed refresh
  And the user is redirected to /login
  And the session flag is removed from localStorage
```

**Specs:**

- `web/e2e/authenticated-session.spec.ts` — Dashboard identity, sign out
- `web/e2e/session-persistence.spec.ts` — Reload survival, expired refresh

### Notes

- Session seeding uses `addInitScript` to populate `localStorage` and `sessionStorage` before React mounts. This ensures `AuthProvider.init()` finds the session flag synchronously on mount.
- The expired refresh scenario replaces the mock mid-test using `page.unrouteAll()` + `mockRefreshFailure()` to simulate server-side token expiry.
- `localStorage` key: `trackem:has_session` (boolean flag)
- `sessionStorage` key: `trackem:user` (JSON user profile)
