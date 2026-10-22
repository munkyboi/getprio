BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_active_endpoint_idx
  ON push_subscriptions (endpoint)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
  ON push_subscriptions (user_id, is_active);

CREATE INDEX IF NOT EXISTS push_subscriptions_tenant_idx
  ON push_subscriptions (tenant_id, is_active);

ALTER TABLE tenants
  ALTER COLUMN notification_settings SET DEFAULT '{"queueJoin":true,"bookingIntake":true,"paymentProofReview":true,"bookingStatusChanges":true}'::JSONB;

UPDATE tenants
SET notification_settings = COALESCE(notification_settings, '{}'::JSONB) || '{"queueJoin":true}'::JSONB
WHERE NOT (notification_settings ? 'queueJoin');

COMMIT;
