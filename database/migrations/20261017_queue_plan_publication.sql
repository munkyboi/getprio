BEGIN;
ALTER TABLE ticket_service_plans
  ADD COLUMN contract_version INTEGER NOT NULL DEFAULT 1 CHECK(contract_version IN(1,2)),
  ADD COLUMN revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
  ADD COLUMN ticket_revision BIGINT NOT NULL DEFAULT 1 CHECK(ticket_revision>0),
  ADD COLUMN stage_id UUID,
  ADD COLUMN stage_attempt_id UUID,
  ADD COLUMN stage_revision BIGINT NOT NULL DEFAULT 1 CHECK(stage_revision>0),
  ADD COLUMN workflow_mode TEXT NOT NULL DEFAULT 'linear' CHECK(workflow_mode IN('linear','multi_station')),
  ADD COLUMN resource_wait JSONB;

CREATE TABLE queue_stage_attempts (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  stage_id UUID NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
  attempt BIGINT NOT NULL CHECK(attempt>0),
  ordinal INTEGER NOT NULL CHECK(ordinal>0),
  state TEXT NOT NULL CHECK(state IN('waiting','called','in_service','paused','completed','interrupted')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  UNIQUE(id,tenant_id,location_id),
  UNIQUE(id,ticket_id,tenant_id,location_id),
  UNIQUE(id,ticket_id,stage_id,tenant_id,location_id),
  UNIQUE(ticket_id,stage_id,attempt),
  FOREIGN KEY(ticket_id,tenant_id,location_id) REFERENCES tickets(id,tenant_id,location_id) ON DELETE RESTRICT
);
ALTER TABLE ticket_service_plans ADD CONSTRAINT ticket_plan_stage_attempt_scope_fkey
  FOREIGN KEY(stage_attempt_id,ticket_id,stage_id,tenant_id,location_id) REFERENCES queue_stage_attempts(id,ticket_id,stage_id,tenant_id,location_id) ON DELETE RESTRICT;

CREATE TABLE queue_plan_versions (
  id UUID PRIMARY KEY,
  draft_id UUID NOT NULL,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  revision BIGINT NOT NULL CHECK(revision>0),
  workflow_mode TEXT NOT NULL CHECK(workflow_mode IN('linear','multi_station')),
  stage_id UUID NOT NULL,
  lines_snapshot JSONB NOT NULL CHECK(jsonb_typeof(lines_snapshot)='array'),
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  customer_agreement JSONB,
  published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(ticket_id,revision),
  UNIQUE(ticket_id,revision,tenant_id,location_id),
  FOREIGN KEY(draft_id,tenant_id,location_id) REFERENCES queue_plan_drafts(id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(ticket_id,tenant_id,location_id) REFERENCES tickets(id,tenant_id,location_id) ON DELETE RESTRICT
);

CREATE TABLE queue_plan_notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  plan_revision BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK(kind='service_plan_published'),
  state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN('queued','sent','delivery_unknown','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(ticket_id,plan_revision,kind),
  FOREIGN KEY(ticket_id,tenant_id,location_id) REFERENCES tickets(id,tenant_id,location_id) ON DELETE RESTRICT
);
COMMIT;
