-- migrate:up
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.user_id', true), '')::UUID;
END;
$$ LANGUAGE plpgsql STABLE;

-- migrate:down
DROP FUNCTION IF EXISTS current_app_user_id();
