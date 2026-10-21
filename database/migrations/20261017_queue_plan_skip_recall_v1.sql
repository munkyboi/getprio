BEGIN;
ALTER TABLE queue_stage_attempts DROP CONSTRAINT queue_stage_attempts_state_check;
ALTER TABLE queue_stage_attempts ADD CONSTRAINT queue_stage_attempts_state_check CHECK(state IN('pending','waiting','called','in_service','paused','completed','interrupted','superseded','skipped'));
ALTER TABLE queue_stage_attempts ADD COLUMN skipped_at TIMESTAMPTZ, ADD COLUMN skipped_reason TEXT, ADD COLUMN skipped_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE queue_stage_attempts ADD CONSTRAINT queue_skipped_stage_metadata CHECK(state<>'skipped' OR(started_at IS NULL AND ended_at IS NOT NULL AND skipped_at IS NOT NULL AND skipped_reason IS NOT NULL AND skipped_at=ended_at AND length(btrim(skipped_reason)) BETWEEN 1 AND 500 AND skipped_by_user_id IS NOT NULL));
DO $$ DECLARE entry RECORD; BEGIN
 FOR entry IN SELECT conname FROM pg_constraint WHERE conrelid='queue_child_attempts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%state%'
 LOOP EXECUTE format('ALTER TABLE queue_child_attempts DROP CONSTRAINT %I',entry.conname); END LOOP;
END $$;
ALTER TABLE queue_child_attempts ADD CONSTRAINT queue_child_attempts_state_check CHECK(state IN('pending','waiting','protected','in_service','completed','interrupted','superseded','skipped'));
ALTER TABLE queue_child_attempts ADD CONSTRAINT queue_child_attempt_time_shape CHECK(
 (state IN('pending','waiting','protected') AND started_at IS NULL AND ended_at IS NULL)
 OR(state='in_service' AND started_at IS NOT NULL AND ended_at IS NULL)
 OR(state IN('completed','interrupted') AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at>=started_at)
 OR(state='superseded' AND started_at IS NULL)
 OR(state='skipped' AND started_at IS NULL AND ended_at IS NOT NULL));
ALTER TABLE queue_reservation_groups DROP CONSTRAINT queue_reservation_groups_state_check;
ALTER TABLE queue_reservation_groups ADD CONSTRAINT queue_reservation_groups_state_check CHECK(state IN('protected','converted','expired','cancelled','skipped'));
CREATE OR REPLACE FUNCTION protect_queue_child_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','revision','is_current','started_at','ended_at','resource_member_key']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','revision','is_current','started_at','ended_at','resource_member_key']) THEN
  RAISE EXCEPTION 'Child execution identity and captured demand are immutable.' USING ERRCODE='23514',CONSTRAINT='queue_child_immutable_identity';
 END IF;
 IF OLD.state IN('completed','interrupted','superseded','skipped') AND
   (NEW.state IS DISTINCT FROM OLD.state OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
    OR(OLD.state='completed' AND NEW.is_current IS DISTINCT FROM OLD.is_current)) THEN
  RAISE EXCEPTION 'Recorded child outcomes cannot be rewritten.' USING ERRCODE='23514',CONSTRAINT='queue_child_immutable_outcome';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION protect_queue_skipped_stage_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state='skipped' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
  RAISE EXCEPTION 'Recorded skipped stage attempts cannot be rewritten.' USING ERRCODE='23514',CONSTRAINT='queue_skipped_stage_immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER queue_skipped_stage_history_guard BEFORE UPDATE ON queue_stage_attempts FOR EACH ROW EXECUTE FUNCTION protect_queue_skipped_stage_history();
CREATE FUNCTION protect_queue_skipped_group_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state='skipped' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
  RAISE EXCEPTION 'Recorded skipped reservation groups cannot be rewritten.' USING ERRCODE='23514',CONSTRAINT='queue_skipped_group_immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER queue_skipped_group_history_guard BEFORE UPDATE ON queue_reservation_groups FOR EACH ROW EXECUTE FUNCTION protect_queue_skipped_group_history();
COMMIT;
