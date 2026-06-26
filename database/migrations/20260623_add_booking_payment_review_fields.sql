BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_verified_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_rejected_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS bookings_payment_review_idx
  ON bookings (tenant_id, payment_status, payment_verified_at, payment_rejected_at);

COMMIT;
