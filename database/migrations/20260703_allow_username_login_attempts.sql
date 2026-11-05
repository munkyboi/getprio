ALTER TABLE auth_login_attempts
  DROP CONSTRAINT IF EXISTS auth_login_attempts_identifier_type_check;

ALTER TABLE auth_login_attempts
  ADD CONSTRAINT auth_login_attempts_identifier_type_check
  CHECK (identifier_type IN ('email', 'username'));
