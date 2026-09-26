BEGIN;

CREATE TABLE IF NOT EXISTS developer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_account_memberships (
  id BIGSERIAL PRIMARY KEY,
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_account_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS developer_account_one_owner_idx
  ON developer_account_memberships (developer_account_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS developer_account_memberships_user_idx
  ON developer_account_memberships (user_id, status);

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS surface TEXT NOT NULL DEFAULT 'app';

ALTER TABLE auth_sessions
  DROP CONSTRAINT IF EXISTS auth_sessions_surface_check;

ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_surface_check CHECK (surface IN ('app', 'developer'));

CREATE INDEX IF NOT EXISTS auth_sessions_user_surface_status_idx
  ON auth_sessions (user_id, surface, status);

COMMIT;
