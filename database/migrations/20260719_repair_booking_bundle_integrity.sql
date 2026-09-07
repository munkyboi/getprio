BEGIN;

-- A legacy clean-slate bootstrap could drop and recreate bookings while
-- preserving booking_bundle_items. Remove any rows that no longer match the
-- booking, location, and service vendor boundary before restoring constraints.
CREATE TABLE IF NOT EXISTS booking_bundle_integrity_repairs (
  id BIGSERIAL PRIMARY KEY,
  bundle_item_snapshot JSONB NOT NULL,
  repair_reason TEXT NOT NULL,
  repaired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Match application write order so booking creation cannot deadlock while the
-- repair upgrades parent constraints and then rewrites bundle rows.
LOCK TABLE bookings IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE store_locations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE vendor_services IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE booking_bundle_items IN SHARE ROW EXCLUSIVE MODE;

WITH removed_bundle_items AS (
  DELETE FROM booking_bundle_items AS bundle_item
  WHERE NOT EXISTS (
    SELECT 1
    FROM bookings AS booking
    INNER JOIN store_locations AS location
      ON location.id = bundle_item.location_id
     AND location.tenant_id = bundle_item.tenant_id
    INNER JOIN vendor_services AS service
      ON service.id = bundle_item.service_id
     AND service.tenant_id = bundle_item.tenant_id
    WHERE booking.id = bundle_item.booking_id
      AND booking.tenant_id = bundle_item.tenant_id
      AND booking.location_id = bundle_item.location_id
  )
  RETURNING to_jsonb(bundle_item) AS bundle_item_snapshot
)
INSERT INTO booking_bundle_integrity_repairs (bundle_item_snapshot, repair_reason)
SELECT bundle_item_snapshot, 'Removed bundle item that did not match its booking vendor or location.'
FROM removed_bundle_items;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_bundle_scope_key
  UNIQUE (id, tenant_id, location_id);

ALTER TABLE store_locations
  ADD CONSTRAINT store_locations_id_tenant_key
  UNIQUE (id, tenant_id);

ALTER TABLE vendor_services
  ADD CONSTRAINT vendor_services_id_tenant_key
  UNIQUE (id, tenant_id);

ALTER TABLE booking_bundle_items
  DROP CONSTRAINT IF EXISTS booking_bundle_items_booking_id_fkey,
  DROP CONSTRAINT IF EXISTS booking_bundle_items_location_id_fkey,
  DROP CONSTRAINT IF EXISTS booking_bundle_items_service_id_fkey;

ALTER TABLE booking_bundle_items
  ADD CONSTRAINT booking_bundle_items_booking_scope_fkey
    FOREIGN KEY (booking_id, tenant_id, location_id)
    REFERENCES bookings (id, tenant_id, location_id)
    ON DELETE CASCADE,
  ADD CONSTRAINT booking_bundle_items_location_scope_fkey
    FOREIGN KEY (location_id, tenant_id)
    REFERENCES store_locations (id, tenant_id)
    ON DELETE CASCADE,
  ADD CONSTRAINT booking_bundle_items_service_scope_fkey
    FOREIGN KEY (service_id, tenant_id)
    REFERENCES vendor_services (id, tenant_id)
    ON DELETE RESTRICT;

COMMIT;
