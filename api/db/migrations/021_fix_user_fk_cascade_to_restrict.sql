-- migrate:up

-- Fix tech debt: oauth_accounts and refresh_tokens have ON DELETE CASCADE on
-- user_id FK from migrations 002/003. The tombstone pattern (Phase 1.5b) never
-- deletes user rows, so CASCADE never fires — but it contradicts the documented
-- invariant. Change to ON DELETE RESTRICT to enforce the tombstone contract at
-- the DB level.

-- oauth_accounts: drop auto-named FK, re-add with RESTRICT
ALTER TABLE oauth_accounts
  DROP CONSTRAINT oauth_accounts_user_id_fkey;

ALTER TABLE oauth_accounts
  ADD CONSTRAINT oauth_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- refresh_tokens: drop auto-named FK, re-add with RESTRICT
ALTER TABLE refresh_tokens
  DROP CONSTRAINT refresh_tokens_user_id_fkey;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

-- migrate:down

ALTER TABLE oauth_accounts
  DROP CONSTRAINT oauth_accounts_user_id_fkey;

ALTER TABLE oauth_accounts
  ADD CONSTRAINT oauth_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE refresh_tokens
  DROP CONSTRAINT refresh_tokens_user_id_fkey;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
