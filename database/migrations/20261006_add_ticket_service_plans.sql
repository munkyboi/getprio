BEGIN;

ALTER TABLE tickets ADD CONSTRAINT tickets_service_plan_scope_key UNIQUE (id, tenant_id, location_id);
CREATE TABLE ticket_service_plans (
  ticket_id BIGINT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('booking', 'staff_selection')),
  booking_id BIGINT,
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('parallel', 'sequential')),
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 100),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_service_plan_ticket_scope_fkey FOREIGN KEY (ticket_id, tenant_id, location_id)
    REFERENCES tickets(id, tenant_id, location_id) ON DELETE CASCADE,
  CONSTRAINT ticket_service_plan_booking_scope_fkey FOREIGN KEY (booking_id, tenant_id, location_id)
    REFERENCES bookings(id, tenant_id, location_id) ON DELETE CASCADE,
  CHECK ((source = 'booking' AND booking_id IS NOT NULL) OR (source = 'staff_selection' AND booking_id IS NULL))
);
CREATE INDEX ticket_service_plans_branch_idx ON ticket_service_plans(tenant_id, location_id, created_at);
-- Immutable issuance snapshots only. No allocation, historical backfill, or estimate change.
COMMIT;
