CREATE TABLE IF NOT EXISTS customer_registration_otps (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_registration_otps_user_created_idx
  ON customer_registration_otps (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_registration_otps_active_idx
  ON customer_registration_otps (user_id, used_at, code_expires_at);

DROP TRIGGER IF EXISTS set_customer_registration_otps_updated_at ON customer_registration_otps;

CREATE TRIGGER set_customer_registration_otps_updated_at
BEFORE UPDATE ON customer_registration_otps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
