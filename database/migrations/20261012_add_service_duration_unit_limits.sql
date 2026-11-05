BEGIN;
ALTER TABLE vendor_services ADD COLUMN IF NOT EXISTS booking_quantity_min INTEGER NOT NULL DEFAULT 1;
ALTER TABLE vendor_services ADD COLUMN IF NOT EXISTS booking_quantity_max INTEGER NOT NULL DEFAULT 24;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'vendor_services'::regclass AND conname = 'vendor_services_quantity_bounds') THEN
    ALTER TABLE vendor_services ADD CONSTRAINT vendor_services_quantity_bounds
      CHECK (booking_quantity_min BETWEEN 1 AND 24 AND booking_quantity_max BETWEEN booking_quantity_min AND 24);
  END IF;
END $$;
COMMIT;
