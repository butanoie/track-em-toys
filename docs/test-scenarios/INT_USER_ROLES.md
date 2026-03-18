# INT: User Roles & Admin Foundation

## Background

Given the API server is running
And migration 019 (role column) and 020 (admin event types) have been applied
And a user with role `admin` exists with a valid JWT

---

## requireRole Middleware

### Happy Path: Admin accesses admin route

```gherkin
Scenario: Admin user passes requireRole('admin') check
  Given the user has role 'admin' in their JWT claims
  When they call GET /admin/users
  Then they receive 200 with a list of users
```

### Happy Path: Hierarchy — admin satisfies curator requirement

```gherkin
Scenario: Admin user passes requireRole('curator') check
  Given the user has role 'admin' in their JWT claims
  When they call a route requiring 'curator' role
  Then they are granted access (hierarchy: admin >= curator)
```

### Guard: Insufficient role

```gherkin
Scenario: Curator cannot access admin routes
  Given the user has role 'curator' in their JWT claims
  When they call GET /admin/users
  Then they receive 403 Forbidden
```

### Guard: Regular user cannot access admin routes

```gherkin
Scenario: Regular user cannot access admin routes
  Given the user has role 'user' in their JWT claims
  When they call GET /admin/users
  Then they receive 403 Forbidden
```

### Guard: Missing JWT

```gherkin
Scenario: Unauthenticated request to admin route
  Given no Authorization header is present
  When they call GET /admin/users
  Then they receive 401 Unauthorized
```

### Guard: Pre-migration token (no role claim)

```gherkin
Scenario: Token without role claim is rejected
  Given the JWT has only { sub } and no role claim
  When they call GET /admin/users
  Then they receive 403 Forbidden (isRolePayload returns false)
```

---

## GET /admin/users

### Happy Path: List all users

```gherkin
Scenario: Admin lists all users with default pagination
  Given 25 users exist in the database
  When the admin calls GET /admin/users
  Then they receive 200 with { data: [...], total_count: 25, limit: 20, offset: 0 }
  And data contains the first 20 users ordered by created_at DESC
```

### Filter: By role

```gherkin
Scenario: Admin filters users by role
  Given users exist with roles 'user', 'curator', and 'admin'
  When the admin calls GET /admin/users?role=curator
  Then they receive only users with role 'curator'
  And total_count reflects the filtered count
```

### Filter: By email search

```gherkin
Scenario: Admin searches users by email substring
  Given a user with email "alice@example.com" exists
  When the admin calls GET /admin/users?email=alice
  Then the result includes the user with email "alice@example.com"
```

### Edge Case: ILIKE special characters escaped

```gherkin
Scenario: Email search with % and _ characters
  Given a user with email "test_100%@example.com" exists
  When the admin calls GET /admin/users?email=100%25
  Then the ILIKE query escapes % and _ correctly
  And only exact substring matches are returned
```

### Pagination: Custom limit and offset

```gherkin
Scenario: Admin uses custom pagination
  Given 50 users exist
  When the admin calls GET /admin/users?limit=10&offset=20
  Then they receive 10 users starting from offset 20
  And total_count is 50
```

### Validation: Invalid query params

```gherkin
Scenario: Invalid limit value
  When the admin calls GET /admin/users?limit=0
  Then they receive 400 Bad Request
```

---

## PATCH /admin/users/:id/role

### Happy Path: Assign role

```gherkin
Scenario: Admin promotes user to curator
  Given a user with role 'user' exists
  When the admin calls PATCH /admin/users/:id/role with { role: 'curator' }
  Then the user's role is updated to 'curator'
  And they receive 200 with the updated user object
  And a 'role_changed' audit event is logged with old_role and new_role
```

### Guard: Self-modification blocked

```gherkin
Scenario: Admin cannot change their own role
  Given the admin's UUID is "abc-123"
  When they call PATCH /admin/users/abc-123/role with { role: 'user' }
  Then they receive 403 "Cannot perform this action on your own account"
```

### Guard: Self-modification blocked (case-insensitive)

```gherkin
Scenario: UUID case normalization prevents bypass
  Given the admin's UUID is "abc-123"
  When they call PATCH /admin/users/ABC-123/role with { role: 'user' }
  Then they receive 403 (case-insensitive UUID comparison)
```

### Guard: No escalation above own level

```gherkin
Scenario: Cannot assign role above own level
  Given a future role 'superadmin' exists above 'admin'
  When the admin calls PATCH with { role: 'superadmin' }
  Then they receive 403 (escalation prevention)
```

### Guard: GDPR-purged user rejected

```gherkin
Scenario: Cannot change role of purged user
  Given a user with deleted_at IS NOT NULL exists
  When the admin calls PATCH /admin/users/:id/role
  Then they receive 409 "User has been permanently deleted"
```

### Guard: Last-admin protection

```gherkin
Scenario: Cannot demote the last admin
  Given only one active admin exists
  When they call PATCH to demote that admin to 'user'
  Then they receive 409 "Cannot demote the last admin"
```

### Security: Demotion revokes refresh tokens

```gherkin
Scenario: Demoting a user revokes their refresh tokens
  Given a user with role 'admin' has active refresh tokens
  When the admin demotes them to 'user'
  Then revokeAllUserRefreshTokens is called for the demoted user
  And the user must re-authenticate with the new role
```

### Error: User not found

```gherkin
Scenario: Target user does not exist
  When the admin calls PATCH /admin/users/nonexistent-uuid/role
  Then they receive 404
```

### Error: Invalid UUID format

```gherkin
Scenario: Non-UUID path parameter
  When the admin calls PATCH /admin/users/not-a-uuid/role
  Then they receive 400 (schema validation on format: uuid)
```

### Validation: Invalid role value

```gherkin
Scenario: Invalid role in request body
  When the admin calls PATCH with { role: 'superuser' }
  Then they receive 400 Bad Request (enum validation)
```

---

## POST /admin/users/:id/deactivate

### Happy Path: Deactivate user

```gherkin
Scenario: Admin deactivates a user
  Given a user with deactivated_at IS NULL exists
  When the admin calls POST /admin/users/:id/deactivate
  Then the user's deactivated_at is set to NOW()
  And all their refresh tokens are revoked
  And an 'account_deactivated' audit event is logged
  And they receive 200 with the updated user
```

### Idempotent: Already deactivated

```gherkin
Scenario: Deactivating an already-deactivated user
  Given a user with deactivated_at IS NOT NULL exists
  When the admin calls POST /admin/users/:id/deactivate
  Then they receive 200 with the current user state (idempotent)
```

### Guard: GDPR-purged user rejected

```gherkin
Scenario: Cannot deactivate a purged user
  Given a user with deleted_at IS NOT NULL exists
  When the admin calls POST /admin/users/:id/deactivate
  Then they receive 409 "User has been permanently deleted"
```

### Guard: Self-deactivation blocked

```gherkin
Scenario: Admin cannot deactivate themselves
  When the admin calls POST /admin/users/:own-id/deactivate
  Then they receive 403
```

---

## POST /admin/users/:id/reactivate

### Happy Path: Reactivate user

```gherkin
Scenario: Admin reactivates a deactivated user
  Given a user with deactivated_at IS NOT NULL exists
  When the admin calls POST /admin/users/:id/reactivate
  Then the user's deactivated_at is set to NULL
  And an 'account_reactivated' audit event is logged
  And they receive 200 with the updated user
```

### Idempotent: Already active

```gherkin
Scenario: Reactivating an already-active user
  Given a user with deactivated_at IS NULL exists
  When the admin calls POST /admin/users/:id/reactivate
  Then they receive 200 with the current user state (idempotent)
```

### Guard: GDPR-purged user cannot be reactivated

```gherkin
Scenario: Cannot reactivate a purged user
  Given a user with deleted_at IS NOT NULL exists
  When the admin calls POST /admin/users/:id/reactivate
  Then they receive 409 "User has been permanently deleted"
```

### Note: Reactivated user must re-authenticate

```gherkin
Scenario: Reactivated user has no valid tokens
  Given a previously deactivated user whose tokens were revoked
  When the admin reactivates them
  Then the user must sign in again via OAuth (no token re-issue)
```

---

## DELETE /admin/users/:id (GDPR Purge)

### Happy Path: GDPR purge

```gherkin
Scenario: Admin purges a user (GDPR deletion)
  Given a user exists with PII (email, display_name, avatar_url)
  When the admin calls DELETE /admin/users/:id
  Then the user's email, display_name, and avatar_url are set to NULL
  And deleted_at is set to NOW()
  And deactivated_at is set (COALESCE with NOW())
  And all oauth_accounts for the user are hard-deleted
  And all refresh_tokens for the user are hard-deleted
  And auth_events ip_address, user_agent, metadata are scrubbed for the user
  And a 'user_purged' audit event is logged with the admin's ID in metadata
  And they receive 204 No Content
```

### Guard: Self-deletion blocked

```gherkin
Scenario: Admin cannot purge their own account
  When the admin calls DELETE /admin/users/:own-id
  Then they receive 403 "Cannot perform this action on your own account"
```

### Guard: Already purged

```gherkin
Scenario: Cannot purge an already-purged user
  Given a user with deleted_at IS NOT NULL exists
  When the admin calls DELETE /admin/users/:id
  Then they receive 409 "User has already been purged"
```

### Transaction atomicity

```gherkin
Scenario: Purge is all-or-nothing
  Given the oauth_accounts DELETE fails mid-transaction
  Then the entire transaction rolls back
  And the user's PII is preserved (not partially scrubbed)
```

---

## JWT Role Propagation

### Signin includes role

```gherkin
Scenario: Signin response includes user role
  Given a user with role 'curator' signs in
  When they receive the auth response
  Then the user object contains role: 'curator'
  And the access token JWT contains role: 'curator'
```

### Refresh fetches fresh role

```gherkin
Scenario: Token refresh uses current DB role, not cached
  Given a user was role 'admin' at signin
  And their role was changed to 'user' in the DB
  When their token is refreshed
  Then the new access token contains role: 'user'
```

### getUserAccountStatus checks deleted_at

```gherkin
Scenario: Purged user cannot refresh tokens
  Given a user has been GDPR-purged (deleted_at IS NOT NULL)
  When they attempt to refresh their token
  Then getUserAccountStatus returns 'deleted'
  And they receive 403
```

---

## CLI: set-role

### Happy Path: Bootstrap admin

```gherkin
Scenario: Set first user to admin via CLI
  Given a user with email "owner@example.com" exists with role 'user'
  When running: npm run set-role -- owner@example.com admin
  Then the user's role is updated to 'admin'
  And a success message is printed to stdout
  And the script exits with code 0
```

### Error: User not found

```gherkin
Scenario: Email does not match any user
  When running: npm run set-role -- nobody@example.com admin
  Then "User not found" is printed to stderr
  And the script exits with code 1
```

### Error: Invalid role

```gherkin
Scenario: Invalid role value provided
  When running: npm run set-role -- user@example.com superadmin
  Then an error message about valid roles is printed
  And the script exits with code 1
```

### Warning: Deactivated user

```gherkin
Scenario: Setting role on a deactivated user
  Given a user with deactivated_at IS NOT NULL
  When running: npm run set-role -- user@example.com admin
  Then the role is updated
  And a warning is printed: "Note: this user is currently deactivated"
```
