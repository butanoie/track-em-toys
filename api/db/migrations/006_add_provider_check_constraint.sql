-- migrate:up
ALTER TABLE oauth_accounts
  ADD CONSTRAINT chk_oauth_accounts_provider
  CHECK (provider IN ('apple', 'google'));

-- migrate:down
ALTER TABLE oauth_accounts
  DROP CONSTRAINT IF EXISTS chk_oauth_accounts_provider;
