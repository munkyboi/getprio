BEGIN;

DROP INDEX IF EXISTS auth_mfa_factors_active_type_idx;

CREATE UNIQUE INDEX IF NOT EXISTS auth_mfa_factors_active_type_idx
  ON auth_mfa_factors (user_id, factor_type)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS auth_mfa_factors_pending_type_idx
  ON auth_mfa_factors (user_id, factor_type)
  WHERE status = 'pending';

COMMIT;
