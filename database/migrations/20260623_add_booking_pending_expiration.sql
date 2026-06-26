BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pending_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expiration_reason TEXT;

CREATE INDEX IF NOT EXISTS bookings_pending_expiration_idx
  ON bookings (pending_expires_at)
  WHERE status = 'pending' AND payment_proof_object_key IS NULL;

COMMIT;
