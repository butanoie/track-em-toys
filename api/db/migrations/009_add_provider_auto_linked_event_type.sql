-- migrate:up

-- Add 'provider_auto_linked' to the auth_events.event_type CHECK constraint.
-- This event type is emitted by resolveOrCreateUser (Branch B) when a new OAuth
-- provider is automatically linked to an existing account via verified email match.
-- Without this value the DB constraint silently rejects every auto-link audit row.

ALTER TABLE auth_events
  DROP CONSTRAINT auth_events_event_type_check;

ALTER TABLE auth_events
  ADD CONSTRAINT auth_events_event_type_check CHECK (event_type IN (
    'signin', 'refresh', 'logout', 'link_account',
    'provider_auto_linked', 'token_reuse_detected', 'account_deactivated'
  ));

COMMENT ON COLUMN auth_events.event_type IS
  'signin | refresh | logout | link_account | provider_auto_linked | token_reuse_detected | account_deactivated';

-- migrate:down

ALTER TABLE auth_events
  DROP CONSTRAINT auth_events_event_type_check;

ALTER TABLE auth_events
  ADD CONSTRAINT auth_events_event_type_check CHECK (event_type IN (
    'signin', 'refresh', 'logout', 'link_account',
    'token_reuse_detected', 'account_deactivated'
  ));

COMMENT ON COLUMN auth_events.event_type IS
  'signin | refresh | logout | link_account | token_reuse_detected | account_deactivated';
