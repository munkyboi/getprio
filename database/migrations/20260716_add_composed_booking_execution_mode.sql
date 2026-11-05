BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'parallel'
  CHECK (execution_mode IN ('parallel', 'sequential'));

ALTER TABLE group_funded_bookings
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'parallel'
  CHECK (execution_mode IN ('parallel', 'sequential'));

COMMIT;
