BEGIN;

CREATE TABLE IF NOT EXISTS queue_day_closures (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  queue_date_key TEXT NOT NULL,
  next_queue_date_key TEXT NOT NULL,
  closed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  waiting_carried_count INTEGER NOT NULL DEFAULT 0,
  called_unserved_count INTEGER NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, location_id, queue_date_key)
);

CREATE INDEX IF NOT EXISTS idx_queue_day_closures_location_date
  ON queue_day_closures (tenant_id, location_id, queue_date_key);

CREATE OR REPLACE TRIGGER set_queue_day_closures_updated_at
BEFORE UPDATE ON queue_day_closures
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
