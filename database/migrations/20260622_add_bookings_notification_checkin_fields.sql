BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS notify_by_email BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notify_by_sms BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_alert_fee_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS contact_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_verification_channel TEXT,
  ADD COLUMN IF NOT EXISTS queue_ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_contact_verification_channel_check'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_contact_verification_channel_check
      CHECK (
        contact_verification_channel IS NULL
        OR contact_verification_channel IN ('email', 'sms')
      );
  END IF;
END $$;

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

COMMIT;
