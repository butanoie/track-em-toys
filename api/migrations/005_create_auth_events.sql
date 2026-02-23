-- migrate:up
CREATE TABLE auth_events (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID            REFERENCES users(id) ON DELETE SET NULL,
    event_type  VARCHAR(50)     NOT NULL CHECK (event_type IN (
                    'signin', 'refresh', 'logout', 'link_account',
                    'token_reuse_detected', 'account_deactivated'
                )),
    ip_address  INET,
    user_agent  VARCHAR(512),
    metadata    JSONB,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN auth_events.event_type IS
    'signin | refresh | logout | link_account | token_reuse_detected | account_deactivated';

CREATE INDEX idx_auth_events_user_id ON auth_events (user_id);
CREATE INDEX idx_auth_events_type_created ON auth_events (event_type, created_at);
CREATE INDEX idx_auth_events_created_at ON auth_events (created_at);

-- migrate:down
DROP TABLE IF EXISTS auth_events;
