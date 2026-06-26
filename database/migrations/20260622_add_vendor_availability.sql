BEGIN;

CREATE TABLE IF NOT EXISTS vendor_availability_blocks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT REFERENCES vendor_services(id) ON DELETE SET NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS vendor_availability_blocks_location_day_idx
  ON vendor_availability_blocks (tenant_id, location_id, weekday, starts_at);

CREATE TABLE IF NOT EXISTS vendor_availability_exceptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT REFERENCES vendor_services(id) ON DELETE SET NULL,
  exception_date DATE NOT NULL,
  starts_at TIME,
  ends_at TIME,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  capacity INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at < ends_at)
  )
);

CREATE INDEX IF NOT EXISTS vendor_availability_exceptions_location_date_idx
  ON vendor_availability_exceptions (tenant_id, location_id, exception_date);

DROP TRIGGER IF EXISTS set_vendor_availability_blocks_updated_at ON vendor_availability_blocks;
CREATE TRIGGER set_vendor_availability_blocks_updated_at
BEFORE UPDATE ON vendor_availability_blocks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_vendor_availability_exceptions_updated_at ON vendor_availability_exceptions;
CREATE TRIGGER set_vendor_availability_exceptions_updated_at
BEFORE UPDATE ON vendor_availability_exceptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
