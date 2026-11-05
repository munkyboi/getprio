CREATE TABLE IF NOT EXISTS developer_project_webhook_suspensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_project_id UUID NOT NULL REFERENCES developer_projects(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment = 'production'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reinstated')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  suspended_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reinstated_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  reinstatement_reason TEXT,
  reinstated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status = 'active' AND reinstated_at IS NULL AND reinstated_by_user_id IS NULL)
    OR (status = 'reinstated' AND reinstated_at IS NOT NULL AND reinstated_by_user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS developer_project_webhook_suspensions_active_idx
  ON developer_project_webhook_suspensions (developer_project_id, environment)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS developer_project_webhook_suspensions_history_idx
  ON developer_project_webhook_suspensions (developer_project_id, environment, suspended_at DESC);
