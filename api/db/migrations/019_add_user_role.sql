-- migrate:up

-- Add role column to users table for RBAC authorization.
-- Three-tier hierarchy: user < curator < admin.
-- Role is included in JWT access token claims — no per-request DB lookup needed.
-- DEFAULT 'user' backfills all existing rows on ALTER.

ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'curator', 'admin'));

COMMENT ON COLUMN public.users.role IS
  'Authorization role: user | curator | admin. Included in JWT claims.';

-- migrate:down

ALTER TABLE users DROP COLUMN IF EXISTS role;
