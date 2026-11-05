BEGIN;

-- Drafts deliberately have no tickets row and cannot consume queue allowance.
CREATE TABLE queue_plan_drafts (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','discarded')),
  customer JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(customer)='object'),
  lines JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lines)='array' AND jsonb_array_length(lines)<=20),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes)<=2000),
  published_ticket_id BIGINT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id,tenant_id,location_id),
  FOREIGN KEY (location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (published_ticket_id,tenant_id,location_id) REFERENCES tickets(id,tenant_id,location_id) ON DELETE RESTRICT,
  CHECK ((state='published')=(published_ticket_id IS NOT NULL))
);
CREATE INDEX queue_plan_drafts_branch_idx ON queue_plan_drafts(tenant_id,location_id,created_at,id) WHERE state='draft';

CREATE TABLE queue_plan_command_receipts (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation_key TEXT NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 120),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash)=64),
  result JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,location_id,actor_user_id,operation_key),
  FOREIGN KEY (location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT
);

CREATE TABLE queue_plan_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  draft_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  old_revision BIGINT,
  new_revision BIGINT NOT NULL,
  snapshot JSONB NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (draft_id,tenant_id,location_id) REFERENCES queue_plan_drafts(id,tenant_id,location_id) ON DELETE RESTRICT
);

COMMIT;
