CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL CHECK (plan_slug IN ('economical', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    status IN ('active', 'unpaid', 'past_due', 'canceled', 'expired')
  ),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_checkout_session_id TEXT,
  billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (
    billing_interval IN ('monthly', 'annual', 'custom')
  ),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  entitlements JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_checkout_sessions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL CHECK (plan_slug IN ('economical', 'pro', 'enterprise')),
  provider TEXT NOT NULL DEFAULT 'paymongo',
  provider_checkout_session_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'paid', 'failed', 'expired', 'canceled')
  ),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  checkout_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_checkout_session_id TEXT,
  provider_payment_id TEXT,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_status
  ON tenant_subscriptions (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_tenant_id
  ON billing_checkout_sessions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider_checkout_session_id
  ON billing_events (provider_checkout_session_id);

DROP TRIGGER IF EXISTS set_tenant_subscriptions_updated_at ON tenant_subscriptions;
CREATE TRIGGER set_tenant_subscriptions_updated_at
BEFORE UPDATE ON tenant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_billing_checkout_sessions_updated_at ON billing_checkout_sessions;
CREATE TRIGGER set_billing_checkout_sessions_updated_at
BEFORE UPDATE ON billing_checkout_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
