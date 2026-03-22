# E2E: Real Authentication for E2E Tests

## Background

Given the API server is running with a test database
And the web app is built and served via preview
And the test-signin endpoint is available (NODE_ENV !== 'production')

## Scenarios

### Infrastructure: Test Signin Endpoint

```gherkin
Scenario: Test signin creates a new user and returns tokens
  Given no user exists with email "e2e-user@e2e.test"
  When POST /auth/test-signin is called with { email: "e2e-user@e2e.test", role: "user" }
  Then a 200 response is returned with access_token and user object
  And a signed httpOnly refresh_token cookie is set
  And the user is created in the database with email_verified = true

Scenario: Test signin upserts an existing user's role
  Given a user exists with email "e2e-user@e2e.test" and role "user"
  When POST /auth/test-signin is called with { email: "e2e-user@e2e.test", role: "admin" }
  Then the user's role is updated to "admin"
  And a new refresh token is issued

Scenario: Test signin resets deactivated/deleted flags
  Given a user exists with email "e2e-user@e2e.test" and deleted_at is set
  When POST /auth/test-signin is called with { email: "e2e-user@e2e.test", role: "user" }
  Then deactivated_at and deleted_at are reset to NULL
  And the user can authenticate normally

Scenario: Test signin rejects non-e2e.test emails
  When POST /auth/test-signin is called with { email: "real@gmail.com", role: "user" }
  Then a 400 response is returned
  And no user is created

Scenario: Test signin is not available in production
  Given NODE_ENV is "production"
  When the server starts
  Then the /auth/test-signin route is not registered
  And POST /auth/test-signin returns 404
```

### Infrastructure: Global Setup

```gherkin
Scenario: Global setup authenticates all three roles
  Given the API server is healthy
  When globalSetup runs
  Then storageState files are created for user, curator, and admin roles
  And each file contains a valid refresh_token cookie for the API origin
  And each file contains the trackem:has_session localStorage flag for the web origin

Scenario: Global setup is idempotent
  Given globalSetup has already run once
  When globalSetup runs again
  Then the existing test users are updated (not duplicated)
  And new storageState files are written successfully
```

### Authenticated Tests: Real Refresh Flow

```gherkin
Scenario: Authenticated page loads with real refresh token
  Given the user project storageState is loaded
  When the user navigates to the dashboard
  Then AuthProvider detects the session flag
  And calls POST /auth/refresh with the real httpOnly cookie
  And the refresh succeeds with a new access token
  And the dashboard renders with "Your Collection" heading

Scenario: Admin page loads with real admin authentication
  Given the admin project storageState is loaded
  When the admin navigates to /admin/users
  Then the admin dashboard renders successfully
  And the user has admin role privileges
```

### Failure Paths (Remain Mocked)

```gherkin
Scenario: Expired refresh token redirects to login (mocked)
  Given the user has a mocked session with a failing refresh endpoint
  When the page is reloaded
  Then the user is redirected to /login
  And the session flag is cleared
```
