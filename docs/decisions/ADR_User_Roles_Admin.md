# ADR: User Roles & Admin Foundation (Phase 1.5b)

**Date:** 2026-03-17
**Status:** Implemented
**Depends on:** Phase 1.3 (Auth), Phase 1.5 (Catalog API)
**Blocks:** Phase 1.9 (Photo Upload — requires curator role)
**GitHub Issue:** #35

---

## Context

The app needs role-based access control to gate catalog write operations (Phase 1.9) and user management. Decision 6 in `2026-03-16_roadmap_session_decisions.md` chose a hybrid approach: role column on users + admin routes in the same web app, code-split.

## Decision

### Role Model

Simple hierarchical RBAC with 3 roles stored as a single `TEXT` column:

| Role      | Hierarchy | Capabilities                                                 |
| --------- | --------- | ------------------------------------------------------------ |
| `user`    | 0         | Browse catalog (read-only)                                   |
| `curator` | 1         | + catalog write operations (items, photos, edits)            |
| `admin`   | 2         | + user management, role assignment, deactivation, GDPR purge |

`requireRole('curator')` grants access to curators AND admins (hierarchy comparison). Single-role model — no multi-role join table.

**Retrofit path to multi-role:** Replace column with `user_roles` join table, change JWT claim from `role: string` to `roles: string[]`, update `requireRole()` internals. ~Half-day effort. Nothing in this design creates obstacles.

**Retrofit path to permissions-based:** Add `role_permissions` mapping, change `requireRole()` to `requirePermission()`. Route handler signatures stay identical.

### Migration

`019_add_user_role.sql` — `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'curator', 'admin'))`. No index (low-cardinality column, small table).

`020_add_admin_event_types.sql` — Extends `auth_events.event_type` CHECK to include `role_changed`, `account_reactivated`, `user_purged`.

### JWT Changes

- `signAccessToken` embeds `{ sub: userId, role }` in the JWT payload
- `FastifyJWT` type augmentation extended to `{ sub: string; role: UserRole }`
- Token refresh fetches current role from DB via `getUserRoleForRefresh()` (not cached from old token)
- **15-minute stale token window:** After demotion, the old access token remains valid until expiry. Mitigation: demotion also calls `revokeAllUserRefreshTokens`, capping damage at one token lifetime. Accepted trade-off for a personal/small-team tool.

### Role Infrastructure

- `src/auth/role.ts` — `ROLE_HIERARCHY`, `hasRequiredRole()`, `isRolePayload()`, `requireRole()` factory
- Registered as Fastify decorator for consistency with `authenticate` pattern
- `isRolePayload` type guard validates role is one of three valid values — pre-migration tokens (no role claim) get 403

### Admin API Routes

All routes require `preHandler: [fastify.authenticate, fastify.requireRole('admin')]`.

| Method | Path                          | Purpose                                       | Rate Limit |
| ------ | ----------------------------- | --------------------------------------------- | ---------- |
| GET    | `/admin/users`                | Paginated user list, filterable by role/email | 30/min     |
| PATCH  | `/admin/users/:id/role`       | Role assignment                               | 20/min     |
| POST   | `/admin/users/:id/deactivate` | Deactivate user + revoke tokens               | 20/min     |
| POST   | `/admin/users/:id/reactivate` | Reactivate user                               | 20/min     |
| DELETE | `/admin/users/:id`            | GDPR purge (tombstone)                        | 5/min      |

### Guards

- **No self-modification**: `params.id.toLowerCase() === request.user.sub` → 403 (on role change, deactivate, delete)
- **No escalation**: `ROLE_HIERARCHY[newRole] > ROLE_HIERARCHY[actorRole]` → 403
- **GDPR-purged rejection**: All mutation routes check `deleted_at IS NOT NULL` → 409
- **Last-admin protection**: Before demoting an admin, verify `COUNT(*) >= 2` active admins exist
- **UUID validation**: `format: 'uuid'` on all `:id` params; prevents 500 from invalid UUIDs
- **Content-Type enforcement**: Same `preValidation` hook as auth routes

### GDPR Purge Sequence (single transaction)

1. Validate target exists, not already purged
2. `UPDATE users SET email=NULL, display_name=NULL, avatar_url=NULL, deactivated_at=COALESCE(deactivated_at, NOW()), deleted_at=NOW(), updated_at=NOW()`
3. `DELETE FROM oauth_accounts WHERE user_id = $1`
4. `DELETE FROM refresh_tokens WHERE user_id = $1`
5. `UPDATE auth_events SET ip_address=NULL, user_agent=NULL, metadata=NULL WHERE user_id = $1`
6. Log `user_purged` audit event with actor in metadata

Note: `oauth_accounts` and `refresh_tokens` use `ON DELETE RESTRICT` (migration 021 fixed legacy CASCADE). Explicit DELETEs in the purge transaction are required.

### Admin Audit Events

Admin mutations log to `auth_events`:

- Role change → `role_changed` (metadata: `{ initiated_by, old_role, new_role }`)
- Reactivation → `account_reactivated` (metadata: `{ initiated_by }`)
- GDPR purge → `user_purged` (metadata: `{ initiated_by }`)
- Deactivation → `account_deactivated` (existing event type, metadata: `{ initiated_by }`)

### `getUserStatus` → `getUserStatusAndRole`

Merged the separate `getUserAccountStatus` + `getUserRoleForRefresh` queries into a single `getUserStatusAndRole` query that returns `{ status: UserAccountStatus, role: UserRole | null }`. Checks both `deactivated_at` and `deleted_at`, and fetches the current role — all in one DB round-trip during token refresh. Closes the defense-in-depth gap where a purged user with anomalous `deactivated_at IS NULL` could pass the refresh check.

### CLI Bootstrap

`npm run set-role -- <email> <role>` — standalone tsx script at `scripts/set-role.ts`. Follows `npm run seed` pattern. Warns if target user is deactivated. GDPR-purged users have `email=NULL` so the `WHERE LOWER(email) = LOWER($1)` naturally excludes them.

### Admin Web UI (Phase 1.5b-UI — Issue #49)

Code-split admin section within the same SPA under `/admin/*` routes. Admin JS bundles never ship to regular users.

**Routing:**

- Layout route: `_authenticated/admin.tsx` — component-level role guard (redirects non-admins to `/`), sidebar, admin header
- Index route: `_authenticated/admin/index.tsx` — redirects to `/admin/users`
- Users page: `_authenticated/admin/users.tsx` — data table with filters/pagination

**Why component-level guard (not `beforeLoad`):** The parent `_authenticated` route uses a component-level guard because auth loading state can't be checked in `beforeLoad`. On cold page load, `authStore.getToken()` is null until the silent refresh completes. A `beforeLoad` guard on the admin route would incorrectly redirect valid admins during this window. Consistent with the existing auth pattern.

**Code splitting:** TanStack Router's `autoCodeSplitting: true` (in `vite.config.ts`) automatically lazy-loads route components. No manual `React.lazy()` needed.

**Navigation:**

- Shared `AppHeader` component (extracted from Dashboard and Settings duplicate headers)
- Role-aware nav: admins see "Admin" link in the header
- Admin layout has its own header with "Back to App" link + sidebar
- Admin sidebar: Users (active), Catalog (future placeholder), System (future placeholder)

**Data flow:** URL search params for filter/pagination state via TanStack Router `validateSearch`. `placeholderData: keepPreviousData` in TanStack Query for smooth pagination.

**UI components:** Shadcn/ui Table, Select, AlertDialog, Input added via CLI (`npx shadcn@latest add`). Confirm dialog pattern for destructive actions with "type DELETE" safeguard.

**Dependencies added:** `react-hook-form`, `@hookform/resolvers` (installed for future catalog editing forms, not used in admin MVP).

### Scope NOT Included

- No changes to existing catalog read routes (all stay public)
- No `requireRole()` on catalog routes yet (deferred to Phase 1.9 write routes)
- No permissions-based access control (RBAC is sufficient)
- No multi-role support (single role column)

## Consequences

- All existing tokens (up to 15 min old) will lack `role` claim after deploy — users re-authenticate within one refresh cycle
- `getUserStatus` renamed to `getUserAccountStatus` — callers in auth routes must be updated
- Existing test fixtures need `role` added to all mock `User` objects
- Every `SELECT` on `users` table must include `role` in the column list

## Known Tech Debt

- `oauth_accounts` and `refresh_tokens` legacy `ON DELETE CASCADE` fixed to `ON DELETE RESTRICT` in migration 021.
- Post-refresh web cache staleness: `sessionStorage` may show stale role until next sign-in. Acceptable since server-side JWT is always fresh.
