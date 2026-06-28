BEGIN;

CREATE TABLE IF NOT EXISTS store_locations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'Philippines',
  contact_email TEXT,
  contact_phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_locations_one_primary
  ON store_locations (tenant_id)
  WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS store_hours (
  id BIGSERIAL PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at TIME,
  closes_at TIME,
  is_closed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, weekday)
);

INSERT INTO store_locations (
  tenant_id,
  name,
  slug,
  contact_email,
  contact_phone,
  is_primary,
  is_active
)
SELECT
  tenants.id,
  'Main location',
  'main',
  tenants.contact_email,
  tenants.contact_phone,
  TRUE,
  TRUE
FROM tenants
WHERE NOT EXISTS (
  SELECT 1 FROM store_locations WHERE store_locations.tenant_id = tenants.id
);

INSERT INTO store_hours (location_id, weekday, opens_at, closes_at, is_closed)
SELECT store_locations.id, weekdays.weekday, '00:00'::TIME, '00:00'::TIME, FALSE
FROM store_locations
CROSS JOIN generate_series(0, 6) AS weekdays(weekday)
WHERE store_locations.is_primary = TRUE
ON CONFLICT (location_id, weekday) DO NOTHING;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES store_locations(id) ON DELETE CASCADE;

UPDATE tickets
SET location_id = store_locations.id
FROM store_locations
WHERE tickets.location_id IS NULL
  AND store_locations.tenant_id = tickets.tenant_id
  AND store_locations.is_primary = TRUE;

ALTER TABLE tickets
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE counters
  ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES store_locations(id) ON DELETE CASCADE;

UPDATE counters
SET location_id = store_locations.id
FROM store_locations
WHERE counters.location_id IS NULL
  AND store_locations.tenant_id = counters.tenant_id
  AND store_locations.is_primary = TRUE;

ALTER TABLE counters
  ALTER COLUMN location_id SET NOT NULL;

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_tenant_id_date_key_sequence_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_tenant_location_date_sequence_key'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_tenant_location_date_sequence_key
      UNIQUE (tenant_id, location_id, date_key, sequence);
  END IF;
END $$;

ALTER TABLE counters
  DROP CONSTRAINT IF EXISTS counters_tenant_id_key_date_key_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'counters_tenant_location_key_date_key'
  ) THEN
    ALTER TABLE counters
      ADD CONSTRAINT counters_tenant_location_key_date_key
      UNIQUE (tenant_id, location_id, key, date_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_locations_tenant_active
  ON store_locations (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_store_hours_location_weekday
  ON store_hours (location_id, weekday);

CREATE INDEX IF NOT EXISTS idx_tickets_location_status_created_at
  ON tickets (location_id, status, created_at);

CREATE OR REPLACE TRIGGER set_store_locations_updated_at
BEFORE UPDATE ON store_locations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER set_store_hours_updated_at
BEFORE UPDATE ON store_hours
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
