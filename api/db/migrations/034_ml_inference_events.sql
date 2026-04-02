-- migrate:up
CREATE TABLE ml_inference_events (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID            NOT NULL REFERENCES users(id),
    event_type  VARCHAR(50)     NOT NULL CHECK (event_type IN (
                    'scan_started', 'scan_completed', 'scan_failed',
                    'prediction_accepted', 'scan_abandoned', 'browse_catalog'
                )),
    model_name  VARCHAR(120),
    metadata    JSONB,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN ml_inference_events.event_type IS
    'scan_started | scan_completed | scan_failed | prediction_accepted | scan_abandoned | browse_catalog';

COMMENT ON COLUMN ml_inference_events.model_name IS
    'Denormalized model name for aggregate grouping without JSONB extraction';

CREATE INDEX idx_ml_events_user_id ON ml_inference_events (user_id);
CREATE INDEX idx_ml_events_created_at ON ml_inference_events (created_at);
CREATE INDEX idx_ml_events_type_created ON ml_inference_events (event_type, created_at);
CREATE INDEX idx_ml_events_model_created ON ml_inference_events (model_name, created_at)
    WHERE model_name IS NOT NULL;

-- migrate:down
DROP TABLE IF EXISTS ml_inference_events;
