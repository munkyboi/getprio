BEGIN;

ALTER TABLE developer_project_test_accounts
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'developer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'developer_project_test_accounts'::regclass
      AND conname = 'developer_project_test_accounts_purpose_check'
  ) THEN
    ALTER TABLE developer_project_test_accounts
      ADD CONSTRAINT developer_project_test_accounts_purpose_check
      CHECK (purpose IN ('developer', 'apple_review'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS developer_project_test_accounts_one_apple_review_idx
  ON developer_project_test_accounts (developer_project_id)
  WHERE purpose = 'apple_review' AND status = 'active';

COMMIT;
