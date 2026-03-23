-- migrate:up
-- Fix auth_events FK to match tombstone pattern: user rows are never deleted,
-- so RESTRICT prevents accidental deletion of users with audit records.
-- Aligns with migration 021 which fixed oauth_accounts and refresh_tokens.
ALTER TABLE auth_events
  DROP CONSTRAINT auth_events_user_id_fkey,
  ADD CONSTRAINT auth_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- migrate:down
ALTER TABLE auth_events
  DROP CONSTRAINT auth_events_user_id_fkey,
  ADD CONSTRAINT auth_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
