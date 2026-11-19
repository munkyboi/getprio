BEGIN;
CREATE TABLE queue_reservation_groups (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  plan_revision BIGINT NOT NULL CHECK(plan_revision>0),
  attempt BIGINT NOT NULL CHECK(attempt>0),
  stage_attempt_id UUID NOT NULL,
  state TEXT NOT NULL CHECK(state IN('protected','converted','cancelled','expired')),
  expected_members JSONB NOT NULL CHECK(jsonb_typeof(expected_members)='array'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,tenant_id,location_id),
  UNIQUE(id,ticket_id,tenant_id,location_id),
  UNIQUE(id,ticket_id,stage_attempt_id,tenant_id,location_id),
  FOREIGN KEY(ticket_id,plan_revision,tenant_id,location_id) REFERENCES queue_plan_versions(ticket_id,revision,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(ticket_id,tenant_id,location_id) REFERENCES tickets(id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(stage_attempt_id,ticket_id,tenant_id,location_id) REFERENCES queue_stage_attempts(id,ticket_id,tenant_id,location_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX queue_reservation_group_live_idx ON queue_reservation_groups(ticket_id,stage_attempt_id) WHERE state IN('protected','converted');
CREATE TABLE queue_allocation_groups (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  reservation_group_id UUID NOT NULL UNIQUE,
  stage_attempt_id UUID NOT NULL,
  expected_members JSONB NOT NULL CHECK(jsonb_typeof(expected_members)='array'),
  started_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  outcome TEXT CHECK(outcome IN('completed','terminated')),
  UNIQUE(id,tenant_id,location_id),
  UNIQUE(id,ticket_id,tenant_id,location_id),
  FOREIGN KEY(reservation_group_id,ticket_id,stage_attempt_id,tenant_id,location_id) REFERENCES queue_reservation_groups(id,ticket_id,stage_attempt_id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(stage_attempt_id,ticket_id,tenant_id,location_id) REFERENCES queue_stage_attempts(id,ticket_id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(ticket_id,tenant_id,location_id) REFERENCES tickets(id,tenant_id,location_id) ON DELETE RESTRICT
);
ALTER TABLE resource_ledger_reservations ADD COLUMN group_id UUID,ADD COLUMN line_id TEXT;
ALTER TABLE resource_ledger_reservations ADD FOREIGN KEY(group_id,ticket_id,tenant_id,location_id) REFERENCES queue_reservation_groups(id,ticket_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_ledger_reservations ADD CHECK((group_id IS NULL AND line_id IS NULL) OR(group_id IS NOT NULL AND line_id IS NOT NULL AND line_id ~ '^[A-Za-z0-9_-]{1,80}$'));
ALTER TABLE resource_ledger_reservations ADD UNIQUE(id,ticket_id,line_id,tenant_id,location_id);
DROP INDEX resource_reservation_live_ticket_idx;
CREATE UNIQUE INDEX resource_reservation_live_ticket_idx ON resource_ledger_reservations(tenant_id,location_id,ticket_id)
  WHERE ticket_id IS NOT NULL AND group_id IS NULL AND state IN('protected','converted');
CREATE UNIQUE INDEX resource_reservation_group_line_idx ON resource_ledger_reservations(group_id,line_id) WHERE group_id IS NOT NULL;
ALTER TABLE resource_allocations ADD COLUMN group_id UUID,ADD COLUMN line_id TEXT;
ALTER TABLE resource_allocations ADD FOREIGN KEY(group_id,ticket_id,tenant_id,location_id) REFERENCES queue_allocation_groups(id,ticket_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_allocations ADD CHECK((group_id IS NULL AND line_id IS NULL) OR(group_id IS NOT NULL AND line_id IS NOT NULL AND line_id ~ '^[A-Za-z0-9_-]{1,80}$'));
ALTER TABLE resource_allocations ADD FOREIGN KEY(reservation_id,ticket_id,line_id,tenant_id,location_id) REFERENCES resource_ledger_reservations(id,ticket_id,line_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_allocations DROP CONSTRAINT resource_allocations_ticket_id_key;
CREATE UNIQUE INDEX resource_allocation_legacy_ticket_idx ON resource_allocations(ticket_id) WHERE group_id IS NULL;
CREATE UNIQUE INDEX resource_allocation_group_line_idx ON resource_allocations(group_id,line_id) WHERE group_id IS NOT NULL;
COMMIT;
