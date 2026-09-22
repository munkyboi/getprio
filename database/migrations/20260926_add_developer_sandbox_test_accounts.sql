BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_sandbox_test_account BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sandbox_test_account_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS developer_project_test_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_project_id, slot),
  UNIQUE (developer_project_id, user_id)
);

CREATE INDEX IF NOT EXISTS developer_project_test_accounts_project_idx
  ON developer_project_test_accounts (developer_project_id, status, slot);

CREATE OR REPLACE TRIGGER set_developer_project_test_accounts_updated_at
BEFORE UPDATE ON developer_project_test_accounts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
