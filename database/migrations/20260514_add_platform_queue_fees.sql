CREATE TABLE IF NOT EXISTS queue_fee_settings (
  plan_slug TEXT PRIMARY KEY CHECK (plan_slug IN ('economical', 'pro', 'enterprise')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO queue_fee_settings (plan_slug, enabled, amount_cents, currency)
VALUES
  ('economical', TRUE, 5000, 'PHP'),
  ('pro', TRUE, 2500, 'PHP'),
  ('enterprise', FALSE, 0, 'PHP')
ON CONFLICT (plan_slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS queue_join_payments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  otp_id BIGINT NOT NULL REFERENCES queue_join_otps(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL CHECK (plan_slug IN ('economical', 'pro', 'enterprise')),
  provider TEXT NOT NULL DEFAULT 'paymongo',
  provider_checkout_session_id TEXT UNIQUE,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'paid', 'failed', 'expired', 'canceled')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  checkout_url TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  ticket_lookup_code TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, otp_id)
);

CREATE INDEX IF NOT EXISTS idx_queue_join_payments_tenant_status
  ON queue_join_payments (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_queue_join_payments_status_created
  ON queue_join_payments (status, created_at DESC);

DROP TRIGGER IF EXISTS set_queue_fee_settings_updated_at ON queue_fee_settings;
CREATE TRIGGER set_queue_fee_settings_updated_at
BEFORE UPDATE ON queue_fee_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_queue_join_payments_updated_at ON queue_join_payments;
CREATE TRIGGER set_queue_join_payments_updated_at
BEFORE UPDATE ON queue_join_payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
