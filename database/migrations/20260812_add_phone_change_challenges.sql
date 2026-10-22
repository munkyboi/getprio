CREATE TABLE IF NOT EXISTS account_phone_change_challenges (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_expires_at TIMESTAMPTZ NOT NULL,
  code_attempts INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_phone_change_challenges_user_created_idx
  ON account_phone_change_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_phone_change_challenges_active_idx
  ON account_phone_change_challenges (user_id, used_at, code_expires_at);

DROP TRIGGER IF EXISTS set_account_phone_change_challenges_updated_at ON account_phone_change_challenges;

CREATE TRIGGER set_account_phone_change_challenges_updated_at
BEFORE UPDATE ON account_phone_change_challenges
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
