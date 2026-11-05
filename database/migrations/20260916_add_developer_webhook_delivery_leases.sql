BEGIN;

ALTER TABLE developer_webhook_deliveries
  DROP CONSTRAINT IF EXISTS developer_webhook_deliveries_status_check,
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS leased_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_status INTEGER,
  ADD COLUMN IF NOT EXISTS retry_until TIMESTAMPTZ;

UPDATE developer_webhook_deliveries
SET retry_until = COALESCE(expires_at, NOW() + INTERVAL '24 hours')
WHERE retry_until IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'developer_webhook_deliveries_status_check'
      AND conrelid = 'developer_webhook_deliveries'::regclass
  ) THEN
    ALTER TABLE developer_webhook_deliveries
      ADD CONSTRAINT developer_webhook_deliveries_status_check
      CHECK (status IN ('pending', 'processing', 'retry', 'sent', 'failed'));
  END IF;
END $$;

COMMIT;
