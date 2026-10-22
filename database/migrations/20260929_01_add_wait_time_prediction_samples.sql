BEGIN;

CREATE TABLE IF NOT EXISTS wait_time_prediction_samples (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  queue_date_key TEXT NOT NULL,
  predictor_version TEXT NOT NULL,
  feature_hash TEXT NOT NULL,
  sample_bucket TIMESTAMPTZ NOT NULL,
  sampled_at TIMESTAMPTZ NOT NULL,
  features JSONB NOT NULL,
  predicted_wait_minutes NUMERIC(10, 2) NOT NULL CHECK (predicted_wait_minutes >= 0),
  outcome_type TEXT CHECK (outcome_type IN ('called', 'censored')),
  outcome_at TIMESTAMPTZ,
  outcome_wait_minutes NUMERIC(10, 2) CHECK (outcome_wait_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (outcome_type = 'called' AND outcome_at IS NOT NULL AND outcome_wait_minutes IS NOT NULL)
    OR (outcome_type = 'censored' AND outcome_at IS NOT NULL AND outcome_wait_minutes IS NULL)
    OR (outcome_type IS NULL AND outcome_at IS NULL AND outcome_wait_minutes IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS wait_time_prediction_samples_dedupe_idx
  ON wait_time_prediction_samples (ticket_id, predictor_version, sample_bucket);

CREATE INDEX IF NOT EXISTS wait_time_prediction_samples_training_idx
  ON wait_time_prediction_samples (tenant_id, location_id, created_at)
  WHERE outcome_type = 'called';

COMMIT;
