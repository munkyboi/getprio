DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN (
        'subscription_plans'::regclass,
        'queue_fee_settings'::regclass,
        'tenant_subscriptions'::regclass,
        'queue_join_payments'::regclass,
        'booking_sms_alert_payments'::regclass
      )
      AND (
        pg_get_constraintdef(oid) ILIKE '%plan_slug%'
        OR conname IN (
          'subscription_plans_slug_check',
          'queue_fee_settings_plan_slug_check',
          'tenant_subscriptions_plan_slug_check',
          'queue_join_payments_plan_slug_check',
          'booking_sms_alert_payments_plan_slug_check'
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.table_name, constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_slug_check
  CHECK (slug IN ('free', 'economical', 'pro', 'enterprise'));
ALTER TABLE queue_fee_settings
  ADD CONSTRAINT queue_fee_settings_plan_slug_check
  CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise'));
ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_plan_slug_check
  CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise'));
ALTER TABLE queue_join_payments
  ADD CONSTRAINT queue_join_payments_plan_slug_check
  CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise'));
ALTER TABLE booking_sms_alert_payments
  ADD CONSTRAINT booking_sms_alert_payments_plan_slug_check
  CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise'));

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS sort_order INTEGER,
  ADD COLUMN IF NOT EXISTS policy_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS system_managed BOOLEAN NOT NULL DEFAULT FALSE;

-- Capture the legacy policy before this migration changes paid-plan defaults.
CREATE TABLE IF NOT EXISTS plan_policy_baselines (
  id BIGSERIAL PRIMARY KEY,
  plan_slug TEXT NOT NULL REFERENCES subscription_plans(slug) ON DELETE RESTRICT,
  policy_revision INTEGER NOT NULL,
  features JSONB NOT NULL,
  allowances JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_slug, policy_revision)
);

INSERT INTO plan_policy_baselines (plan_slug, policy_revision, features, allowances)
SELECT
  slug,
  policy_revision,
  jsonb_strip_nulls(jsonb_build_object(
    'queue', entitlements->'queueSystemAccess',
    'branding', entitlements->'publicFacingBranding',
    'discovery', entitlements->'marketplaceDiscovery',
    'booking', entitlements->'serviceBookingAccess',
    'campaigns', entitlements->'groupFundedCampaignAccess'
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'queueTickets', entitlements->'monthlyTickets',
    'queueEmailJourneys', entitlements->'monthlyQueueEmailJourneys',
    'serviceBookings', entitlements->'monthlyServiceBookings'
  ))
FROM subscription_plans
WHERE slug IN ('economical', 'pro', 'enterprise')
ON CONFLICT (plan_slug, policy_revision) DO NOTHING;

UPDATE subscription_plans
SET sort_order = CASE slug WHEN 'economical' THEN 20 WHEN 'pro' THEN 30 WHEN 'enterprise' THEN 40 END
WHERE sort_order IS NULL;

INSERT INTO subscription_plans (
  slug, name, best_for, checkout_enabled, monthly_amount_cents, annual_amount_cents,
  currency, entitlements, included, sort_order, policy_revision, system_managed
) VALUES (
  'free', 'Free', 'New and queue-only vendors', FALSE, 0, 0, 'PHP',
  '{"locations":1,"counters":1,"staffSeats":1,"monthlyTickets":500,"monthlyTransactionalEmails":500,"monthlyQueueEmailJourneys":500,"monthlyServiceBookings":0,"historyDays":7,"historyLabel":"7-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"none","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":false,"analytics":false,"csvExport":false,"pdfExport":false,"allowedHistoryExportRanges":[],"advancedRoles":false,"slaSupport":false,"supportLevel":"self_serve","customDomain":false,"sso":false,"queueSystemAccess":true,"publicFacingBranding":false,"marketplaceDiscovery":false,"serviceBookingAccess":false,"groupFundedCampaignAccess":false}',
  '["1 location","1 counter","1 vendor seat","QR join page","GetPrio-branded public queue page","Basic queue dashboard","500 Queue Tickets/mo","500 Queue Email Journeys/mo","7-day queue history"]',
  10, 1, TRUE
)
ON CONFLICT (slug) DO NOTHING;

UPDATE subscription_plans
SET entitlements = entitlements || CASE slug
  WHEN 'economical' THEN '{"monthlyTickets":1000,"monthlyTransactionalEmails":1000,"monthlyQueueEmailJourneys":1000,"monthlyServiceBookings":100,"queueSystemAccess":true,"publicFacingBranding":false,"marketplaceDiscovery":true,"serviceBookingAccess":true,"groupFundedCampaignAccess":true}'::jsonb
  WHEN 'pro' THEN '{"monthlyTickets":5000,"monthlyTransactionalEmails":5000,"monthlyQueueEmailJourneys":5000,"monthlyServiceBookings":1000,"queueSystemAccess":true,"publicFacingBranding":true,"marketplaceDiscovery":true,"serviceBookingAccess":true,"groupFundedCampaignAccess":true}'::jsonb
  WHEN 'enterprise' THEN '{"monthlyTickets":50000,"monthlyTransactionalEmails":50000,"monthlyQueueEmailJourneys":50000,"monthlyServiceBookings":10000,"queueSystemAccess":true,"publicFacingBranding":true,"marketplaceDiscovery":true,"serviceBookingAccess":true,"groupFundedCampaignAccess":true}'::jsonb
  ELSE '{}'::jsonb
END
WHERE slug IN ('economical', 'pro', 'enterprise');

INSERT INTO queue_fee_settings (plan_slug, enabled, amount_cents, currency)
VALUES ('free', FALSE, 0, 'PHP')
ON CONFLICT (plan_slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS plan_feature_entitlements (
  plan_slug TEXT NOT NULL REFERENCES subscription_plans(slug) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key IN ('queue', 'branding', 'discovery', 'booking', 'campaigns')),
  enabled BOOLEAN NOT NULL,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_slug, feature_key)
);

CREATE TABLE IF NOT EXISTS plan_allowances (
  plan_slug TEXT NOT NULL REFERENCES subscription_plans(slug) ON DELETE CASCADE,
  allowance_key TEXT NOT NULL CHECK (allowance_key IN ('queueTickets', 'queueEmailJourneys', 'serviceBookings')),
  monthly_limit INTEGER NOT NULL CHECK (monthly_limit >= 0),
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_slug, allowance_key)
);

INSERT INTO plan_feature_entitlements (plan_slug, feature_key, enabled)
SELECT plan_slug, feature_key, enabled
FROM (VALUES
  ('free','queue',TRUE),('free','branding',FALSE),('free','discovery',FALSE),('free','booking',FALSE),('free','campaigns',FALSE),
  ('economical','queue',TRUE),('economical','branding',FALSE),('economical','discovery',TRUE),('economical','booking',TRUE),('economical','campaigns',TRUE),
  ('pro','queue',TRUE),('pro','branding',TRUE),('pro','discovery',TRUE),('pro','booking',TRUE),('pro','campaigns',TRUE),
  ('enterprise','queue',TRUE),('enterprise','branding',TRUE),('enterprise','discovery',TRUE),('enterprise','booking',TRUE),('enterprise','campaigns',TRUE)
) AS defaults(plan_slug, feature_key, enabled)
ON CONFLICT (plan_slug, feature_key) DO NOTHING;

INSERT INTO plan_allowances (plan_slug, allowance_key, monthly_limit)
SELECT plan_slug, allowance_key, monthly_limit
FROM (VALUES
  ('free','queueTickets',500),('free','queueEmailJourneys',500),('free','serviceBookings',0),
  ('economical','queueTickets',1000),('economical','queueEmailJourneys',1000),('economical','serviceBookings',100),
  ('pro','queueTickets',5000),('pro','queueEmailJourneys',5000),('pro','serviceBookings',1000),
  ('enterprise','queueTickets',50000),('enterprise','queueEmailJourneys',50000),('enterprise','serviceBookings',10000)
) AS defaults(plan_slug, allowance_key, monthly_limit)
ON CONFLICT (plan_slug, allowance_key) DO NOTHING;

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_model_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS entitlement_comparison_hash TEXT,
  ADD COLUMN IF NOT EXISTS entitlement_converted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS plan_policy_baselines (
  id BIGSERIAL PRIMARY KEY,
  plan_slug TEXT NOT NULL REFERENCES subscription_plans(slug) ON DELETE RESTRICT,
  policy_revision INTEGER NOT NULL,
  features JSONB NOT NULL,
  allowances JSONB NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_slug, policy_revision)
);

INSERT INTO plan_policy_baselines (plan_slug, policy_revision, features, allowances)
SELECT
  plan.slug,
  plan.policy_revision,
  COALESCE((SELECT jsonb_object_agg(feature_key, enabled) FROM plan_feature_entitlements WHERE plan_slug = plan.slug), '{}'::jsonb),
  COALESCE((SELECT jsonb_object_agg(allowance_key, monthly_limit) FROM plan_allowances WHERE plan_slug = plan.slug), '{}'::jsonb)
FROM subscription_plans AS plan
ON CONFLICT (plan_slug, policy_revision) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_entitlement_overrides (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  policy_key TEXT NOT NULL,
  value JSONB NOT NULL,
  reason TEXT NOT NULL,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_entitlement_overrides_current_idx
  ON tenant_entitlement_overrides (subscription_id, policy_key)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS subscription_transitions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_subscription_id BIGINT REFERENCES tenant_subscriptions(id) ON DELETE SET NULL,
  from_plan_slug TEXT REFERENCES subscription_plans(slug) ON DELETE RESTRICT,
  to_plan_slug TEXT NOT NULL REFERENCES subscription_plans(slug) ON DELETE RESTRICT,
  transition_type TEXT NOT NULL CHECK (transition_type IN ('upgrade','downgrade','paid_exit','admin_resolution','free_assignment')),
  status TEXT NOT NULL CHECK (status IN ('scheduled','pending_payment','effective','canceled','failed')),
  reason TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entitlement_rollout_runs (
  id BIGSERIAL PRIMARY KEY,
  run_type TEXT NOT NULL,
  cohort TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed','rolled_back')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS entitlement_rollout_anomalies (
  id BIGSERIAL PRIMARY KEY,
  rollout_run_id BIGINT NOT NULL REFERENCES entitlement_rollout_runs(id) ON DELETE CASCADE,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
  anomaly_code TEXT NOT NULL,
  blocking BOOLEAN NOT NULL DEFAULT TRUE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
