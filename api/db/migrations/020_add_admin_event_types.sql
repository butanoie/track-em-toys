-- migrate:up

-- Add admin-action event types to auth_events for audit logging.
-- role_changed: admin changes a user's role
-- account_reactivated: admin reactivates a deactivated user
-- user_purged: admin performs GDPR deletion (PII scrub + auth data hard-delete)

ALTER TABLE auth_events
  DROP CONSTRAINT auth_events_event_type_check;

ALTER TABLE auth_events
  ADD CONSTRAINT auth_events_event_type_check CHECK (event_type IN (
    'signin', 'refresh', 'logout', 'link_account',
    'provider_auto_linked', 'token_reuse_detected', 'account_deactivated',
    'consent_revoked',
    'role_changed', 'account_reactivated', 'user_purged'
  ));

COMMENT ON COLUMN auth_events.event_type IS
  'signin | refresh | logout | link_account | provider_auto_linked | token_reuse_detected | account_deactivated | consent_revoked | role_changed | account_reactivated | user_purged';

-- migrate:down

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
