BEGIN;

ALTER TABLE store_locations
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE vendor_services
  ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE TABLE IF NOT EXISTS location_services (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE CASCADE,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  price_amount_cents INTEGER,
  price_display TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, service_id)
);

CREATE INDEX IF NOT EXISTS location_services_tenant_location_idx
  ON location_services (tenant_id, location_id, is_active, sort_order);

COMMIT;
