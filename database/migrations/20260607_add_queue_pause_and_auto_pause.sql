ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_pause_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_pause_threshold INTEGER;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_resume_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auto_resume_vacancy_percent INTEGER;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_auto_pause_threshold_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_auto_pause_threshold_check
  CHECK (auto_pause_threshold IS NULL OR auto_pause_threshold BETWEEN 1 AND 500);

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_auto_resume_vacancy_percent_check;

ALTER TABLE tenants
  ADD CONSTRAINT tenants_auto_resume_vacancy_percent_check
  CHECK (auto_resume_vacancy_percent IS NULL OR auto_resume_vacancy_percent BETWEEN 5 AND 50);

CREATE TABLE IF NOT EXISTS queue_day_pauses (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  queue_date_key TEXT NOT NULL,
  pause_reason TEXT,
  pause_mode TEXT NOT NULL DEFAULT 'manual' CHECK (pause_mode IN ('manual', 'auto_threshold')),
  paused_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resumed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paused_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS queue_day_pauses_active_scope_idx
  ON queue_day_pauses (tenant_id, location_id, queue_date_key)
  WHERE resumed_at IS NULL;

CREATE INDEX IF NOT EXISTS queue_day_pauses_scope_created_idx
  ON queue_day_pauses (tenant_id, location_id, queue_date_key, created_at DESC);
