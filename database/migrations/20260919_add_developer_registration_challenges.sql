BEGIN;

ALTER TABLE customer_registration_otps
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'customer';

ALTER TABLE customer_registration_otps
  DROP CONSTRAINT IF EXISTS customer_registration_otps_purpose_check;

ALTER TABLE customer_registration_otps
  ADD CONSTRAINT customer_registration_otps_purpose_check
  CHECK (purpose IN ('customer', 'developer'));

COMMIT;
