BEGIN;

CREATE TABLE IF NOT EXISTS vendor_services (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  allow_booking_quantity BOOLEAN NOT NULL DEFAULT FALSE,
  booking_quantity_label TEXT NOT NULL DEFAULT 'Units',
  manual_payment_required BOOLEAN NOT NULL DEFAULT FALSE,
  price_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  price_display TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS vendor_services_tenant_active_sort_idx
  ON vendor_services (tenant_id, is_active, sort_order, name);

DROP TRIGGER IF EXISTS set_vendor_services_updated_at ON vendor_services;
CREATE TRIGGER set_vendor_services_updated_at
BEFORE UPDATE ON vendor_services
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
