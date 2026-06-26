ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
  ON users (LOWER(username))
  WHERE username IS NOT NULL AND username <> '';
