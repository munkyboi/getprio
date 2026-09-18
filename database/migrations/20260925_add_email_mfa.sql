ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE auth_mfa_challenges
  ADD COLUMN IF NOT EXISTS code_hash TEXT;

ALTER TABLE auth_mfa_challenges
  DROP CONSTRAINT IF EXISTS auth_mfa_challenges_challenge_type_check;

ALTER TABLE auth_mfa_challenges
  ADD CONSTRAINT auth_mfa_challenges_challenge_type_check
  CHECK (challenge_type IN ('login', 'email_login', 'step_up', 'recovery'));

CREATE INDEX IF NOT EXISTS auth_mfa_challenges_user_active_idx
  ON auth_mfa_challenges (user_id, challenge_type, expires_at)
  WHERE used_at IS NULL;
