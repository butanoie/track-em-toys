-- migrate:up

-- Add 'consent_revoked' to the auth_events.event_type CHECK constraint.
-- This event type is emitted by the Apple server-to-server webhook handler
-- when Apple notifies us that a user has revoked consent for Sign in with Apple.

ALTER TABLE auth_events
  DROP CONSTRAINT auth_events_event_type_check;

ALTER TABLE auth_events
  ADD CONSTRAINT auth_events_event_type_check CHECK (event_type IN (
    'signin', 'refresh', 'logout', 'link_account',
    'provider_auto_linked', 'token_reuse_detected', 'account_deactivated',
    'consent_revoked'
  ));

COMMENT ON COLUMN auth_events.event_type IS
  'signin | refresh | logout | link_account | provider_auto_linked | token_reuse_detected | account_deactivated | consent_revoked';

-- migrate:down

ALTER TABLE auth_events
  DROP CONSTRAINT auth_events_event_type_check;

ALTER TABLE auth_events
  ADD CONSTRAINT auth_events_event_type_check CHECK (event_type IN (
    'signin', 'refresh', 'logout', 'link_account',
    'provider_auto_linked', 'token_reuse_detected', 'account_deactivated'
  ));

COMMENT ON COLUMN auth_events.event_type IS
  'signin | refresh | logout | link_account | provider_auto_linked | token_reuse_detected | account_deactivated';
