# E2E: Admin Dashboard

## Background

Given the web app is running
And a user with admin role exists
And the admin is signed in

## Scenarios

### Access Guard

#### Guard: Non-admin user is redirected from admin routes

```gherkin
Scenario: Non-admin user navigates to /admin/users
  Given the user has role "user"
  And they are signed in
  When they navigate to /admin/users
  Then they are redirected to /
  And the admin page is not rendered
```

#### Guard: Unauthenticated user cannot access admin routes

```gherkin
Scenario: Unauthenticated user navigates to /admin/users
  Given the user is not signed in
  When they navigate to /admin/users
  Then they are redirected to /login
  And the redirect parameter preserves /admin/users
```

#### Guard: Admin user can access admin routes

```gherkin
Scenario: Admin user navigates to /admin/users
  Given the user has role "admin"
  And they are signed in
  When they navigate to /admin/users
  Then the admin user list page is displayed
  And the sidebar shows "Users" as active
```

### Navigation

#### Happy Path: Admin link visible in header for admins

```gherkin
Scenario: Admin sees "Admin" link in app header
  Given the user has role "admin"
  And they are on the dashboard
  Then the header shows an "Admin" link
  When they click the "Admin" link
  Then they are navigated to /admin/users
```

#### Guard: Regular user does not see admin link

```gherkin
Scenario: Non-admin user does not see admin link
  Given the user has role "user"
  And they are on the dashboard
  Then the header does not show an "Admin" link
```

#### Happy Path: Back to App link

```gherkin
Scenario: Admin navigates back to main app from admin panel
  Given the admin is on /admin/users
  When they click the "Back to App" link
  Then they are navigated to /
```

### User List

#### Happy Path: User list displays with data

```gherkin
Scenario: Admin views the user list
  Given there are 5 registered users
  When the admin navigates to /admin/users
  Then a table displays all 5 users
  And each row shows email, display name, role badge, status, and join date
```

#### Empty State: No users match filter

```gherkin
Scenario: Filter returns no results
  Given the admin is on /admin/users
  When they type "nonexistent@example.com" in the email search
  Then an empty state message is shown
  And the message indicates no users match the filter
```

### Filtering

#### Happy Path: Filter by email

```gherkin
Scenario: Admin searches for a user by email
  Given the admin is on /admin/users
  When they type "alice@" in the email search input
  Then the table updates to show only users whose email contains "alice@"
  And the URL search params include email=alice@
```

#### Happy Path: Filter by role

```gherkin
Scenario: Admin filters users by role
  Given the admin is on /admin/users
  When they select "curator" from the role filter dropdown
  Then the table updates to show only curators
  And the URL search params include role=curator
```

#### Edge Case: Filter resets pagination

```gherkin
Scenario: Changing filter resets to page 1
  Given the admin is on page 3 of the user list
  When they change the role filter to "admin"
  Then the offset resets to 0
  And the first page of admin users is displayed
```

### Pagination

#### Happy Path: Navigate between pages

```gherkin
Scenario: Admin navigates to the next page
  Given there are 30 users (more than one page)
  And the admin is on the first page
  When they click the "Next" button
  Then the next page of users is displayed
  And the "Previous" button becomes enabled
```

#### Guard: Pagination boundaries

```gherkin
Scenario: Previous button disabled on first page
  Given the admin is on the first page
  Then the "Previous" button is disabled

Scenario: Next button disabled on last page
  Given the admin is on the last page
  Then the "Next" button is disabled
```

### Role Assignment

#### Happy Path: Change user role

```gherkin
Scenario: Admin changes a user's role to curator
  Given the admin is viewing the user list
  And there is a user with role "user"
  When the admin selects "curator" from that user's role dropdown
  And confirms the action in the dialog
  Then a success toast shows "Role updated to curator for <email>"
  And the user list refetches to show updated data
```

#### Error: Cannot demote the last admin (409)

```gherkin
Scenario: Admin tries to demote the only admin
  Given there is exactly one admin user
  When the admin changes another admin's role to "user"
  And confirms the action in the dialog
  Then an ErrorBanner is shown with the server's 409 message
  And no toast notification appears
```

#### Error: Insufficient permissions (403)

```gherkin
Scenario: Server rejects role change with 403
  Given the admin attempts a role change
  And the server returns 403
  When the mutation completes
  Then an ErrorBanner is shown with the server's 403 message
  And no toast notification appears
```

#### Guard: Cannot modify own role

```gherkin
Scenario: Admin's own row has disabled role controls
  Given the admin is viewing the user list
  Then their own row's role dropdown is disabled
  And deactivate and purge buttons are not available for their own row
```

### Deactivation / Reactivation

#### Happy Path: Deactivate a user

```gherkin
Scenario: Admin deactivates a user account
  Given a user with status "Active"
  When the admin clicks "Deactivate" on that user's row
  And confirms the action in the dialog
  Then a success toast shows "<email> deactivated"
  And the user's status changes to "Deactivated"
  And the button changes to "Reactivate"
```

#### Happy Path: Reactivate a user

```gherkin
Scenario: Admin reactivates a deactivated user
  Given a user with status "Deactivated"
  When the admin clicks "Reactivate" on that user's row
  And confirms the action in the dialog
  Then a success toast shows "<email> reactivated"
  And the user's status changes to "Active"
  And the button changes to "Deactivate"
```

### GDPR Purge

#### Happy Path: Purge a user with confirmation

```gherkin
Scenario: Admin performs GDPR purge on a user
  Given a user exists in the list
  When the admin clicks "Purge" on that user's row
  Then a confirmation dialog appears
  And the confirm button is disabled
  When the admin types "DELETE" in the confirmation input
  Then the confirm button becomes enabled
  When the admin clicks the confirm button
  Then a success toast shows "User data purged permanently"
  And the user list refetches
  And the purged user shows status "Purged" with scrubbed data
```

#### Guard: Purge confirmation requires exact text

```gherkin
Scenario: Typing wrong text does not enable confirm button
  Given the GDPR purge confirmation dialog is open
  When the admin types "delete" (lowercase)
  Then the confirm button remains disabled
  When the admin clears and types "DELETE"
  Then the confirm button becomes enabled
```

#### Guard: Cannot purge an already-purged user

```gherkin
Scenario: Purge button disabled for tombstone users
  Given a user has already been GDPR-purged
  Then the "Purge" button on their row is disabled
```

#### Edge Case: Purge dialog stays open on transient error

```gherkin
Scenario: Network error during purge does not close the dialog
  Given the GDPR purge confirmation dialog is open
  And the admin has typed "DELETE"
  When the server returns a transient error (e.g., 500)
  Then an error toast shows "Action failed. Please try again."
  And the purge dialog remains open
  And the typed "DELETE" confirmation is preserved
```

### Mutation Feedback

#### Display: Success toast after any mutation

```gherkin
Scenario: All successful mutations show a toast notification
  Given the admin completes any mutation (role change, deactivate, reactivate, purge)
  When the server returns a success response
  Then a success toast appears with a descriptive message
  And the confirmation dialog closes
  And the user list refetches
```

#### Display: Business-logic errors show ErrorBanner

```gherkin
Scenario: Server 400/403/404/409 errors show persistent ErrorBanner
  Given the admin attempts any mutation
  When the server returns 400, 403, 404, or 409
  Then an ErrorBanner appears above the table with the server's error message
  And no toast notification appears
  And the confirmation dialog closes
```

#### Display: Transient errors show toast

```gherkin
Scenario: Network or 500 errors show toast notification
  Given the admin attempts a non-purge mutation
  When the server returns a transient error (500, network failure)
  Then an error toast shows "Action failed. Please try again."
  And the confirmation dialog closes
```

### Status Display

#### Display: Active user

```gherkin
Scenario: Active user shows correct status
  Given a user with no deactivated_at and no deleted_at
  Then their status badge shows "Active" with a green accent
```

#### Display: Deactivated user

```gherkin
Scenario: Deactivated user shows correct status
  Given a user with deactivated_at set
  Then their status badge shows "Deactivated" with an amber accent
```

#### Display: Purged user (tombstone)

```gherkin
Scenario: GDPR-purged user shows tombstone display
  Given a user with deleted_at set
  Then their status badge shows "Purged" with a red accent
  And their email shows "Deleted user"
  And their name shows "—"
  And all action buttons are disabled
```
