BEGIN;

-- Bound exports by their observation window. Historical checks only probe the
-- candidate ticket, preserving the first valid observation across all history.
CREATE INDEX IF NOT EXISTS wait_time_prediction_dataset_window_idx
  ON wait_time_prediction_samples (tenant_id, sampled_at, ticket_id)
  WHERE predictor_version = 'baseline-v1' AND outcome_type = 'called';

CREATE INDEX IF NOT EXISTS wait_time_prediction_dataset_ticket_idx
  ON wait_time_prediction_samples (ticket_id, sampled_at, id)
  WHERE predictor_version = 'baseline-v1' AND outcome_type = 'called';

CREATE INDEX IF NOT EXISTS developer_api_wait_time_dataset_window_idx
  ON developer_api_wait_time_prediction_samples (sampled_at, ticket_id)
  WHERE environment = 'sandbox' AND predictor_version = 'baseline-v1' AND outcome_type = 'called';

CREATE INDEX IF NOT EXISTS developer_api_wait_time_dataset_ticket_idx
  ON developer_api_wait_time_prediction_samples (ticket_id, sampled_at, id)
  WHERE environment = 'sandbox' AND predictor_version = 'baseline-v1' AND outcome_type = 'called';

COMMIT;
