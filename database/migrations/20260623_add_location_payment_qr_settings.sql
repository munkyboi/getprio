BEGIN;

ALTER TABLE store_locations
  ADD COLUMN IF NOT EXISTS payment_method_label TEXT,
  ADD COLUMN IF NOT EXISTS payment_account_display_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_account_identifier_display TEXT,
  ADD COLUMN IF NOT EXISTS payment_qr_image_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_qr_active BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
