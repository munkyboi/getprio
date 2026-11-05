BEGIN;

ALTER TABLE store_locations
  ADD COLUMN IF NOT EXISTS payment_bank_name TEXT;

COMMIT;
