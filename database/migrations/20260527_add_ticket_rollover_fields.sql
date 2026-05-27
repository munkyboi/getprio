ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS queue_date_key TEXT,
  ADD COLUMN IF NOT EXISTS carried_over_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carry_over_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unserved_at TIMESTAMPTZ;

UPDATE tickets
SET queue_date_key = date_key
WHERE queue_date_key IS NULL;

ALTER TABLE tickets
  ALTER COLUMN queue_date_key SET NOT NULL;

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('waiting', 'called', 'served', 'skipped', 'cancelled', 'unserved'));

CREATE INDEX IF NOT EXISTS idx_tickets_active_queue_day
  ON tickets (tenant_id, location_id, queue_date_key, status, created_at);
