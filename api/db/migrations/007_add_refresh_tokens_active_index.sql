-- migrate:up
-- Partial index to efficiently serve revokeAllUserRefreshTokens:
-- UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
  ON refresh_tokens (user_id)
  WHERE revoked_at IS NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_refresh_tokens_user_active;
