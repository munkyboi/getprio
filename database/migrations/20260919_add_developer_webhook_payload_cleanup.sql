BEGIN;

ALTER TABLE developer_webhook_deliveries
  ADD COLUMN IF NOT EXISTS payload_purged_at TIMESTAMPTZ;

COMMIT;
