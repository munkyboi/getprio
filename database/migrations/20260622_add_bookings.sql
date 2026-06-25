BEGIN;

CREATE TABLE IF NOT EXISTS bookings (
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
  queue_ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  checked_in_at TIMESTAMPTZ,
  checked_in_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  no_show_at TIMESTAMPTZ,
  no_show_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (scheduled_start_at < scheduled_end_at)
);

CREATE INDEX IF NOT EXISTS bookings_customer_schedule_idx
  ON bookings (customer_user_id, scheduled_start_at DESC);

CREATE INDEX IF NOT EXISTS bookings_vendor_schedule_idx
  ON bookings (tenant_id, location_id, scheduled_start_at ASC);

CREATE INDEX IF NOT EXISTS bookings_customer_detail_idx
  ON bookings (customer_user_id, id);

CREATE INDEX IF NOT EXISTS bookings_vendor_checkin_idx
  ON bookings (tenant_id, location_id, scheduled_start_at, status)
  WHERE queue_ticket_id IS NULL;

CREATE INDEX IF NOT EXISTS bookings_queue_ticket_idx
  ON bookings (queue_ticket_id)
  WHERE queue_ticket_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_vendor_no_show_idx
  ON bookings (tenant_id, location_id, no_show_at)
  WHERE no_show_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_payment_review_idx
  ON bookings (tenant_id, payment_status, payment_verified_at, payment_rejected_at);

CREATE INDEX IF NOT EXISTS bookings_pending_expiration_idx
  ON bookings (pending_expires_at)
  WHERE status = 'pending' AND payment_proof_object_key IS NULL;

DROP TRIGGER IF EXISTS set_bookings_updated_at ON bookings;
CREATE TRIGGER set_bookings_updated_at
BEFORE UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
