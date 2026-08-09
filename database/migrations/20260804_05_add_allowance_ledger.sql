CREATE TABLE IF NOT EXISTS usage_accounts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL CHECK (resource_key IN ('queueTickets','queueEmailJourneys','serviceBookings')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, resource_key)
);

CREATE TABLE IF NOT EXISTS subscription_allowance_periods (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start),
  UNIQUE (subscription_id, period_start)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_allowance_current_period_idx
  ON subscription_allowance_periods (subscription_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS allowance_operations (
  id BIGSERIAL PRIMARY KEY,
  usage_account_id BIGINT NOT NULL REFERENCES usage_accounts(id) ON DELETE RESTRICT,
  allowance_period_id BIGINT REFERENCES subscription_allowance_periods(id) ON DELETE RESTRICT,
  operation_key TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('baseline','consume','reserve','release','reversal','adjustment')),
  signed_units INTEGER NOT NULL CHECK (signed_units <> 0),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reverses_operation_id BIGINT REFERENCES allowance_operations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usage_account_id, operation_key)
);
CREATE INDEX IF NOT EXISTS allowance_operations_period_idx
  ON allowance_operations (allowance_period_id, usage_account_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS allowance_operations_one_reversal_idx
  ON allowance_operations (reverses_operation_id) WHERE reverses_operation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS allowance_allocations (
  id BIGSERIAL PRIMARY KEY,
  operation_id BIGINT NOT NULL REFERENCES allowance_operations(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('base','credit')),
  allowance_period_id BIGINT REFERENCES subscription_allowance_periods(id) ON DELETE RESTRICT,
  credit_lot_id BIGINT,
  units INTEGER NOT NULL CHECK (units > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS allowance_reservations (
  id BIGSERIAL PRIMARY KEY,
  usage_account_id BIGINT NOT NULL REFERENCES usage_accounts(id) ON DELETE RESTRICT,
  allowance_period_id BIGINT REFERENCES subscription_allowance_periods(id) ON DELETE RESTRICT,
  reservation_key TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  units INTEGER NOT NULL CHECK (units > 0),
  status TEXT NOT NULL CHECK (status IN ('active','committed','released','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  committed_operation_id BIGINT REFERENCES allowance_operations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usage_account_id, reservation_key)
);
CREATE INDEX IF NOT EXISTS allowance_reservations_active_expiry_idx
  ON allowance_reservations (expires_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS allowance_reservation_allocations (
  id BIGSERIAL PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES allowance_reservations(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('base','credit')),
  allowance_period_id BIGINT REFERENCES subscription_allowance_periods(id) ON DELETE RESTRICT,
  credit_lot_id BIGINT,
  units INTEGER NOT NULL CHECK (units > 0)
);

CREATE TABLE IF NOT EXISTS allowance_warning_claims (
  id BIGSERIAL PRIMARY KEY,
  usage_account_id BIGINT NOT NULL REFERENCES usage_accounts(id) ON DELETE CASCADE,
  allowance_period_id BIGINT NOT NULL REFERENCES subscription_allowance_periods(id) ON DELETE CASCADE,
  threshold_percent INTEGER NOT NULL CHECK (threshold_percent IN (80,90,100)),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','processing','delivered','failed')),
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  last_delivery_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_delivery_error TEXT,
  UNIQUE (usage_account_id, allowance_period_id, threshold_percent)
);
ALTER TABLE allowance_warning_claims DROP CONSTRAINT IF EXISTS allowance_warning_claims_threshold_percent_check;
ALTER TABLE allowance_warning_claims ADD CONSTRAINT allowance_warning_claims_threshold_percent_check CHECK (threshold_percent IN (80,90,100));
ALTER TABLE allowance_warning_claims ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE allowance_warning_claims ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE allowance_warning_claims ADD COLUMN IF NOT EXISTS last_delivery_attempt_at TIMESTAMPTZ;
ALTER TABLE allowance_warning_claims ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE allowance_warning_claims ADD COLUMN IF NOT EXISTS last_delivery_error TEXT;
ALTER TABLE allowance_warning_claims DROP CONSTRAINT IF EXISTS allowance_warning_claims_delivery_status_check;
ALTER TABLE allowance_warning_claims ADD CONSTRAINT allowance_warning_claims_delivery_status_check
  CHECK (delivery_status IN ('pending','processing','delivered','failed'));

CREATE TABLE IF NOT EXISTS allowance_reconciliation_records (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  expected_units INTEGER NOT NULL,
  ledger_units INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('matched','anomaly','repaired')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  repaired_at TIMESTAMPTZ
);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS email_journey_mode TEXT NOT NULL DEFAULT 'not_eligible'
  CHECK (email_journey_mode IN ('not_eligible','metered','journey_exhausted'));

CREATE TABLE IF NOT EXISTS queue_email_journeys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('metered','journey_exhausted')),
  email_opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_id)
);

CREATE TABLE IF NOT EXISTS queue_email_slots (
  id BIGSERIAL PRIMARY KEY,
  journey_id BIGINT NOT NULL REFERENCES queue_email_journeys(id) ON DELETE CASCADE,
  slot_key TEXT NOT NULL CHECK (slot_key IN ('otp_1','otp_2','otp_3','otp_4','joined','near_turn','called','exception','continuation','final')),
  logical_message_key TEXT,
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused','queued','sent','failed','suppressed')),
  event_key TEXT,
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  UNIQUE (journey_id, slot_key),
  UNIQUE (journey_id, logical_message_key)
);
