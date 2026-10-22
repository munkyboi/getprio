ALTER TABLE queue_join_otps
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS parent_otp_id BIGINT REFERENCES queue_join_otps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resend_ordinal INTEGER NOT NULL DEFAULT 0 CHECK (resend_ordinal BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS incorrect_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_attempt_count BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

UPDATE queue_join_otps SET chain_id = gen_random_uuid() WHERE chain_id IS NULL;
ALTER TABLE queue_join_otps ALTER COLUMN chain_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS queue_join_otps_chain_ordinal_idx ON queue_join_otps (chain_id, resend_ordinal);
CREATE INDEX IF NOT EXISTS queue_join_otps_chain_idx ON queue_join_otps (chain_id, created_at DESC);

ALTER TABLE queue_email_journeys
  ADD COLUMN IF NOT EXISTS otp_chain_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS queue_email_journeys_otp_chain_idx
  ON queue_email_journeys (otp_chain_id) WHERE otp_chain_id IS NOT NULL;
