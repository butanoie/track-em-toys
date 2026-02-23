-- migrate:up
CREATE TABLE users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255),
    email_verified  BOOLEAN         NOT NULL DEFAULT FALSE,
    display_name    VARCHAR(255),
    avatar_url      TEXT,
    deactivated_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email_lower ON users (LOWER(email));

-- Generic trigger function: if reused by other tables, extract to a shared migration
-- and remove the DROP FUNCTION from this file's migrate:down.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- migrate:down
DROP TRIGGER IF EXISTS users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at();
DROP INDEX IF EXISTS idx_users_email_lower;
DROP TABLE IF EXISTS users;
