BEGIN;

CREATE TABLE IF NOT EXISTS developer_api_wait_time_prediction_samples (
  id BIGSERIAL PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES developer_api_tickets(id) ON DELETE CASCADE,
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  developer_api_profile_id UUID NOT NULL REFERENCES developer_api_profiles(id) ON DELETE CASCADE,
  developer_api_queue_id UUID NOT NULL REFERENCES developer_api_queues(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  predictor_version TEXT NOT NULL,
  feature_hash TEXT NOT NULL CHECK (char_length(feature_hash) = 64),
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

CREATE UNIQUE INDEX IF NOT EXISTS developer_api_wait_time_prediction_dedupe_idx
  ON developer_api_wait_time_prediction_samples (ticket_id, predictor_version, sample_bucket);

CREATE INDEX IF NOT EXISTS developer_api_wait_time_prediction_audit_idx
  ON developer_api_wait_time_prediction_samples (environment, developer_project_id, developer_api_queue_id, sampled_at)
  WHERE outcome_type = 'called';

COMMIT;
