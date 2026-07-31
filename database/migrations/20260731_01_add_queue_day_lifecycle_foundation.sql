BEGIN;

ALTER TABLE store_locations
  ADD COLUMN IF NOT EXISTS queue_lifecycle_mode TEXT NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'store_locations'::regclass
      AND conname = 'store_locations_queue_lifecycle_mode_check'
  ) THEN
    ALTER TABLE store_locations
      ADD CONSTRAINT store_locations_queue_lifecycle_mode_check
      CHECK (queue_lifecycle_mode IN ('legacy', 'shadow', 'enforced'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS queue_days (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'unopened'
    CHECK (state IN ('unopened', 'open', 'closed')),
  intake_mode TEXT
    CHECK (intake_mode IS NULL OR intake_mode IN ('accepting', 'paused')),
  timezone_snapshot TEXT,
  effective_opens_at TIMESTAMPTZ,
  effective_closes_at TIMESTAMPTZ,
  initial_closes_at TIMESTAMPTZ,
  current_closes_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  opened_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  close_reason TEXT,
  close_source TEXT,
  closure_note TEXT,
  last_reopened_at TIMESTAMPTZ,
  last_reopened_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reopen_reason TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  deadline_version INTEGER NOT NULL DEFAULT 1 CHECK (deadline_version > 0),
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence > 0),
  last_reconciled_at TIMESTAMPTZ,
  reconciliation_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (reconciliation_attempt_count >= 0),
  last_reconciliation_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, location_id, business_date),
  CHECK (
    (state = 'open' AND intake_mode IS NOT NULL)
    OR (state <> 'open' AND intake_mode IS NULL)
  ),
  CHECK (
    current_closes_at IS NULL
    OR initial_closes_at IS NULL
    OR current_closes_at >= initial_closes_at
  )
);

CREATE INDEX IF NOT EXISTS queue_days_due_work_idx
  ON queue_days (current_closes_at, id)
  WHERE state = 'open';

CREATE INDEX IF NOT EXISTS queue_days_location_history_idx
  ON queue_days (tenant_id, location_id, business_date DESC);

CREATE TABLE IF NOT EXISTS queue_day_extensions (
  id BIGSERIAL PRIMARY KEY,
  queue_day_id BIGINT NOT NULL REFERENCES queue_days(id) ON DELETE CASCADE,
  previous_closes_at TIMESTAMPTZ NOT NULL,
  new_closes_at TIMESTAMPTZ NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 30 CHECK (minutes = 30),
  deadline_version INTEGER NOT NULL CHECK (deadline_version > 1),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  reason_code TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (queue_day_id, deadline_version)
);

ALTER TABLE queue_day_closures
  ADD COLUMN IF NOT EXISTS queue_day_id BIGINT REFERENCES queue_days(id) ON DELETE SET NULL;

ALTER TABLE queue_day_pauses
  ADD COLUMN IF NOT EXISTS queue_day_id BIGINT REFERENCES queue_days(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS queue_day_closures_queue_day_idx
  ON queue_day_closures (queue_day_id)
  WHERE queue_day_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS queue_day_pauses_queue_day_idx
  ON queue_day_pauses (queue_day_id)
  WHERE queue_day_id IS NOT NULL;

COMMIT;
