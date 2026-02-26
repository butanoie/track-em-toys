-- migrate:up
ALTER TABLE refresh_tokens
  ADD COLUMN client_type TEXT NOT NULL DEFAULT 'web'
    CHECK (client_type IN ('native', 'web'));

COMMENT ON COLUMN refresh_tokens.client_type IS
  'Identifies the client platform that created this token. Derived from the
   verified provider id_token audience claim (bundleId/iosClientId = native,
   servicesId/webClientId = web). Used to determine refresh token delivery
   (body for native, httpOnly cookie for web). Cannot be spoofed by the client.';

-- migrate:down
ALTER TABLE refresh_tokens DROP COLUMN client_type;
