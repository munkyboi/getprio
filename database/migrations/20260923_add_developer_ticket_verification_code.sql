BEGIN;

ALTER TABLE developer_api_tickets
  ADD COLUMN IF NOT EXISTS verification_code TEXT,
  ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ;

UPDATE developer_api_tickets
   SET verification_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
 WHERE verification_code IS NULL;

ALTER TABLE developer_api_tickets
  ALTER COLUMN verification_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'developer_api_tickets_verification_code_check'
      AND conrelid = 'developer_api_tickets'::regclass
  ) THEN
    ALTER TABLE developer_api_tickets
      ADD CONSTRAINT developer_api_tickets_verification_code_check
      CHECK (verification_code ~ '^[A-F0-9]{8}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS developer_api_tickets_verification_code_idx
  ON developer_api_tickets (verification_code);

COMMIT;
