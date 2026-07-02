BEGIN;

ALTER TABLE vendor_services
  ADD COLUMN IF NOT EXISTS booking_capacity_scope TEXT NOT NULL DEFAULT 'service'
  CHECK (booking_capacity_scope IN ('service', 'location'));

COMMIT;
