BEGIN;

ALTER TABLE vendor_services
  ADD COLUMN IF NOT EXISTS allow_booking_quantity BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS booking_quantity_label TEXT NOT NULL DEFAULT 'Units';

UPDATE vendor_services
SET booking_quantity_label = 'Units'
WHERE booking_quantity_label IS NULL OR BTRIM(booking_quantity_label) = '';

COMMIT;
