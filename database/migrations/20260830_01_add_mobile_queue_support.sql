BEGIN;

ALTER TABLE store_locations
  ADD COLUMN IF NOT EXISTS queue_join_id UUID;

UPDATE store_locations
SET queue_join_id = gen_random_uuid()
WHERE queue_join_id IS NULL;

ALTER TABLE store_locations
  ALTER COLUMN queue_join_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN queue_join_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_locations_queue_join_id_idx
  ON store_locations (queue_join_id);

ALTER TABLE queue_join_payments
  ALTER COLUMN otp_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS mobile_push_registrations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  app_version TEXT,
  locale TEXT,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, installation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_push_registrations_active_token_idx
  ON mobile_push_registrations (token)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS mobile_push_registrations_user_idx
  ON mobile_push_registrations (user_id, is_active);

CREATE OR REPLACE TRIGGER set_mobile_push_registrations_updated_at
BEFORE UPDATE ON mobile_push_registrations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS mobile_oauth_codes (
  id BIGSERIAL PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  response_body JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mobile_oauth_codes_expiry_idx
  ON mobile_oauth_codes (expires_at);

COMMIT;
