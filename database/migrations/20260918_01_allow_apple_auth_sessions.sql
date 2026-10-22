ALTER TABLE auth_sessions
  DROP CONSTRAINT IF EXISTS auth_sessions_auth_method_check;

ALTER TABLE auth_sessions
  ADD CONSTRAINT auth_sessions_auth_method_check
  CHECK (auth_method IN ('password', 'google', 'facebook', 'apple'));
