-- Sequential station execution, retaining all pre-existing stage attempts.
BEGIN;
ALTER TABLE ticket_service_plans ADD COLUMN IF NOT EXISTS journey_cancelled_at TIMESTAMPTZ;
ALTER TABLE ticket_service_plans ADD COLUMN IF NOT EXISTS journey_cancelled_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE ticket_service_plans ADD COLUMN IF NOT EXISTS journey_cancellation_reason TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS queue_execution_type TEXT CHECK(queue_execution_type IN ('simple','resource','workflow'));
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS arrival_contract_version SMALLINT NOT NULL DEFAULT 0 CHECK(arrival_contract_version IN (0,1));
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS resource_requirement JSONB NOT NULL DEFAULT '{"kind":"pool"}'::jsonb;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS readiness_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS ready_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS arrived_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS station_waiting_at TIMESTAMPTZ;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS station_queue_sequence BIGINT;
ALTER TABLE queue_stage_attempts ADD COLUMN IF NOT EXISTS station_queue_date_key TEXT;
ALTER TABLE queue_stage_attempts DROP CONSTRAINT IF EXISTS queue_stage_attempts_state_check;
ALTER TABLE queue_stage_attempts ADD CONSTRAINT queue_stage_attempts_state_check CHECK(state IN('pending','awaiting_readiness','awaiting_arrival','waiting','called','in_service','paused','completed','interrupted','superseded','skipped','cancelled'));
ALTER TABLE queue_stage_attempts ADD CONSTRAINT queue_stage_requirement_kind CHECK(resource_requirement->>'kind' IN ('none','pool'));
CREATE UNIQUE INDEX queue_stage_station_sequence ON queue_stage_attempts(station_id,station_queue_sequence) WHERE station_id IS NOT NULL AND station_queue_sequence IS NOT NULL;
CREATE UNIQUE INDEX queue_stage_one_physical_stage ON queue_stage_attempts(ticket_id) WHERE state IN ('called','in_service','paused');
-- Old attempts are not rewritten or reinterpreted. New commands enforce one
-- physical stage under the existing location-first lock, including old work.
COMMIT;
