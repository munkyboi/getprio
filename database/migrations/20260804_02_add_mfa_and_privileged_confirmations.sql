CREATE TABLE IF NOT EXISTS auth_mfa_factors (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type TEXT NOT NULL CHECK (factor_type IN ('totp', 'webauthn')),
  label TEXT NOT NULL DEFAULT 'Authenticator',
  secret_ciphertext TEXT,
  secret_iv TEXT,
  secret_auth_tag TEXT,
  public_key JSONB,
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_mfa_factors_active_type_idx
  ON auth_mfa_factors (user_id, factor_type)
  WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS auth_mfa_factors_pending_type_idx
  ON auth_mfa_factors (user_id, factor_type)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS auth_mfa_recovery_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, code_hash)
);

CREATE TABLE IF NOT EXISTS auth_mfa_challenges (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('login', 'step_up', 'recovery')),
  primary_authenticated_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS privileged_transaction_confirmations (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id BIGINT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  preview_revision TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS privileged_confirmations_expiry_idx
  ON privileged_transaction_confirmations (expires_at)
  WHERE used_at IS NULL;
