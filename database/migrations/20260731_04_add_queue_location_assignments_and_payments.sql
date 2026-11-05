BEGIN;

CREATE TABLE IF NOT EXISTS tenant_membership_locations (
  id BIGSERIAL PRIMARY KEY,
  tenant_membership_id BIGINT NOT NULL REFERENCES tenant_memberships(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  assignment_source TEXT NOT NULL DEFAULT 'explicit'
    CHECK (assignment_source IN ('explicit', 'legacy_backfill')),
  assigned_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_membership_id, location_id)
);

INSERT INTO tenant_membership_locations (
  tenant_membership_id,
  location_id,
  assignment_source
)
SELECT membership.id, location.id, 'legacy_backfill'
FROM tenant_memberships AS membership
INNER JOIN store_locations AS location
  ON location.tenant_id = membership.tenant_id
 AND location.is_active = TRUE
WHERE membership.role = 'staff'
  AND membership.is_active = TRUE
ON CONFLICT (tenant_membership_id, location_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS tenant_membership_locations_location_idx
  ON tenant_membership_locations (location_id, tenant_membership_id);

CREATE OR REPLACE FUNCTION enforce_tenant_membership_location_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM tenant_memberships AS membership
    INNER JOIN store_locations AS location
      ON location.id = NEW.location_id
     AND location.tenant_id = membership.tenant_id
    WHERE membership.id = NEW.tenant_membership_id
  ) THEN
    RAISE EXCEPTION 'Tenant membership and location must belong to the same tenant.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_membership_locations_scope_trigger
  ON tenant_membership_locations;
CREATE TRIGGER tenant_membership_locations_scope_trigger
BEFORE INSERT OR UPDATE ON tenant_membership_locations
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_membership_location_scope();

ALTER TABLE queue_join_payments
  ADD COLUMN IF NOT EXISTS queue_day_id BIGINT REFERENCES queue_days(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue_day_version_at_checkout INTEGER,
  ADD COLUMN IF NOT EXISTS ticket_issuance_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ticket_issuance_reason TEXT,
  ADD COLUMN IF NOT EXISTS ticket_issuance_attempted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'queue_join_payments'::regclass
      AND conname = 'queue_join_payments_ticket_issuance_status_check'
  ) THEN
    ALTER TABLE queue_join_payments
      ADD CONSTRAINT queue_join_payments_ticket_issuance_status_check
      CHECK (ticket_issuance_status IN ('pending', 'issued', 'blocked', 'refund_pending'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS queue_lifecycle_backfill_runs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  last_scope_key TEXT,
  processed_scope_count INTEGER NOT NULL DEFAULT 0,
  anomaly_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS queue_lifecycle_migration_anomalies (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT REFERENCES queue_lifecycle_backfill_runs(id) ON DELETE SET NULL,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  scope_key TEXT NOT NULL,
  anomaly_code TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_key, anomaly_code)
);

COMMIT;
