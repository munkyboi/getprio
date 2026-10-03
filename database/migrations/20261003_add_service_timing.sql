BEGIN;

ALTER TABLE store_locations ADD COLUMN service_timing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets
  ADD COLUMN service_started_at TIMESTAMPTZ,
  ADD COLUMN service_ended_at TIMESTAMPTZ,
  ADD COLUMN service_outcome TEXT,
  ADD COLUMN service_started_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN service_ended_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT tickets_service_timing_check CHECK (
    (service_started_at IS NULL AND service_ended_at IS NULL AND service_outcome IS NULL)
    OR (service_started_at IS NOT NULL AND service_ended_at IS NULL AND service_outcome IS NULL)
    OR (service_started_at IS NOT NULL AND service_ended_at >= service_started_at
      AND service_outcome IS NOT NULL AND service_outcome IN ('completed', 'interrupted'))
  );
CREATE INDEX tickets_unfinished_service_idx ON tickets (tenant_id, location_id, service_started_at)
  WHERE service_started_at IS NOT NULL AND service_ended_at IS NULL;
-- Never infer actual service from existing called/served history.
COMMIT;
