BEGIN;

ALTER TABLE developer_webhook_deliveries
  ADD COLUMN IF NOT EXISTS manual_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_manual_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_last_error TEXT,
  ADD COLUMN IF NOT EXISTS manual_response_status INTEGER;

ALTER TABLE developer_webhook_deliveries
  DROP CONSTRAINT IF EXISTS developer_webhook_deliveries_manual_attempt_count_check,
  ADD CONSTRAINT developer_webhook_deliveries_manual_attempt_count_check
  CHECK (manual_attempt_count >= 0);

COMMIT;
