BEGIN;

CREATE TABLE IF NOT EXISTS queue_day_closures (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  queue_date_key TEXT NOT NULL,
  next_queue_date_key TEXT NOT NULL,
  reason TEXT,
  closure_reason TEXT,
  affected_ticket_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  waiting_carried_count INTEGER NOT NULL DEFAULT 0,
  called_unserved_count INTEGER NOT NULL DEFAULT 0,
  closed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reopened_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, location_id, queue_date_key)
);

ALTER TABLE queue_day_closures
  ADD COLUMN IF NOT EXISTS closure_reason TEXT;

ALTER TABLE queue_day_closures
  ADD COLUMN IF NOT EXISTS affected_ticket_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[];

UPDATE queue_day_closures
SET closure_reason = COALESCE(closure_reason, reason)
WHERE closure_reason IS NULL;

CREATE INDEX IF NOT EXISTS queue_day_closures_scope_created_idx
  ON queue_day_closures (tenant_id, location_id, queue_date_key, created_at DESC);

COMMIT;
