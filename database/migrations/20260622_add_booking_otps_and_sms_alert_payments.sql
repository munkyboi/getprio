BEGIN;

CREATE TABLE IF NOT EXISTS booking_otps (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('email', 'sms')),
  delivery_target TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  verification_token_hash TEXT UNIQUE,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_otps_tenant_expires
  ON booking_otps (tenant_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_otps_verified_token
  ON booking_otps (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_sms_alert_payments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_otp_id BIGINT NOT NULL REFERENCES booking_otps(id) ON DELETE CASCADE,
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
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, booking_otp_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_sms_alert_payments_tenant_status
  ON booking_sms_alert_payments (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_sms_alert_payments_status_created
  ON booking_sms_alert_payments (status, created_at DESC);

DROP TRIGGER IF EXISTS set_booking_otps_updated_at ON booking_otps;
CREATE TRIGGER set_booking_otps_updated_at
BEFORE UPDATE ON booking_otps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_booking_sms_alert_payments_updated_at ON booking_sms_alert_payments;
CREATE TRIGGER set_booking_sms_alert_payments_updated_at
BEFORE UPDATE ON booking_sms_alert_payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
