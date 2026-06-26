BEGIN;

ALTER TABLE queue_day_closures
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE queue_day_closures
SET closed_at = created_at
WHERE closed_at IS NULL;

COMMIT;
