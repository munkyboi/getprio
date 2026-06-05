BEGIN;

ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS unserved_at TIMESTAMPTZ;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('waiting', 'called', 'served', 'skipped', 'cancelled', 'unserved'));

CREATE TABLE IF NOT EXISTS queue_events (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  queue_date_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS queue_events_ticket_created_idx
  ON queue_events (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS queue_events_scope_created_idx
  ON queue_events (tenant_id, location_id, queue_date_key, created_at);

CREATE INDEX IF NOT EXISTS queue_events_type_created_idx
  ON queue_events (event_type, created_at);

COMMIT;
