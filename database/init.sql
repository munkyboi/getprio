BEGIN;

-- Clean-slate bootstrap for local/dev databases.
-- Docker only runs this file when the Postgres data directory is empty.
-- Running it manually against an existing database will remove app data.

DROP TABLE IF EXISTS billing_events CASCADE;
DROP TABLE IF EXISTS usage_credit_disputes CASCADE;
DROP TABLE IF EXISTS usage_credit_refunds CASCADE;
DROP TABLE IF EXISTS usage_credit_lots CASCADE;
DROP TABLE IF EXISTS usage_credit_purchases CASCADE;
DROP TABLE IF EXISTS usage_credit_pack_revisions CASCADE;
DROP TABLE IF EXISTS usage_credit_packs CASCADE;
DROP TABLE IF EXISTS allowance_reconciliation_records CASCADE;
DROP TABLE IF EXISTS allowance_warning_claims CASCADE;
DROP TABLE IF EXISTS queue_email_slots CASCADE;
DROP TABLE IF EXISTS queue_email_journeys CASCADE;
DROP TABLE IF EXISTS allowance_reservation_allocations CASCADE;
DROP TABLE IF EXISTS allowance_reservations CASCADE;
DROP TABLE IF EXISTS allowance_allocations CASCADE;
DROP TABLE IF EXISTS allowance_operations CASCADE;
DROP TABLE IF EXISTS subscription_allowance_periods CASCADE;
DROP TABLE IF EXISTS usage_accounts CASCADE;
DROP TABLE IF EXISTS privacy_disposal_jobs CASCADE;
DROP TABLE IF EXISTS security_rate_limit_buckets CASCADE;
DROP TABLE IF EXISTS security_audit_events CASCADE;
DROP TABLE IF EXISTS idempotency_records CASCADE;
DROP TABLE IF EXISTS billing_checkout_sessions CASCADE;
DROP TABLE IF EXISTS entitlement_rollout_anomalies CASCADE;
DROP TABLE IF EXISTS entitlement_rollout_runs CASCADE;
DROP TABLE IF EXISTS subscription_transitions CASCADE;
DROP TABLE IF EXISTS tenant_entitlement_overrides CASCADE;
DROP TABLE IF EXISTS plan_policy_baselines CASCADE;
DROP TABLE IF EXISTS privileged_transaction_confirmations CASCADE;
DROP TABLE IF EXISTS tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
DROP TABLE IF EXISTS queue_lifecycle_migration_anomalies CASCADE;
DROP TABLE IF EXISTS queue_lifecycle_backfill_runs CASCADE;
DROP TABLE IF EXISTS tenant_membership_locations CASCADE;
DROP TABLE IF EXISTS queue_notification_outbox CASCADE;
DROP TABLE IF EXISTS queue_ticket_segments CASCADE;
DROP TABLE IF EXISTS queue_day_extensions CASCADE;
DROP TABLE IF EXISTS queue_days CASCADE;
DROP TABLE IF EXISTS queue_day_pauses CASCADE;
DROP TABLE IF EXISTS queue_day_closures CASCADE;
DROP TABLE IF EXISTS queue_events CASCADE;
DROP TABLE IF EXISTS auth_security_events CASCADE;
DROP TABLE IF EXISTS auth_mfa_challenges CASCADE;
DROP TABLE IF EXISTS auth_mfa_recovery_codes CASCADE;
DROP TABLE IF EXISTS auth_mfa_factors CASCADE;
DROP TABLE IF EXISTS auth_login_attempts CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS auth_sessions CASCADE;
DROP TABLE IF EXISTS rating_disputes CASCADE;
DROP TABLE IF EXISTS vendor_review_revisions CASCADE;
DROP TABLE IF EXISTS user_trust_ratings CASCADE;
DROP TABLE IF EXISTS vendor_reviews CASCADE;
DROP TABLE IF EXISTS organizer_campaign_notices CASCADE;
DROP TABLE IF EXISTS organizer_campaign_reimbursements CASCADE;
DROP TABLE IF EXISTS organizer_campaign_contributions CASCADE;
DROP TABLE IF EXISTS organizer_campaign_events CASCADE;
DROP TABLE IF EXISTS organizer_campaign_reports CASCADE;
DROP TABLE IF EXISTS organizer_campaigns CASCADE;
DROP TABLE IF EXISTS booking_bundle_integrity_repairs CASCADE;
DROP TABLE IF EXISTS booking_bundle_items CASCADE;
DROP TABLE IF EXISTS group_funded_capacity_holds CASCADE;
DROP TABLE IF EXISTS group_funded_booking_items CASCADE;
DROP TABLE IF EXISTS group_funded_booking_events CASCADE;
DROP TABLE IF EXISTS group_funded_booking_refunds CASCADE;
DROP TABLE IF EXISTS group_funded_booking_contributions CASCADE;
DROP TABLE IF EXISTS group_funded_booking_participants CASCADE;
DROP TABLE IF EXISTS group_funded_bookings CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS booking_sms_alert_payments CASCADE;
DROP TABLE IF EXISTS booking_otps CASCADE;
DROP TABLE IF EXISTS vendor_availability_exceptions CASCADE;
DROP TABLE IF EXISTS vendor_availability_blocks CASCADE;
DROP TABLE IF EXISTS vendor_services CASCADE;
DROP TABLE IF EXISTS location_services CASCADE;
DROP TABLE IF EXISTS service_counter_assignments CASCADE;
DROP TABLE IF EXISTS service_counters CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS plan_allowances CASCADE;
DROP TABLE IF EXISTS plan_feature_entitlements CASCADE;
DROP TABLE IF EXISTS queue_join_payments CASCADE;
DROP TABLE IF EXISTS queue_fee_settings CASCADE;
DROP TABLE IF EXISTS platform_settings CASCADE;
DROP TABLE IF EXISTS public_board_themes CASCADE;
DROP TABLE IF EXISTS public_board_assets CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS notification_deliveries CASCADE;
DROP TABLE IF EXISTS queue_join_otps CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS counters CASCADE;
DROP TABLE IF EXISTS store_hours CASCADE;
DROP TABLE IF EXISTS store_locations CASCADE;
DROP TABLE IF EXISTS tenant_memberships CASCADE;
DROP TABLE IF EXISTS oauth_accounts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

CREATE TABLE tenants (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  queue_prefix VARCHAR(4) NOT NULL DEFAULT 'P',
  average_service_minutes INTEGER NOT NULL DEFAULT 5 CHECK (average_service_minutes BETWEEN 1 AND 120),
  notification_threshold INTEGER NOT NULL DEFAULT 2 CHECK (notification_threshold BETWEEN 1 AND 10),
  auto_pause_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_pause_threshold INTEGER CHECK (auto_pause_threshold IS NULL OR auto_pause_threshold BETWEEN 1 AND 500),
  auto_resume_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_resume_vacancy_percent INTEGER CHECK (auto_resume_vacancy_percent IS NULL OR auto_resume_vacancy_percent BETWEEN 5 AND 50),
  contact_email TEXT,
  contact_phone TEXT,
  notification_settings JSONB NOT NULL DEFAULT '{"queueJoin":true,"bookingIntake":true,"paymentProofReview":true,"bookingStatusChanges":true}'::JSONB,
  public_profile_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  public_profile_description TEXT,
  public_profile_category TEXT,
  public_profile_image_url TEXT,
  vendor_approval_status TEXT NOT NULL DEFAULT 'approved' CHECK (vendor_approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  phone TEXT,
  password_hash TEXT,
  password_hash_algorithm TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_provider TEXT NOT NULL DEFAULT 'password',
  roles TEXT[] NOT NULL DEFAULT ARRAY['customer']::TEXT[],
  account_locked_until TIMESTAMPTZ,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  last_failed_login_at TIMESTAMPTZ,
  last_password_changed_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
  notification_settings JSONB NOT NULL DEFAULT '{"bookingAlerts":true,"queueAlerts":true}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  previous_refresh_token_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('password', 'google', 'facebook')),
  mfa_verified_at TIMESTAMPTZ,
  primary_authenticated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  device_label TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  inactivity_expires_at TIMESTAMPTZ NOT NULL,
  last_rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_sessions_user_status_idx ON auth_sessions (user_id, status);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);
CREATE INDEX auth_sessions_previous_refresh_hash_idx
  ON auth_sessions (previous_refresh_token_hash)
  WHERE previous_refresh_token_hash IS NOT NULL;

CREATE TABLE auth_mfa_factors (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type TEXT NOT NULL CHECK (factor_type IN ('totp', 'webauthn')),
  label TEXT NOT NULL DEFAULT 'Authenticator',
  secret_ciphertext TEXT,
  secret_iv TEXT,
  secret_auth_tag TEXT,
  public_key JSONB,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX auth_mfa_factors_active_type_idx
  ON auth_mfa_factors (user_id, factor_type)
  WHERE status = 'active';
CREATE UNIQUE INDEX auth_mfa_factors_pending_type_idx
  ON auth_mfa_factors (user_id, factor_type)
  WHERE status = 'pending';

CREATE TABLE auth_mfa_recovery_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, code_hash)
);

CREATE TABLE auth_mfa_challenges (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('login', 'step_up', 'recovery')),
  primary_authenticated_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE privileged_transaction_confirmations (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id BIGINT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  preview_revision TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX privileged_confirmations_expiry_idx
  ON privileged_transaction_confirmations (expires_at)
  WHERE used_at IS NULL;

CREATE TABLE idempotency_records (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','completed','failed')),
  response_status INTEGER,
  response_body JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_user_id, scope, idempotency_key)
);
CREATE INDEX idempotency_records_expiry_idx ON idempotency_records (expires_at);

CREATE TABLE security_audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  session_id BIGINT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  reason TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','denied','conflict','pending','failed')),
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_digest TEXT,
  event_digest TEXT NOT NULL UNIQUE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX security_audit_events_tenant_time_idx ON security_audit_events (tenant_id, occurred_at DESC);

CREATE TABLE security_rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL CHECK (hit_count >= 0),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE privacy_disposal_jobs (
  id BIGSERIAL PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  retention_until TIMESTAMPTZ NOT NULL,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled','pending','completed','failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resource_type, resource_id)
);

CREATE TABLE push_subscriptions (
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

CREATE UNIQUE INDEX push_subscriptions_active_endpoint_idx
  ON push_subscriptions (endpoint)
  WHERE is_active = TRUE;
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id, is_active);
CREATE INDEX push_subscriptions_tenant_idx ON push_subscriptions (tenant_id, is_active);

CREATE TABLE auth_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email', 'username')),
  identifier_value TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_login_attempts_identifier_attempted_idx
  ON auth_login_attempts (identifier_value, attempted_at DESC);
CREATE INDEX auth_login_attempts_attempted_at_idx ON auth_login_attempts (attempted_at);

CREATE TABLE auth_security_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  session_id BIGINT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_security_events_user_created_idx
  ON auth_security_events (user_id, created_at DESC);
CREATE INDEX auth_security_events_session_idx ON auth_security_events (session_id);
CREATE INDEX auth_security_events_type_created_idx
  ON auth_security_events (event_type, created_at DESC);

CREATE TABLE password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX password_reset_tokens_user_created_idx
  ON password_reset_tokens (user_id, created_at DESC);
CREATE INDEX password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at);

CREATE TABLE tenant_memberships (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (user_id, tenant_id)
);

CREATE TABLE store_locations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'Philippines',
  image_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  payment_method_label TEXT,
  payment_bank_name TEXT,
  payment_account_display_name TEXT,
  payment_account_identifier_display TEXT,
  payment_qr_image_url TEXT,
  payment_qr_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE store_hours (
  id BIGSERIAL PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at TIME,
  closes_at TIME,
  is_closed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, weekday)
);

CREATE TABLE counters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  date_key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, location_id, key, date_key)
);

CREATE TABLE service_counters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, slug)
);

CREATE TABLE service_counter_assignments (
  counter_id BIGINT NOT NULL REFERENCES service_counters(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (counter_id, user_id)
);

CREATE TABLE vendor_services (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  image_url TEXT,
  allow_booking_quantity BOOLEAN NOT NULL DEFAULT FALSE,
  booking_quantity_label TEXT NOT NULL DEFAULT 'Units',
  manual_payment_required BOOLEAN NOT NULL DEFAULT FALSE,
  booking_capacity_scope TEXT NOT NULL DEFAULT 'service'
    CHECK (booking_capacity_scope IN ('service', 'location')),
  price_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  price_display TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE location_services (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE CASCADE,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  price_amount_cents INTEGER,
  price_display TEXT,
  group_funded_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  group_funded_min_required_contributors INTEGER CHECK (
    group_funded_min_required_contributors IS NULL
    OR group_funded_min_required_contributors BETWEEN 2 AND 100
  ),
  group_funded_max_required_contributors INTEGER CHECK (
    group_funded_max_required_contributors IS NULL
    OR group_funded_max_required_contributors BETWEEN 2 AND 100
  ),
  group_funded_default_required_contributors INTEGER CHECK (
    group_funded_default_required_contributors IS NULL
    OR group_funded_default_required_contributors BETWEEN 2 AND 100
  ),
  group_funded_min_contribution_amount_cents INTEGER CHECK (
    group_funded_min_contribution_amount_cents IS NULL
    OR group_funded_min_contribution_amount_cents >= 0
  ),
  group_funded_max_contribution_amount_cents INTEGER CHECK (
    group_funded_max_contribution_amount_cents IS NULL
    OR group_funded_max_contribution_amount_cents >= 0
  ),
  group_funded_min_deadline_hours INTEGER CHECK (
    group_funded_min_deadline_hours IS NULL
    OR group_funded_min_deadline_hours BETWEEN 1 AND 720
  ),
  group_funded_max_deadline_days INTEGER CHECK (
    group_funded_max_deadline_days IS NULL
    OR group_funded_max_deadline_days BETWEEN 1 AND 90
  ),
  group_funded_allow_public_campaigns BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, service_id),
  CONSTRAINT location_services_group_funded_settings_check CHECK (
    NOT group_funded_enabled
    OR (
      group_funded_min_required_contributors IS NOT NULL
      AND group_funded_max_required_contributors IS NOT NULL
      AND group_funded_default_required_contributors IS NOT NULL
      AND group_funded_min_deadline_hours IS NOT NULL
      AND group_funded_max_deadline_days IS NOT NULL
      AND group_funded_min_required_contributors <= group_funded_default_required_contributors
      AND group_funded_default_required_contributors <= group_funded_max_required_contributors
      AND group_funded_min_deadline_hours <= group_funded_max_deadline_days * 24
      AND (
        group_funded_min_contribution_amount_cents IS NULL
        OR group_funded_max_contribution_amount_cents IS NULL
        OR group_funded_min_contribution_amount_cents <= group_funded_max_contribution_amount_cents
      )
    )
  )
);

CREATE INDEX location_services_tenant_location_idx
  ON location_services (tenant_id, location_id, is_active, sort_order);

CREATE INDEX location_services_group_funded_enabled_idx
  ON location_services (tenant_id, location_id, service_id)
  WHERE group_funded_enabled = TRUE AND is_active = TRUE;

CREATE INDEX vendor_services_tenant_active_sort_idx
  ON vendor_services (tenant_id, is_active, sort_order, name);

CREATE TABLE vendor_availability_blocks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT REFERENCES vendor_services(id) ON DELETE SET NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  ends_next_day BOOLEAN NOT NULL DEFAULT FALSE,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (ends_next_day AND starts_at > ends_at)
    OR (NOT ends_next_day AND starts_at < ends_at)
  )
);

CREATE INDEX vendor_availability_blocks_location_day_idx
  ON vendor_availability_blocks (tenant_id, location_id, weekday, starts_at);

CREATE TABLE vendor_availability_exceptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT REFERENCES vendor_services(id) ON DELETE SET NULL,
  exception_date DATE NOT NULL,
  starts_at TIME,
  ends_at TIME,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  capacity INTEGER CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 100),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND starts_at < ends_at)
  )
);

CREATE INDEX vendor_availability_exceptions_location_date_idx
  ON vendor_availability_exceptions (tenant_id, location_id, exception_date);

CREATE TABLE bookings (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  customer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  booking_quantity INTEGER NOT NULL DEFAULT 1 CHECK (booking_quantity BETWEEN 1 AND 24),
  execution_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (execution_mode IN ('parallel', 'sequential')),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'rescheduled', 'completed', 'canceled', 'disputed', 'reviewed')
  ),
  notes TEXT,
  payment_reference TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')
  ),
  payment_proof_object_key TEXT,
  payment_proof_file_name TEXT,
  payment_proof_content_type TEXT,
  payment_proof_size_bytes INTEGER CHECK (
    payment_proof_size_bytes IS NULL OR payment_proof_size_bytes > 0
  ),
  payment_proof_uploaded_at TIMESTAMPTZ,
  payment_verified_at TIMESTAMPTZ,
  payment_verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_rejected_at TIMESTAMPTZ,
  payment_rejected_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  payment_rejection_reason TEXT,
  pending_expires_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  expiration_reason TEXT,
  notify_by_email BOOLEAN NOT NULL DEFAULT TRUE,
  notify_by_sms BOOLEAN NOT NULL DEFAULT FALSE,
  sms_alert_fee_payment_id TEXT,
  contact_verified_at TIMESTAMPTZ,
  contact_verification_channel TEXT CHECK (
    contact_verification_channel IS NULL OR contact_verification_channel IN ('email', 'sms')
  ),
  queue_ticket_id BIGINT,
  checked_in_at TIMESTAMPTZ,
  checked_in_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  no_show_at TIMESTAMPTZ,
  no_show_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  check_in_window_notified_at TIMESTAMPTZ,
  check_in_closing_notified_at TIMESTAMPTZ,
  group_funded_booking_id BIGINT,
  booking_payment_source TEXT NOT NULL DEFAULT 'standard' CHECK (
    booking_payment_source IN ('standard', 'group_funded')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at)
);

CREATE INDEX bookings_customer_schedule_idx
  ON bookings (customer_user_id, scheduled_start_at DESC);

CREATE INDEX bookings_vendor_schedule_idx
  ON bookings (tenant_id, location_id, scheduled_start_at ASC);

CREATE INDEX bookings_customer_detail_idx
  ON bookings (customer_user_id, id);

CREATE INDEX bookings_vendor_checkin_idx
  ON bookings (tenant_id, location_id, scheduled_start_at, status)
  WHERE queue_ticket_id IS NULL;

CREATE INDEX bookings_queue_ticket_idx
  ON bookings (queue_ticket_id)
  WHERE queue_ticket_id IS NOT NULL;

CREATE INDEX bookings_vendor_no_show_idx
  ON bookings (tenant_id, location_id, no_show_at)
  WHERE no_show_at IS NOT NULL;

CREATE INDEX bookings_payment_proof_idx
  ON bookings (tenant_id, payment_status, payment_proof_uploaded_at DESC)
  WHERE payment_proof_object_key IS NOT NULL;

CREATE INDEX bookings_payment_review_idx
  ON bookings (tenant_id, payment_status, payment_verified_at, payment_rejected_at);

CREATE INDEX bookings_pending_expiration_idx
  ON bookings (pending_expires_at)
  WHERE status = 'pending' AND payment_proof_object_key IS NULL;

CREATE INDEX bookings_check_in_window_notify_idx
  ON bookings (scheduled_start_at)
  WHERE status IN ('confirmed', 'rescheduled')
    AND queue_ticket_id IS NULL
    AND check_in_window_notified_at IS NULL;

CREATE INDEX bookings_check_in_closing_notify_idx
  ON bookings (scheduled_start_at)
  WHERE status IN ('confirmed', 'rescheduled')
    AND queue_ticket_id IS NULL
    AND check_in_closing_notified_at IS NULL;

CREATE TABLE group_funded_bookings (
  id BIGSERIAL PRIMARY KEY,
  public_token TEXT NOT NULL UNIQUE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  location_service_id BIGINT REFERENCES location_services(id) ON DELETE SET NULL,
  organizer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  linked_booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  campaign_status TEXT NOT NULL DEFAULT 'funding' CHECK (
    campaign_status IN (
      'draft',
      'funding',
      'organizer_canceled',
      'funding_failed',
      'funded',
      'slot_recovery',
      'vendor_review',
      'replacement_proposed',
      'vendor_approved',
      'vendor_rejected',
      'vendor_review_expired',
      'confirmed',
      'vendor_canceled',
      'policy_review_required'
    )
  ),
  visibility TEXT NOT NULL DEFAULT 'private_link' CHECK (
    visibility IN ('private_link', 'public')
  ),
  organizer_display_name TEXT NOT NULL,
  campaign_title TEXT NOT NULL DEFAULT '' CHECK (char_length(campaign_title) <= 90),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 20000),
  service_name_snapshot TEXT NOT NULL,
  service_slug_snapshot TEXT NOT NULL,
  location_name_snapshot TEXT NOT NULL,
  location_slug_snapshot TEXT NOT NULL,
  booking_quantity INTEGER NOT NULL DEFAULT 1 CHECK (booking_quantity BETWEEN 1 AND 24),
  execution_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (execution_mode IN ('parallel', 'sequential')),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  funding_deadline_at TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  target_amount_cents INTEGER NOT NULL CHECK (target_amount_cents >= 0),
  required_contribution_amount_cents INTEGER NOT NULL CHECK (required_contribution_amount_cents >= 0),
  rounding_adjustment_cents INTEGER NOT NULL DEFAULT 0 CHECK (rounding_adjustment_cents >= 0),
  required_contributors INTEGER NOT NULL CHECK (required_contributors BETWEEN 2 AND 100),
  paid_participant_count INTEGER NOT NULL DEFAULT 0 CHECK (paid_participant_count >= 0),
  funded_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (funded_amount_cents >= 0),
  funded_at TIMESTAMPTZ,
  vendor_review_started_at TIMESTAMPTZ,
  vendor_review_expires_at TIMESTAMPTZ,
  replacement_scheduled_start_at TIMESTAMPTZ,
  replacement_scheduled_end_at TIMESTAMPTZ,
  replacement_proposed_at TIMESTAMPTZ,
  replacement_proposed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  replacement_note TEXT,
  confirmed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at),
  CHECK (
    replacement_scheduled_start_at IS NULL
    OR replacement_scheduled_end_at IS NULL
    OR replacement_scheduled_start_at < replacement_scheduled_end_at
  ),
  CHECK (funding_deadline_at < scheduled_start_at),
  CHECK (paid_participant_count <= required_contributors)
);

CREATE INDEX group_funded_bookings_tenant_status_idx
  ON group_funded_bookings (tenant_id, location_id, campaign_status, created_at DESC);

CREATE INDEX group_funded_bookings_public_idx
  ON group_funded_bookings (tenant_id, location_id, funding_deadline_at)
  WHERE visibility = 'public'
    AND campaign_status IN ('funding', 'funded', 'vendor_review', 'replacement_proposed');

CREATE INDEX group_funded_bookings_organizer_idx
  ON group_funded_bookings (organizer_user_id, created_at DESC);

CREATE INDEX group_funded_bookings_deadline_idx
  ON group_funded_bookings (funding_deadline_at)
  WHERE campaign_status = 'funding';

CREATE INDEX bookings_group_funded_booking_idx
  ON bookings (group_funded_booking_id)
  WHERE group_funded_booking_id IS NOT NULL;

CREATE TABLE group_funded_booking_items (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE RESTRICT,
  location_service_id BIGINT REFERENCES location_services(id) ON DELETE SET NULL,
  service_name_snapshot TEXT NOT NULL,
  service_slug_snapshot TEXT NOT NULL,
  booking_quantity INTEGER NOT NULL DEFAULT 1 CHECK (booking_quantity BETWEEN 1 AND 24),
  price_amount_cents INTEGER NOT NULL CHECK (price_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  execution_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (execution_mode IN ('parallel', 'sequential')),
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at),
  UNIQUE (campaign_id, service_id, scheduled_start_at)
);

CREATE INDEX group_funded_booking_items_campaign_idx
  ON group_funded_booking_items (campaign_id, sort_order, id);

CREATE INDEX group_funded_booking_items_capacity_idx
  ON group_funded_booking_items (tenant_id, location_id, service_id, scheduled_start_at, scheduled_end_at);

CREATE TABLE group_funded_booking_participants (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_role TEXT NOT NULL DEFAULT 'contributor' CHECK (
    participant_role IN ('organizer', 'contributor')
  ),
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX group_funded_participants_user_idx
  ON group_funded_booking_participants (user_id, joined_at DESC);

CREATE TABLE group_funded_booking_contributions (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  participant_id BIGINT NOT NULL REFERENCES group_funded_booking_participants(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  contribution_status TEXT NOT NULL DEFAULT 'pending_proof' CHECK (
    contribution_status IN (
      'pending_proof',
      'submitted',
      'verified',
      'rejected',
      'refund_pending',
      'refunded',
      'policy_review_required'
    )
  ),
  payment_reference TEXT,
  payment_proof_object_key TEXT,
  payment_proof_file_name TEXT,
  payment_proof_content_type TEXT,
  payment_proof_size_bytes INTEGER CHECK (
    payment_proof_size_bytes IS NULL OR payment_proof_size_bytes > 0
  ),
  payment_proof_uploaded_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  refund_status TEXT CHECK (
    refund_status IS NULL
    OR refund_status IN ('pending', 'in_progress', 'completed', 'rejected', 'policy_review_required')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX group_funded_contributions_campaign_status_idx
  ON group_funded_booking_contributions (campaign_id, contribution_status, created_at);

CREATE INDEX group_funded_contributions_user_idx
  ON group_funded_booking_contributions (user_id, created_at DESC);

CREATE INDEX group_funded_contributions_proof_idx
  ON group_funded_booking_contributions (campaign_id, contribution_status, payment_proof_uploaded_at DESC)
  WHERE payment_proof_object_key IS NOT NULL;

CREATE TABLE group_funded_booking_refunds (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  contribution_id BIGINT NOT NULL REFERENCES group_funded_booking_contributions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  refund_reason TEXT NOT NULL CHECK (
    refund_reason IN (
      'organizer_canceled',
      'funding_failed',
      'vendor_rejected',
      'vendor_review_expired',
      'vendor_canceled',
      'policy_review_required',
      'contribution_rejected',
      'excess_contribution'
    )
  ),
  refund_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    refund_status IN ('pending', 'in_progress', 'completed', 'rejected', 'policy_review_required')
  ),
  vendor_actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  evidence_object_key TEXT,
  evidence_file_name TEXT,
  evidence_content_type TEXT,
  evidence_size_bytes INTEGER CHECK (
    evidence_size_bytes IS NULL OR evidence_size_bytes > 0
  ),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX group_funded_refunds_contribution_unique_idx
  ON group_funded_booking_refunds (contribution_id);

CREATE INDEX group_funded_refunds_campaign_status_idx
  ON group_funded_booking_refunds (campaign_id, refund_status, created_at DESC);

CREATE INDEX group_funded_refunds_user_idx
  ON group_funded_booking_refunds (user_id, created_at DESC);

CREATE TABLE group_funded_booking_events (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX group_funded_events_campaign_idx
  ON group_funded_booking_events (campaign_id, created_at);

CREATE INDEX group_funded_events_tenant_idx
  ON group_funded_booking_events (tenant_id, location_id, created_at DESC);

CREATE INDEX group_funded_events_type_idx
  ON group_funded_booking_events (event_type, created_at DESC);

CREATE TABLE group_funded_capacity_holds (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES group_funded_bookings(id) ON DELETE CASCADE,
  group_funded_booking_item_id BIGINT REFERENCES group_funded_booking_items(id) ON DELETE SET NULL,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES vendor_services(id) ON DELETE CASCADE,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  booking_quantity INTEGER NOT NULL DEFAULT 1 CHECK (booking_quantity BETWEEN 1 AND 24),
  hold_status TEXT NOT NULL DEFAULT 'active' CHECK (
    hold_status IN ('active', 'released', 'expired', 'converted')
  ),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  converted_booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at)
);

CREATE INDEX group_funded_capacity_holds_active_idx
  ON group_funded_capacity_holds (tenant_id, location_id, service_id, scheduled_start_at, scheduled_end_at)
  WHERE hold_status = 'active';

CREATE INDEX group_funded_capacity_holds_expiry_idx
  ON group_funded_capacity_holds (expires_at)
  WHERE hold_status = 'active';

CREATE INDEX group_funded_capacity_holds_item_idx
  ON group_funded_capacity_holds (group_funded_booking_item_id)
  WHERE group_funded_booking_item_id IS NOT NULL;

CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  service_counter_id BIGINT REFERENCES service_counters(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  lookup_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  notify_by_email BOOLEAN NOT NULL DEFAULT FALSE,
  notify_by_sms BOOLEAN NOT NULL DEFAULT FALSE,
  join_channel TEXT NOT NULL DEFAULT 'online' CHECK (join_channel IN ('online', 'qr', 'vendor')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (
    status IN ('waiting', 'called', 'served', 'skipped', 'cancelled')
  ),
  notes TEXT,
  notified_almost_there_at TIMESTAMPTZ,
  notified_called_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  customer_confirmed_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  unserved_at TIMESTAMPTZ,
  carried_over_at TIMESTAMPTZ,
  carry_over_count INTEGER NOT NULL DEFAULT 0,
  service_priority_band TEXT NOT NULL DEFAULT 'normal',
  rejoin_deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    status IN ('waiting', 'called', 'served', 'skipped', 'cancelled', 'unserved')
  ),
  UNIQUE (tenant_id, location_id, date_key, sequence)
);

CREATE TABLE queue_events (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  queue_date_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE queue_day_closures (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  queue_date_key TEXT NOT NULL,
  next_queue_date_key TEXT NOT NULL DEFAULT '00000000',
  closure_reason TEXT,
  affected_ticket_ids BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
  waiting_carried_count INTEGER NOT NULL DEFAULT 0,
  called_unserved_count INTEGER NOT NULL DEFAULT 0,
  closed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reopened_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX queue_day_closures_active_scope_idx
  ON queue_day_closures (tenant_id, location_id, queue_date_key)
  WHERE reopened_at IS NULL;

CREATE INDEX queue_day_closures_scope_created_idx
  ON queue_day_closures (tenant_id, location_id, queue_date_key, created_at DESC);

CREATE TABLE queue_day_pauses (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  queue_date_key TEXT NOT NULL,
  pause_reason TEXT,
  pause_mode TEXT NOT NULL DEFAULT 'manual' CHECK (pause_mode IN ('manual', 'auto_threshold')),
  paused_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resumed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX queue_day_pauses_active_scope_idx
  ON queue_day_pauses (tenant_id, location_id, queue_date_key)
  WHERE resumed_at IS NULL;

CREATE INDEX queue_day_pauses_scope_created_idx
  ON queue_day_pauses (tenant_id, location_id, queue_date_key, created_at DESC);

CREATE TABLE queue_join_otps (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('email', 'sms')),
  delivery_target TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  chain_id UUID NOT NULL DEFAULT gen_random_uuid(),
  parent_otp_id BIGINT REFERENCES queue_join_otps(id) ON DELETE SET NULL,
  resend_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (resend_ordinal BETWEEN 0 AND 3),
  incorrect_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_attempt_count BETWEEN 0 AND 5),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_otps (
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

CREATE TABLE notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  purpose TEXT NOT NULL DEFAULT 'general',
  recipient TEXT NOT NULL,
  subject TEXT,
  provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (key, value)
VALUES ('enterprise_inquiry_email', 'carlo.abella@gmail.com');

CREATE TABLE public_board_assets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('background', 'logo', 'location', 'service')),
  object_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public_board_themes (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT REFERENCES store_locations(id) ON DELETE CASCADE,
  theme JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE queue_fee_settings (
  plan_slug TEXT PRIMARY KEY CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_plans (
  slug TEXT PRIMARY KEY CHECK (slug IN ('free', 'economical', 'pro', 'enterprise')),
  name TEXT NOT NULL,
  best_for TEXT NOT NULL,
  checkout_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_amount_cents INTEGER NOT NULL CHECK (monthly_amount_cents >= 0),
  annual_amount_cents INTEGER NOT NULL CHECK (annual_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  entitlements JSONB NOT NULL DEFAULT '{}'::JSONB,
  included JSONB NOT NULL DEFAULT '[]'::JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  policy_revision INTEGER NOT NULL DEFAULT 1,
  system_managed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO queue_fee_settings (plan_slug, enabled, amount_cents, currency)
VALUES
  ('free', FALSE, 0, 'PHP'),
  ('economical', TRUE, 5000, 'PHP'),
  ('pro', TRUE, 2500, 'PHP'),
  ('enterprise', FALSE, 0, 'PHP');

INSERT INTO subscription_plans (
  slug,
  name,
  best_for,
  checkout_enabled,
  monthly_amount_cents,
  annual_amount_cents,
  currency,
  entitlements,
  included,
  sort_order,
  policy_revision,
  system_managed
)
VALUES
  (
    'free',
    'Free',
    'New and queue-only vendors',
    FALSE,
    0,
    0,
    'PHP',
    '{"locations":1,"counters":1,"staffSeats":1,"monthlyTickets":500,"monthlyTransactionalEmails":500,"monthlyQueueEmailJourneys":500,"monthlyServiceBookings":0,"historyDays":7,"historyLabel":"7-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"none","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":false,"analytics":false,"csvExport":false,"pdfExport":false,"allowedHistoryExportRanges":[],"advancedRoles":false,"slaSupport":false,"supportLevel":"self_serve","customDomain":false,"sso":false,"queueSystemAccess":true,"publicFacingBranding":false,"marketplaceDiscovery":false,"serviceBookingAccess":false,"groupFundedCampaignAccess":false}',
    '["1 location","1 counter","1 vendor seat","QR join page","GetPrio-branded public queue page","Basic queue dashboard","500 Queue Tickets/mo","500 Queue Email Journeys/mo","7-day queue history"]',
    10,
    1,
    TRUE
  ),
  (
    'economical',
    'Economical',
    'Solo vendors, small shops, small clinics',
    TRUE,
    49900,
    498000,
    'PHP',
    '{"locations":1,"counters":1,"staffSeats":1,"monthlyTickets":1000,"monthlyTransactionalEmails":1000,"monthlyQueueEmailJourneys":1000,"monthlyServiceBookings":100,"historyDays":30,"historyLabel":"30-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"none","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":false,"brandedQueuePages":false,"analytics":false,"csvExport":false,"pdfExport":false,"allowedHistoryExportRanges":["today","month"],"advancedRoles":false,"slaSupport":false,"supportLevel":"self_serve","customDomain":false,"sso":false,"queueSystemAccess":true,"publicFacingBranding":false,"marketplaceDiscovery":true,"serviceBookingAccess":true,"groupFundedCampaignAccess":true}',
    '["1 location","1 counter","1 vendor seat","QR join page","Public queue board","Basic dashboard","Email alerts","1,000 Queue Email Journeys/mo","1,000 Queue Tickets/mo","100 Service Bookings/mo","30-day history"]',
    20,
    1,
    FALSE
  ),
  (
    'pro',
    'Pro',
    'Clinics, salons, offices, busier service counters',
    TRUE,
    149900,
    1499000,
    'PHP',
    '{"locations":3,"counters":5,"staffSeats":10,"monthlyTickets":5000,"monthlyTransactionalEmails":5000,"monthlyQueueEmailJourneys":5000,"monthlyServiceBookings":1000,"historyDays":365,"historyLabel":"365-day history","emailAlerts":true,"smsAllowance":300,"smsBundleType":"fixed","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":true,"analytics":true,"csvExport":true,"pdfExport":true,"allowedHistoryExportRanges":["today","week","month","quarter","year"],"advancedRoles":false,"slaSupport":false,"supportLevel":"standard","customDomain":false,"sso":false,"queueSystemAccess":true,"publicFacingBranding":true,"marketplaceDiscovery":true,"serviceBookingAccess":true,"groupFundedCampaignAccess":true}',
    '["3 locations","5 counters","10 staff seats","Branded queue pages","Analytics","CSV export","PDF export","Queue settings","Email alerts","5,000 Queue Email Journeys/mo","5,000 Queue Tickets/mo","1,000 Service Bookings/mo","300 SMS/mo"]',
    30,
    1,
    FALSE
  ),
  (
    'enterprise',
    'Enterprise',
    'Multi-branch businesses, schools, LGUs, hospitals',
    FALSE,
    699900,
    6999000,
    'PHP',
    '{"locations":10,"counters":20,"staffSeats":50,"monthlyTickets":50000,"monthlyTransactionalEmails":50000,"monthlyQueueEmailJourneys":50000,"monthlyServiceBookings":10000,"historyDays":1095,"historyLabel":"1,095-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"custom","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":true,"analytics":true,"csvExport":true,"pdfExport":true,"allowedHistoryExportRanges":["today","week","month","quarter","year"],"advancedRoles":true,"slaSupport":true,"supportLevel":"sla","customDomain":true,"sso":true,"queueSystemAccess":true,"publicFacingBranding":true,"marketplaceDiscovery":true,"serviceBookingAccess":true,"groupFundedCampaignAccess":true}',
    '["10+ locations","20 counters","Advanced roles","SLA/support","Longer history","50,000 Queue Tickets/mo","50,000 Queue Email Journeys/mo","10,000 Service Bookings/mo","Custom SMS bundle","Optional custom domain/SSO"]',
    40,
    1,
    FALSE
  );

CREATE TABLE plan_feature_entitlements (
  plan_slug TEXT NOT NULL REFERENCES subscription_plans(slug) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key IN ('queue', 'branding', 'discovery', 'booking', 'campaigns')),
  enabled BOOLEAN NOT NULL,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_slug, feature_key)
);

CREATE TABLE plan_allowances (
  plan_slug TEXT NOT NULL REFERENCES subscription_plans(slug) ON DELETE CASCADE,
  allowance_key TEXT NOT NULL CHECK (allowance_key IN ('queueTickets', 'queueEmailJourneys', 'serviceBookings')),
  monthly_limit INTEGER NOT NULL CHECK (monthly_limit >= 0),
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plan_slug, allowance_key)
);

INSERT INTO plan_feature_entitlements (plan_slug, feature_key, enabled)
SELECT * FROM (VALUES
  ('free','queue',TRUE),('free','branding',FALSE),('free','discovery',FALSE),('free','booking',FALSE),('free','campaigns',FALSE),
  ('economical','queue',TRUE),('economical','branding',FALSE),('economical','discovery',TRUE),('economical','booking',TRUE),('economical','campaigns',TRUE),
  ('pro','queue',TRUE),('pro','branding',TRUE),('pro','discovery',TRUE),('pro','booking',TRUE),('pro','campaigns',TRUE),
  ('enterprise','queue',TRUE),('enterprise','branding',TRUE),('enterprise','discovery',TRUE),('enterprise','booking',TRUE),('enterprise','campaigns',TRUE)
) AS defaults(plan_slug, feature_key, enabled);

INSERT INTO plan_allowances (plan_slug, allowance_key, monthly_limit)
SELECT * FROM (VALUES
  ('free','queueTickets',500),('free','queueEmailJourneys',500),('free','serviceBookings',0),
  ('economical','queueTickets',1000),('economical','queueEmailJourneys',1000),('economical','serviceBookings',100),
  ('pro','queueTickets',5000),('pro','queueEmailJourneys',5000),('pro','serviceBookings',1000),
  ('enterprise','queueTickets',50000),('enterprise','queueEmailJourneys',50000),('enterprise','serviceBookings',10000)
) AS defaults(plan_slug, allowance_key, monthly_limit);

CREATE TABLE queue_join_payments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  otp_id BIGINT NOT NULL REFERENCES queue_join_otps(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise')),
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

CREATE TABLE booking_sms_alert_payments (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_otp_id BIGINT NOT NULL REFERENCES booking_otps(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise')),
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

CREATE TABLE tenant_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL CHECK (plan_slug IN ('free', 'economical', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    status IN ('active', 'unpaid', 'past_due', 'suspended', 'canceled', 'expired')
  ),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_checkout_session_id TEXT,
  billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'annual', 'custom')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  entitlements JSONB NOT NULL DEFAULT '{}'::JSONB,
  entitlement_model_version INTEGER NOT NULL DEFAULT 1,
  entitlement_comparison_hash TEXT,
  entitlement_converted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plan_policy_baselines (
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
  CASE WHEN plan.slug = 'free'
    THEN (SELECT jsonb_object_agg(feature_key, enabled) FROM plan_feature_entitlements WHERE plan_slug = plan.slug)
    ELSE '{}'::jsonb
  END,
  CASE plan.slug
    WHEN 'free' THEN (SELECT jsonb_object_agg(allowance_key, monthly_limit) FROM plan_allowances WHERE plan_slug = plan.slug)
    WHEN 'economical' THEN '{"queueTickets":500}'::jsonb
    WHEN 'pro' THEN '{"queueTickets":5000}'::jsonb
    WHEN 'enterprise' THEN '{"queueTickets":25000}'::jsonb
  END
FROM subscription_plans AS plan;

CREATE TABLE tenant_entitlement_overrides (
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
CREATE UNIQUE INDEX tenant_entitlement_overrides_current_idx
  ON tenant_entitlement_overrides (subscription_id, policy_key)
  WHERE revoked_at IS NULL;

CREATE TABLE subscription_transitions (
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

CREATE TABLE entitlement_rollout_runs (
  id BIGSERIAL PRIMARY KEY,
  run_type TEXT NOT NULL,
  cohort TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed','rolled_back')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE entitlement_rollout_anomalies (
  id BIGSERIAL PRIMARY KEY,
  rollout_run_id BIGINT NOT NULL REFERENCES entitlement_rollout_runs(id) ON DELETE CASCADE,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE SET NULL,
  anomaly_code TEXT NOT NULL,
  blocking BOOLEAN NOT NULL DEFAULT TRUE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_checkout_sessions (
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

CREATE TABLE billing_events (
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

CREATE INDEX idx_tenants_slug_active
  ON tenants (slug, is_active);

CREATE INDEX idx_oauth_accounts_user_id
  ON oauth_accounts (user_id);

CREATE INDEX idx_tenant_memberships_user_id
  ON tenant_memberships (user_id);

CREATE INDEX idx_tenant_memberships_tenant_id
  ON tenant_memberships (tenant_id);

CREATE UNIQUE INDEX idx_store_locations_one_primary
  ON store_locations (tenant_id)
  WHERE is_primary = TRUE;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_queue_ticket_id_fkey
  FOREIGN KEY (queue_ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_group_funded_booking_id_fkey
  FOREIGN KEY (group_funded_booking_id) REFERENCES group_funded_bookings(id) ON DELETE SET NULL;

CREATE INDEX idx_store_locations_tenant_active
  ON store_locations (tenant_id, is_active);

CREATE INDEX idx_store_hours_location_weekday
  ON store_hours (location_id, weekday);

CREATE INDEX idx_tickets_tenant_status_created_at
  ON tickets (tenant_id, status, created_at);

CREATE INDEX idx_tickets_location_status_created_at
  ON tickets (location_id, status, created_at);

CREATE INDEX idx_tickets_lookup_code
  ON tickets (lookup_code);

CREATE INDEX idx_queue_join_otps_tenant_expires
  ON queue_join_otps (tenant_id, expires_at DESC);

CREATE INDEX idx_booking_otps_tenant_expires
  ON booking_otps (tenant_id, expires_at DESC);

CREATE INDEX idx_booking_otps_verified_token
  ON booking_otps (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE INDEX idx_notification_deliveries_tenant_email_sent
  ON notification_deliveries (tenant_id, sent_at DESC)
  WHERE channel = 'email' AND status = 'sent';

CREATE INDEX idx_public_board_assets_tenant_created
  ON public_board_assets (tenant_id, created_at DESC);

CREATE UNIQUE INDEX idx_public_board_themes_tenant_default
  ON public_board_themes (tenant_id)
  WHERE location_id IS NULL;

CREATE UNIQUE INDEX idx_public_board_themes_location
  ON public_board_themes (location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX idx_counters_tenant_key_date
  ON counters (tenant_id, location_id, key, date_key);

CREATE INDEX idx_tenant_subscriptions_tenant_status
  ON tenant_subscriptions (tenant_id, status, updated_at DESC);

CREATE INDEX idx_queue_join_payments_tenant_status
  ON queue_join_payments (tenant_id, status, created_at DESC);

CREATE INDEX idx_queue_join_payments_status_created
  ON queue_join_payments (status, created_at DESC);

CREATE INDEX idx_booking_sms_alert_payments_tenant_status
  ON booking_sms_alert_payments (tenant_id, status, created_at DESC);

CREATE INDEX idx_booking_sms_alert_payments_status_created
  ON booking_sms_alert_payments (status, created_at DESC);

CREATE INDEX idx_billing_checkout_sessions_tenant_id
  ON billing_checkout_sessions (tenant_id);

CREATE INDEX idx_billing_events_provider_checkout_session_id
  ON billing_events (provider_checkout_session_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_counters_updated_at
BEFORE UPDATE ON counters
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_store_locations_updated_at
BEFORE UPDATE ON store_locations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_store_hours_updated_at
BEFORE UPDATE ON store_hours
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendor_services_updated_at
BEFORE UPDATE ON vendor_services
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_location_services_updated_at
BEFORE UPDATE ON location_services
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendor_availability_blocks_updated_at
BEFORE UPDATE ON vendor_availability_blocks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendor_availability_exceptions_updated_at
BEFORE UPDATE ON vendor_availability_exceptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_group_funded_bookings_updated_at
BEFORE UPDATE ON group_funded_bookings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_group_funded_booking_participants_updated_at
BEFORE UPDATE ON group_funded_booking_participants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_group_funded_booking_items_updated_at
BEFORE UPDATE ON group_funded_booking_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_group_funded_booking_contributions_updated_at
BEFORE UPDATE ON group_funded_booking_contributions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_group_funded_booking_refunds_updated_at
BEFORE UPDATE ON group_funded_booking_refunds
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_group_funded_capacity_holds_updated_at
BEFORE UPDATE ON group_funded_capacity_holds
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_tickets_updated_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_queue_join_otps_updated_at
BEFORE UPDATE ON queue_join_otps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_booking_otps_updated_at
BEFORE UPDATE ON booking_otps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_platform_settings_updated_at
BEFORE UPDATE ON platform_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_public_board_themes_updated_at
BEFORE UPDATE ON public_board_themes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_tenant_subscriptions_updated_at
BEFORE UPDATE ON tenant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_queue_fee_settings_updated_at
BEFORE UPDATE ON queue_fee_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_queue_join_payments_updated_at
BEFORE UPDATE ON queue_join_payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_booking_sms_alert_payments_updated_at
BEFORE UPDATE ON booking_sms_alert_payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_billing_checkout_sessions_updated_at
BEFORE UPDATE ON billing_checkout_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE usage_accounts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL CHECK (resource_key IN ('queueTickets','queueEmailJourneys','serviceBookings')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, resource_key)
);

CREATE TABLE subscription_allowance_periods (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES tenant_subscriptions(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end > period_start),
  UNIQUE (subscription_id, period_start)
);

CREATE TABLE allowance_operations (
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
CREATE INDEX allowance_operations_period_idx
  ON allowance_operations (allowance_period_id, usage_account_id, created_at);
CREATE UNIQUE INDEX allowance_operations_one_reversal_idx
  ON allowance_operations (reverses_operation_id) WHERE reverses_operation_id IS NOT NULL;

CREATE TABLE allowance_allocations (
  id BIGSERIAL PRIMARY KEY,
  operation_id BIGINT NOT NULL REFERENCES allowance_operations(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('base','credit')),
  allowance_period_id BIGINT REFERENCES subscription_allowance_periods(id) ON DELETE RESTRICT,
  credit_lot_id BIGINT,
  units INTEGER NOT NULL CHECK (units > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE allowance_reservations (
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
CREATE INDEX allowance_reservations_active_expiry_idx
  ON allowance_reservations (expires_at) WHERE status = 'active';
CREATE TABLE allowance_reservation_allocations (
  id BIGSERIAL PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES allowance_reservations(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL CHECK (source_type IN ('base','credit')),
  allowance_period_id BIGINT REFERENCES subscription_allowance_periods(id) ON DELETE RESTRICT,
  credit_lot_id BIGINT,
  units INTEGER NOT NULL CHECK (units > 0)
);

CREATE TABLE allowance_warning_claims (
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

CREATE TABLE allowance_reconciliation_records (
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
  ADD COLUMN email_journey_mode TEXT NOT NULL DEFAULT 'not_eligible'
  CHECK (email_journey_mode IN ('not_eligible','metered','journey_exhausted'));

CREATE TABLE queue_email_journeys (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('metered','journey_exhausted')),
  otp_chain_id UUID,
  email_opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticket_id)
);
CREATE UNIQUE INDEX queue_email_journeys_otp_chain_idx ON queue_email_journeys (otp_chain_id) WHERE otp_chain_id IS NOT NULL;

CREATE TABLE queue_email_slots (
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

CREATE TABLE usage_credit_packs (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'enabled' CHECK (state IN ('draft','enabled','disabled','archived')),
  current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_credit_pack_revisions (
  id BIGSERIAL PRIMARY KEY,
  pack_id BIGINT NOT NULL REFERENCES usage_credit_packs(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  ticket_units INTEGER NOT NULL CHECK (ticket_units >= 0),
  journey_units INTEGER NOT NULL CHECK (journey_units >= 0),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, revision),
  CHECK (ticket_units > 0 OR journey_units > 0)
);

INSERT INTO usage_credit_packs (code, name, state)
VALUES ('P100','P100 Usage Credits','enabled'), ('P500','P500 Usage Credits','enabled'), ('P1000','P1000 Usage Credits','enabled');
INSERT INTO usage_credit_pack_revisions (pack_id, revision, ticket_units, journey_units, price_cents, currency, reason)
SELECT id, 1,
  CASE code WHEN 'P100' THEN 100 WHEN 'P500' THEN 500 ELSE 1000 END,
  CASE code WHEN 'P100' THEN 100 WHEN 'P500' THEN 500 ELSE 1000 END,
  CASE code WHEN 'P100' THEN 9900 WHEN 'P500' THEN 39900 ELSE 69900 END,
  'PHP', 'Initial settled Usage Credit catalog'
FROM usage_credit_packs;

CREATE TABLE usage_credit_purchases (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  pack_id BIGINT NOT NULL REFERENCES usage_credit_packs(id) ON DELETE RESTRICT,
  pack_revision_id BIGINT NOT NULL REFERENCES usage_credit_pack_revisions(id) ON DELETE RESTRICT,
  purchase_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','fulfilled','refund_pending','refunded','failed','disputed')),
  ticket_units INTEGER NOT NULL CHECK (ticket_units >= 0),
  journey_units INTEGER NOT NULL CHECK (journey_units >= 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency = 'PHP'),
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_checkout_id TEXT,
  checkout_url TEXT,
  provider_payment_id TEXT,
  purchased_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, purchase_key)
);
CREATE UNIQUE INDEX usage_credit_purchase_provider_checkout_idx ON usage_credit_purchases (provider, provider_checkout_id) WHERE provider_checkout_id IS NOT NULL;

CREATE TABLE usage_credit_lots (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  resource_key TEXT NOT NULL CHECK (resource_key IN ('queueTickets','queueEmailJourneys')),
  source_type TEXT NOT NULL CHECK (source_type IN ('promotional','purchased')),
  source_reference TEXT NOT NULL,
  granted_units INTEGER NOT NULL CHECK (granted_units > 0),
  revoked_units INTEGER NOT NULL DEFAULT 0 CHECK (revoked_units >= 0),
  frozen_units INTEGER NOT NULL DEFAULT 0 CHECK (frozen_units >= 0),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','revoked','expired')),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, resource_key, source_type, source_reference),
  CHECK (revoked_units + frozen_units <= granted_units)
);
CREATE INDEX usage_credit_lots_consumption_idx ON usage_credit_lots (tenant_id, resource_key, status, expires_at, created_at);
ALTER TABLE allowance_allocations ADD CONSTRAINT allowance_allocations_credit_lot_fk FOREIGN KEY (credit_lot_id) REFERENCES usage_credit_lots(id) ON DELETE RESTRICT;
ALTER TABLE allowance_reservation_allocations ADD CONSTRAINT allowance_reservation_allocations_credit_lot_fk FOREIGN KEY (credit_lot_id) REFERENCES usage_credit_lots(id) ON DELETE RESTRICT;

CREATE TABLE usage_credit_refunds (
  id BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL UNIQUE REFERENCES usage_credit_purchases(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('requested','provider_pending','confirmed','failed')),
  reason TEXT NOT NULL,
  requested_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  provider_refund_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE usage_credit_disputes (
  id BIGSERIAL PRIMARY KEY,
  purchase_id BIGINT NOT NULL REFERENCES usage_credit_purchases(id) ON DELETE RESTRICT,
  provider_dispute_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open','won','lost','closed')),
  consumed_exposure_units INTEGER NOT NULL DEFAULT 0 CHECK (consumed_exposure_units >= 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

COMMIT;
