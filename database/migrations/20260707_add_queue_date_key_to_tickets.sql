BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS queue_date_key TEXT;

UPDATE tickets
SET queue_date_key = date_key
WHERE queue_date_key IS NULL;

ALTER TABLE tickets
  ALTER COLUMN queue_date_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_tenant_location_queue_date_idx
  ON tickets (tenant_id, location_id, queue_date_key);

COMMIT;
