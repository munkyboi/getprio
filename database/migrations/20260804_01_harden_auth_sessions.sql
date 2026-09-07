ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS previous_refresh_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS primary_authenticated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS absolute_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inactivity_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMPTZ;

UPDATE auth_sessions
SET
  primary_authenticated_at = COALESCE(primary_authenticated_at, created_at),
  absolute_expires_at = COALESCE(absolute_expires_at, expires_at),
  inactivity_expires_at = COALESCE(inactivity_expires_at, LEAST(expires_at, last_seen_at + INTERVAL '7 days'))
WHERE primary_authenticated_at IS NULL
   OR absolute_expires_at IS NULL
   OR inactivity_expires_at IS NULL;

ALTER TABLE auth_sessions
  ALTER COLUMN primary_authenticated_at SET DEFAULT NOW(),
  ALTER COLUMN primary_authenticated_at SET NOT NULL,
  ALTER COLUMN absolute_expires_at SET NOT NULL,
  ALTER COLUMN inactivity_expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_previous_refresh_hash_idx
  ON auth_sessions (previous_refresh_token_hash)
  WHERE previous_refresh_token_hash IS NOT NULL;
