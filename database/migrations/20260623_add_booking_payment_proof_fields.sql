BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_proof_object_key TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_file_name TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_content_type TEXT,
  ADD COLUMN IF NOT EXISTS payment_proof_size_bytes INTEGER CHECK (
    payment_proof_size_bytes IS NULL OR payment_proof_size_bytes > 0
  ),
  ADD COLUMN IF NOT EXISTS payment_proof_uploaded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS bookings_payment_proof_idx
  ON bookings (tenant_id, payment_status, payment_proof_uploaded_at DESC)
  WHERE payment_proof_object_key IS NOT NULL;

COMMIT;
