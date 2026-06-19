BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS carried_over_at TIMESTAMPTZ;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS carry_over_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE queue_day_closures
  ADD COLUMN IF NOT EXISTS next_queue_date_key TEXT NOT NULL DEFAULT '00000000';

ALTER TABLE queue_day_closures
  ADD COLUMN IF NOT EXISTS waiting_carried_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE queue_day_closures
  ADD COLUMN IF NOT EXISTS called_unserved_count INTEGER NOT NULL DEFAULT 0;

UPDATE queue_day_closures
SET next_queue_date_key = queue_date_key
WHERE next_queue_date_key = '00000000' OR next_queue_date_key IS NULL;

COMMIT;
