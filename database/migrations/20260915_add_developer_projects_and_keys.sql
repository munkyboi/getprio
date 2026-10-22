BEGIN;

CREATE TABLE IF NOT EXISTS developer_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_account_id UUID NOT NULL REFERENCES developer_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS developer_projects_account_name_idx
  ON developer_projects (developer_account_id, lower(name))
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS developer_projects_one_active_per_account_idx
  ON developer_projects (developer_account_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS developer_projects_account_status_idx
  ON developer_projects (developer_account_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_project_memberships (
  id BIGSERIAL PRIMARY KEY,
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (developer_project_id, user_id)
);

CREATE INDEX IF NOT EXISTS developer_project_memberships_user_idx
  ON developer_project_memberships (user_id, status);

CREATE TABLE IF NOT EXISTS developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  key_prefix TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['queues:read']::TEXT[]
    CHECK (scopes <@ ARRAY['queues:read', 'queues:write', 'webhooks:read', 'webhooks:write']::TEXT[]),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS developer_api_keys_project_status_idx
  ON developer_api_keys (developer_project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS developer_api_keys_prefix_idx
  ON developer_api_keys (key_prefix);

COMMIT;
