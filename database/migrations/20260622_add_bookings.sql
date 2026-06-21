BEGIN;

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  customer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'rescheduled', 'completed', 'canceled', 'disputed', 'reviewed')
  ),
  notes TEXT,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at)
);

CREATE INDEX IF NOT EXISTS bookings_customer_schedule_idx
  ON bookings (customer_user_id, scheduled_start_at DESC);

CREATE INDEX IF NOT EXISTS bookings_vendor_schedule_idx
  ON bookings (tenant_id, location_id, scheduled_start_at ASC);

DROP TRIGGER IF EXISTS set_bookings_updated_at ON bookings;
CREATE TRIGGER set_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
