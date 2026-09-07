ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_comparison_hash TEXT,
  ADD COLUMN IF NOT EXISTS entitlement_converted_at TIMESTAMPTZ;

ALTER TABLE entitlement_rollout_anomalies
  ADD COLUMN IF NOT EXISTS blocking BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE allowance_warning_claims
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_delivery_error TEXT;

ALTER TABLE allowance_warning_claims
  DROP CONSTRAINT IF EXISTS allowance_warning_claims_threshold_percent_check,
  DROP CONSTRAINT IF EXISTS allowance_warning_claims_delivery_status_check;

ALTER TABLE allowance_warning_claims
  ADD CONSTRAINT allowance_warning_claims_threshold_percent_check
    CHECK (threshold_percent IN (80,90,100)),
  ADD CONSTRAINT allowance_warning_claims_delivery_status_check
    CHECK (delivery_status IN ('pending','processing','delivered','failed'));
