ALTER TABLE tenant_subscriptions
  DROP CONSTRAINT IF EXISTS tenant_subscriptions_status_check;

ALTER TABLE tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_status_check
  CHECK (status IN ('active', 'unpaid', 'past_due', 'suspended', 'canceled', 'expired'));
