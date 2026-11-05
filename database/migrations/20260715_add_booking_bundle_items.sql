CREATE TABLE IF NOT EXISTS booking_bundle_items (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  service_name_snapshot TEXT NOT NULL,
  service_slug_snapshot TEXT NOT NULL,
  booking_quantity INTEGER NOT NULL CHECK (booking_quantity BETWEEN 1 AND 24),
  price_amount_cents INTEGER NOT NULL CHECK (price_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, service_id)
);

CREATE INDEX IF NOT EXISTS booking_bundle_items_booking_idx
  ON booking_bundle_items (booking_id, sort_order, id);

CREATE INDEX IF NOT EXISTS booking_bundle_items_capacity_idx
  ON booking_bundle_items (tenant_id, location_id, service_id, scheduled_start_at, scheduled_end_at);

INSERT INTO booking_bundle_items (
  booking_id, tenant_id, location_id, service_id, service_name_snapshot, service_slug_snapshot,
  booking_quantity, price_amount_cents, currency, scheduled_start_at, scheduled_end_at, sort_order
)
SELECT
  bookings.id, bookings.tenant_id, bookings.location_id, bookings.service_id, vendor_services.name, vendor_services.slug,
  bookings.booking_quantity, vendor_services.price_amount_cents, vendor_services.currency,
  bookings.scheduled_start_at, bookings.scheduled_end_at, 0
FROM bookings
INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
ON CONFLICT (booking_id, service_id) DO NOTHING;

DROP TRIGGER IF EXISTS set_booking_bundle_items_updated_at ON booking_bundle_items;
CREATE TRIGGER set_booking_bundle_items_updated_at
BEFORE UPDATE ON booking_bundle_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
