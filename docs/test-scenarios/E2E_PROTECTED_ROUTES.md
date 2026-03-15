# E2E: Protected Routes

## Background

Given the web app is running
And all routes except `/login` require authentication

## Scenarios

### Guard: Unauthenticated User Redirected

```gherkin
Scenario: Unauthenticated user is redirected to /login
  Given the user is not signed in
  When they navigate to the home page (/)
  Then they are redirected to /login
```

### Guard: Redirect Parameter Preserved

```gherkin
Scenario: Original URL is preserved as redirect parameter
  Given the user is not signed in
  When they navigate to the home page (/)
  Then they are redirected to /login
  And the URL contains a redirect= parameter with the original path
```

### Happy Path: Authenticated User Accesses Dashboard

```gherkin
Scenario: Authenticated user accesses the dashboard directly
  Given the user has a valid session
  When they navigate to the home page (/)
  Then the "Your Collection" heading is visible
  And the URL remains /
```

**Spec:** `web/e2e/protected-routes.spec.ts`

### Notes

- Auth seeding uses `setupAuthenticated()` from `web/e2e/fixtures/auth.ts`, which mocks the refresh endpoint and populates localStorage/sessionStorage via `addInitScript`.
- The redirect parameter is set by the `_authenticated` layout guard when redirecting unauthenticated users.
