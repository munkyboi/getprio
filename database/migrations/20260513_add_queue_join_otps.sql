CREATE TABLE IF NOT EXISTS queue_join_otps (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('email', 'sms')),
  delivery_target TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_join_otps_tenant_expires
  ON queue_join_otps (tenant_id, expires_at DESC);

DROP TRIGGER IF EXISTS set_queue_join_otps_updated_at ON queue_join_otps;

CREATE TRIGGER set_queue_join_otps_updated_at
BEFORE UPDATE ON queue_join_otps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
