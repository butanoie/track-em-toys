# E2E: Authentication — Login Page

## Background

Given the web app is running
And the user is on the login page (`/login`)

## Scenarios

### Login Page: Renders Branding and Sign-In Options

```gherkin
Scenario: Login page displays heading and Apple sign-in button
  Given the user navigates to /login
  Then the "Track'em Toys" heading is visible
  And the "Sign in with Apple" button is visible
```

**Spec:** `web/e2e/login-page.spec.ts`

### Notes

- Google sign-in renders in a cross-origin iframe controlled by Google — Playwright cannot assert its presence reliably. Only the Apple button is verified.
- OAuth flows themselves cannot be E2E tested (see `docs/decisions/ADR_Integration_Testing_Strategy.md` — OAuth Constraint section). Auth seeding via mocked endpoints is used instead.
