BEGIN;

-- Internal foundation only. No live caller may enable tracking until all
-- booking/session writers participate and activation reconciliation passes.
ALTER TABLE booking_bundle_items ADD CONSTRAINT booking_items_resource_scope_key
  UNIQUE (id, booking_id, tenant_id, location_id);

CREATE TABLE resource_ledger_scopes (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  writer_coverage_complete BOOLEAN NOT NULL DEFAULT FALSE
    CONSTRAINT resource_ledger_coverage_disabled_check CHECK (writer_coverage_complete = FALSE),
  PRIMARY KEY (tenant_id, location_id),
  CONSTRAINT resource_ledger_location_scope_fkey FOREIGN KEY (location_id, tenant_id)
    REFERENCES store_locations (id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE resource_ledger_reservations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  booking_id BIGINT NOT NULL,
  booking_item_id BIGINT NOT NULL,
  pool_id BIGINT NOT NULL,
  pool_revision INTEGER NOT NULL CHECK (pool_revision > 0),
  requirement_revision INTEGER NOT NULL CHECK (requirement_revision > 0),
  units INTEGER NOT NULL CHECK (units BETWEEN 1 AND 100),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  state TEXT NOT NULL DEFAULT 'protected' CHECK (state IN ('protected', 'converted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, tenant_id, location_id),
  CONSTRAINT resource_reservation_item_scope_fkey
    FOREIGN KEY (booking_item_id, booking_id, tenant_id, location_id)
    REFERENCES booking_bundle_items (id, booking_id, tenant_id, location_id) ON DELETE RESTRICT,
  CONSTRAINT resource_reservation_pool_scope_fkey FOREIGN KEY (pool_id, tenant_id, location_id)
    REFERENCES location_resource_pools (id, tenant_id, location_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX resource_reservation_live_item_idx
  ON resource_ledger_reservations (tenant_id, location_id, booking_item_id)
  WHERE state IN ('protected', 'converted');
CREATE INDEX resource_reservation_interval_idx
  ON resource_ledger_reservations (tenant_id, location_id, pool_id, starts_at, ends_at)
  WHERE state = 'protected';

CREATE TABLE resource_allocations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  pool_id BIGINT NOT NULL,
  pool_revision INTEGER NOT NULL CHECK (pool_revision > 0),
  units INTEGER NOT NULL CHECK (units BETWEEN 1 AND 100),
  reservation_id BIGINT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_end_at TIMESTAMPTZ NOT NULL CHECK (expected_end_at > started_at),
  released_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('completed', 'terminated')),
  reason TEXT,
  UNIQUE (id, tenant_id, location_id),
  UNIQUE (ticket_id),
  UNIQUE (reservation_id),
  CHECK ((released_at IS NULL AND outcome IS NULL AND reason IS NULL)
    OR (released_at IS NOT NULL AND released_at >= started_at AND outcome IS NOT NULL
      AND (outcome = 'completed' OR COALESCE(length(btrim(reason)), 0) BETWEEN 1 AND 500))),
  CONSTRAINT resource_allocation_ticket_scope_fkey FOREIGN KEY (ticket_id, tenant_id, location_id)
    REFERENCES tickets (id, tenant_id, location_id) ON DELETE RESTRICT,
  CONSTRAINT resource_allocation_pool_scope_fkey FOREIGN KEY (pool_id, tenant_id, location_id)
    REFERENCES location_resource_pools (id, tenant_id, location_id) ON DELETE RESTRICT,
  CONSTRAINT resource_allocation_reservation_scope_fkey FOREIGN KEY (reservation_id, tenant_id, location_id)
    REFERENCES resource_ledger_reservations (id, tenant_id, location_id) ON DELETE RESTRICT
);
CREATE INDEX resource_allocation_active_pool_idx
  ON resource_allocations (tenant_id, location_id, pool_id) WHERE released_at IS NULL;

CREATE TABLE resource_ledger_commands (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  operation_key TEXT NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 120),
  command TEXT NOT NULL CHECK (command IN ('reserve', 'cancelReservation', 'allocate', 'release')),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  result JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, location_id, operation_key),
  CONSTRAINT resource_command_scope_fkey FOREIGN KEY (tenant_id, location_id)
    REFERENCES resource_ledger_scopes (tenant_id, location_id) ON DELETE RESTRICT
);
COMMIT;
