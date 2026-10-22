BEGIN;

ALTER TABLE developer_webhook_registrations
  ADD COLUMN IF NOT EXISTS previous_signing_secret_ciphertext TEXT,
  ADD COLUMN IF NOT EXISTS previous_signing_secret_expires_at TIMESTAMPTZ;

COMMIT;
