CREATE TABLE IF NOT EXISTS developer_project_rate_limits (
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  read_limit_per_minute INTEGER NOT NULL CHECK (read_limit_per_minute > 0),
  write_limit_per_minute INTEGER NOT NULL CHECK (write_limit_per_minute > 0),
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (developer_project_id, environment)
);
