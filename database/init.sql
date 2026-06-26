BEGIN;

-- Clean-slate bootstrap for local/dev databases.
-- Docker only runs this file when the Postgres data directory is empty.
-- Running it manually against an existing database will remove app data.

DROP TABLE IF EXISTS billing_events CASCADE;
DROP TABLE IF EXISTS billing_checkout_sessions CASCADE;
DROP TABLE IF EXISTS tenant_subscriptions CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
DROP TABLE IF EXISTS queue_events CASCADE;
DROP TABLE IF EXISTS auth_security_events CASCADE;
DROP TABLE IF EXISTS auth_login_attempts CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS auth_sessions CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS booking_sms_alert_payments CASCADE;
DROP TABLE IF EXISTS booking_otps CASCADE;
DROP TABLE IF EXISTS vendor_availability_exceptions CASCADE;
DROP TABLE IF EXISTS vendor_availability_blocks CASCADE;
DROP TABLE IF EXISTS vendor_services CASCADE;
DROP TABLE IF EXISTS service_counter_assignments CASCADE;
DROP TABLE IF EXISTS service_counters CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS queue_join_payments CASCADE;
DROP TABLE IF EXISTS queue_fee_settings CASCADE;
DROP TABLE IF EXISTS platform_settings CASCADE;
DROP TABLE IF EXISTS public_board_themes CASCADE;
DROP TABLE IF EXISTS public_board_assets CASCADE;
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
  notification_settings JSONB NOT NULL DEFAULT '{"bookingIntake":true,"paymentProofReview":true,"bookingStatusChanges":true}'::JSONB,
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
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  auth_method TEXT NOT NULL CHECK (auth_method IN ('password', 'google', 'facebook')),
  mfa_verified_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  device_label TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_sessions_user_status_idx ON auth_sessions (user_id, status);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);

CREATE TABLE auth_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  identifier_type TEXT NOT NULL CHECK (identifier_type IN ('email')),
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
  contact_email TEXT,
  contact_phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  payment_method_label TEXT,
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
  allow_booking_quantity BOOLEAN NOT NULL DEFAULT FALSE,
  booking_quantity_label TEXT NOT NULL DEFAULT 'Units',
  manual_payment_required BOOLEAN NOT NULL DEFAULT FALSE,
  price_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP' CHECK (currency IN ('PHP')),
  price_display TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slug)
);

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
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (starts_at < ends_at)
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
  asset_type TEXT NOT NULL CHECK (asset_type IN ('background', 'logo')),
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
  plan_slug TEXT PRIMARY KEY CHECK (plan_slug IN ('economical', 'pro', 'enterprise')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_plans (
  slug TEXT PRIMARY KEY CHECK (slug IN ('economical', 'pro', 'enterprise')),
  name TEXT NOT NULL,
  best_for TEXT NOT NULL,
  checkout_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_amount_cents INTEGER NOT NULL CHECK (monthly_amount_cents >= 0),
  annual_amount_cents INTEGER NOT NULL CHECK (annual_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  entitlements JSONB NOT NULL DEFAULT '{}'::JSONB,
  included JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO queue_fee_settings (plan_slug, enabled, amount_cents, currency)
VALUES
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
  included
)
VALUES
  (
    'economical',
    'Economical',
    'Solo vendors, small shops, small clinics',
    TRUE,
    49900,
    498000,
    'PHP',
    '{"locations":1,"counters":1,"staffSeats":1,"monthlyTickets":500,"monthlyTransactionalEmails":100,"historyDays":30,"historyLabel":"30-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"none","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":false,"brandedQueuePages":false,"analytics":false,"csvExport":false,"pdfExport":false,"allowedHistoryExportRanges":["today","month"],"advancedRoles":false,"slaSupport":false,"supportLevel":"self_serve","customDomain":false,"sso":false}',
    '["1 location","1 counter","1 vendor seat","QR join page","Public queue board","Basic dashboard","Email alerts","100 transactional emails/mo","500 tickets/mo","30-day history"]'
  ),
  (
    'pro',
    'Pro',
    'Clinics, salons, offices, busier service counters',
    TRUE,
    149900,
    1499000,
    'PHP',
    '{"locations":3,"counters":5,"staffSeats":10,"monthlyTickets":5000,"monthlyTransactionalEmails":500,"historyDays":365,"historyLabel":"365-day history","emailAlerts":true,"smsAllowance":300,"smsBundleType":"fixed","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":true,"analytics":true,"csvExport":true,"pdfExport":true,"allowedHistoryExportRanges":["today","week","month","quarter","year"],"advancedRoles":false,"slaSupport":false,"supportLevel":"standard","customDomain":false,"sso":false}',
    '["3 locations","5 counters","10 staff seats","Branded queue pages","Analytics","CSV export","PDF export","Queue settings","Email alerts","500 transactional emails/mo","5,000 tickets/mo","300 SMS/mo"]'
  ),
  (
    'enterprise',
    'Enterprise',
    'Multi-branch businesses, schools, LGUs, hospitals',
    FALSE,
    699900,
    6999000,
    'PHP',
    '{"locations":10,"counters":20,"staffSeats":50,"monthlyTickets":25000,"monthlyTransactionalEmails":null,"historyDays":1095,"historyLabel":"1,095-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"custom","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":true,"analytics":true,"csvExport":true,"pdfExport":true,"allowedHistoryExportRanges":["today","week","month","quarter","year"],"advancedRoles":true,"slaSupport":true,"supportLevel":"sla","customDomain":true,"sso":true}',
    '["10+ locations","20 counters","Advanced roles","SLA/support","Longer history","Custom SMS bundle","Optional custom domain/SSO"]'
  );

CREATE TABLE queue_join_payments (
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

CREATE TABLE booking_sms_alert_payments (
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

CREATE TABLE tenant_subscriptions (
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
  billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'annual', 'custom')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  entitlements JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

COMMIT;
