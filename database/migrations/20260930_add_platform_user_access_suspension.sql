ALTER TABLE users
  ADD COLUMN IF NOT EXISTS platform_access_suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_access_suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_platform_access_suspended
  ON users (platform_access_suspended_at)
  WHERE platform_access_suspended_at IS NOT NULL;
