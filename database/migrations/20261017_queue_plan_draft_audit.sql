BEGIN;
ALTER TABLE queue_plan_events ADD COLUMN actor_role TEXT;
ALTER TABLE queue_plan_events ADD COLUMN old_snapshot JSONB;
COMMIT;
