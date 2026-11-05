BEGIN;
ALTER TABLE ticket_service_plans DROP CONSTRAINT ticket_service_plans_contract_version_check;
ALTER TABLE ticket_service_plans ADD CHECK(contract_version IN(1,2,3));
ALTER TABLE ticket_service_plans ADD COLUMN service_selections JSONB;
ALTER TABLE queue_plan_versions ADD COLUMN service_selections JSONB;

CREATE TABLE queue_selection_definitions (
  ticket_id BIGINT NOT NULL,
  plan_revision BIGINT NOT NULL CHECK(plan_revision>0),
  selection_id TEXT NOT NULL CHECK(selection_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  kind TEXT NOT NULL CHECK(kind IN('service','resource','extra')),
  parent_selection_id TEXT,
  parent_kind TEXT,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  stage_id UUID NOT NULL,
  service_id BIGINT NOT NULL,
  pool_id BIGINT,
  units INTEGER,
  duration_minutes INTEGER,
  resource_member_id UUID,
  resource_member_revision BIGINT,
  resource_member_key UUID GENERATED ALWAYS AS(COALESCE(resource_member_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  snapshot JSONB NOT NULL,
  PRIMARY KEY(ticket_id,plan_revision,selection_id),
  UNIQUE(ticket_id,plan_revision,selection_id,tenant_id,location_id),
  UNIQUE(ticket_id,plan_revision,selection_id,kind,stage_id,tenant_id,location_id),
  UNIQUE(ticket_id,plan_revision,selection_id,kind,stage_id,pool_id,units,duration_minutes,resource_member_key,tenant_id,location_id),
  CHECK((kind='service' AND parent_selection_id IS NULL AND parent_kind IS NULL AND pool_id IS NULL AND units IS NULL AND duration_minutes IS NULL)
    OR(kind='resource' AND parent_selection_id IS NOT NULL AND parent_kind='service' AND pool_id IS NOT NULL AND units IS NOT NULL AND duration_minutes IS NOT NULL AND units BETWEEN 1 AND 100 AND duration_minutes BETWEEN 5 AND 480)
    OR(kind='extra' AND parent_selection_id IS NOT NULL AND parent_kind='resource' AND pool_id IS NOT NULL AND units IS NOT NULL AND duration_minutes IS NOT NULL AND units BETWEEN 1 AND 100 AND duration_minutes BETWEEN 5 AND 480 AND resource_member_id IS NULL)),
  CHECK((resource_member_id IS NULL AND resource_member_revision IS NULL) OR(resource_member_id IS NOT NULL AND units=1 AND resource_member_revision IS NOT NULL)),
  FOREIGN KEY(ticket_id,plan_revision,tenant_id,location_id) REFERENCES queue_plan_versions(ticket_id,revision,tenant_id,location_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(ticket_id,plan_revision,parent_selection_id,parent_kind,stage_id,tenant_id,location_id)
    REFERENCES queue_selection_definitions(ticket_id,plan_revision,selection_id,kind,stage_id,tenant_id,location_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(service_id,tenant_id) REFERENCES vendor_services(id,tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY(pool_id,tenant_id,location_id) REFERENCES location_resource_pools(id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(resource_member_id,pool_id,tenant_id,location_id) REFERENCES resource_pool_members(id,pool_id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(resource_member_id,resource_member_revision) REFERENCES resource_pool_member_versions(member_id,revision) ON DELETE RESTRICT
);
CREATE TABLE queue_child_attempts (
  id UUID PRIMARY KEY,
  ticket_id BIGINT NOT NULL,
  plan_revision BIGINT NOT NULL,
  selection_id TEXT NOT NULL,
  selection_kind TEXT NOT NULL CHECK(selection_kind IN('resource','extra')),
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  stage_id UUID NOT NULL,
  stage_attempt_id UUID NOT NULL,
  parent_child_attempt_id UUID,
  parent_executed_selection_id TEXT,
  pool_id BIGINT NOT NULL,
  units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 100),
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 480),
  resource_member_id UUID,
  resource_member_key UUID GENERATED ALWAYS AS(COALESCE(resource_member_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  attempt BIGINT NOT NULL CHECK(attempt>0),
  revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  state TEXT NOT NULL CHECK(state IN('pending','waiting','protected','in_service','completed','interrupted','superseded')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  satisfied_dependencies JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(satisfied_dependencies)='array'),
  UNIQUE(ticket_id,plan_revision,selection_id,attempt),
  UNIQUE(id,ticket_id,plan_revision,selection_id,stage_attempt_id,tenant_id,location_id),
  UNIQUE(id,ticket_id,plan_revision,stage_attempt_id,selection_id,pool_id,units,resource_member_key,tenant_id,location_id),
  CHECK((selection_kind='resource' AND parent_child_attempt_id IS NULL AND parent_executed_selection_id IS NULL)
    OR(selection_kind='extra' AND parent_child_attempt_id IS NOT NULL AND parent_executed_selection_id IS NOT NULL)),
  CHECK((state IN('pending','waiting','protected') AND started_at IS NULL AND ended_at IS NULL)
    OR(state='in_service' AND started_at IS NOT NULL AND ended_at IS NULL)
    OR(state IN('completed','interrupted') AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at>=started_at)
    OR(state='superseded' AND started_at IS NULL)),
  FOREIGN KEY(ticket_id,plan_revision,selection_id,selection_kind,stage_id,pool_id,units,duration_minutes,resource_member_key,tenant_id,location_id)
    REFERENCES queue_selection_definitions(ticket_id,plan_revision,selection_id,kind,stage_id,pool_id,units,duration_minutes,resource_member_key,tenant_id,location_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(stage_attempt_id,ticket_id,stage_id,tenant_id,location_id) REFERENCES queue_stage_attempts(id,ticket_id,stage_id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(parent_child_attempt_id,ticket_id,plan_revision,parent_executed_selection_id,stage_attempt_id,tenant_id,location_id)
    REFERENCES queue_child_attempts(id,ticket_id,plan_revision,selection_id,stage_attempt_id,tenant_id,location_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX queue_child_current_idx ON queue_child_attempts(ticket_id,plan_revision,selection_id) WHERE is_current=TRUE;
ALTER TABLE queue_selection_definitions ADD UNIQUE(ticket_id,plan_revision,selection_id,kind,parent_selection_id,stage_id,tenant_id,location_id);
ALTER TABLE queue_child_attempts ADD FOREIGN KEY(ticket_id,plan_revision,selection_id,selection_kind,parent_executed_selection_id,stage_id,tenant_id,location_id)
  REFERENCES queue_selection_definitions(ticket_id,plan_revision,selection_id,kind,parent_selection_id,stage_id,tenant_id,location_id) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION protect_queue_child_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['state','revision','is_current','started_at','ended_at','resource_member_key']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','revision','is_current','started_at','ended_at','resource_member_key']) THEN
    RAISE EXCEPTION 'Child execution identity and captured demand are immutable.' USING ERRCODE='23514',CONSTRAINT='queue_child_immutable_identity';
  END IF;
  IF OLD.state IN('completed','interrupted','superseded') AND
    (NEW.state IS DISTINCT FROM OLD.state OR NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
     OR(OLD.state='completed' AND NEW.is_current IS DISTINCT FROM OLD.is_current)) THEN
    RAISE EXCEPTION 'Recorded child outcomes cannot be rewritten.' USING ERRCODE='23514',CONSTRAINT='queue_child_immutable_outcome';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER queue_child_history_guard BEFORE UPDATE ON queue_child_attempts FOR EACH ROW EXECUTE FUNCTION protect_queue_child_history();
CREATE FUNCTION validate_queue_child_dependency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_attempt queue_child_attempts%ROWTYPE;
BEGIN
  IF NEW.selection_kind='extra' THEN
    SELECT * INTO parent_attempt FROM queue_child_attempts WHERE id=NEW.parent_child_attempt_id;
    IF NEW.duration_minutes>parent_attempt.duration_minutes OR(NEW.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM parent_attempt.started_at) THEN
      RAISE EXCEPTION 'Extras must share their parent court start and cannot outlast its requested duration.' USING ERRCODE='23514',CONSTRAINT='queue_extra_parent_schedule';
    END IF;
  ELSIF NEW.state='completed' AND NEW.is_current THEN
    IF EXISTS(SELECT 1 FROM queue_selection_definitions d LEFT JOIN queue_child_attempts c
      ON(c.ticket_id,c.plan_revision,c.selection_id,c.tenant_id,c.location_id)=(d.ticket_id,d.plan_revision,d.selection_id,d.tenant_id,d.location_id) AND c.is_current=TRUE
      WHERE d.ticket_id=NEW.ticket_id AND d.plan_revision=NEW.plan_revision AND d.tenant_id=NEW.tenant_id AND d.location_id=NEW.location_id
        AND d.kind='extra' AND d.parent_selection_id=NEW.selection_id AND(c.id IS NULL OR c.state<>'completed'
          OR(c.parent_child_attempt_id<>NEW.id AND NOT (NEW.satisfied_dependencies ? c.id::text)))) THEN
      RAISE EXCEPTION 'Complete required extras before completing their parent court.' USING ERRCODE='23514',CONSTRAINT='queue_parent_required_children';
    END IF;
  ELSIF NEW.state='interrupted' AND NEW.is_current THEN
    IF EXISTS(SELECT 1 FROM queue_child_attempts c WHERE c.parent_child_attempt_id=NEW.id AND c.is_current=TRUE AND c.state IN('protected','in_service')) THEN
      RAISE EXCEPTION 'Explicitly resolve unfinished extras with their court interruption.' USING ERRCODE='23514',CONSTRAINT='queue_parent_required_children';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER queue_child_dependency_guard AFTER INSERT OR UPDATE ON queue_child_attempts
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_queue_child_dependency();

ALTER TABLE queue_reservation_groups ADD COLUMN execution_model TEXT NOT NULL DEFAULT 'flat' CHECK(execution_model IN('flat','nested'));
ALTER TABLE queue_reservation_groups ADD UNIQUE(id,ticket_id,plan_revision,stage_attempt_id,tenant_id,location_id);
DROP INDEX queue_reservation_group_live_idx;
CREATE UNIQUE INDEX queue_reservation_group_live_idx ON queue_reservation_groups(ticket_id,stage_attempt_id)
  WHERE execution_model='flat' AND state IN('protected','converted');
ALTER TABLE queue_allocation_groups ADD COLUMN resolution_state TEXT NOT NULL DEFAULT 'open' CHECK(resolution_state IN('open','partial','completed','interrupted','mixed'));
ALTER TABLE queue_allocation_groups ADD COLUMN resolution_summary JSONB;
ALTER TABLE queue_allocation_groups ADD UNIQUE(id,ticket_id,stage_attempt_id,tenant_id,location_id);

ALTER TABLE resource_ledger_reservations ADD COLUMN child_attempt_id UUID,ADD COLUMN child_plan_revision BIGINT,ADD COLUMN child_stage_attempt_id UUID;
ALTER TABLE resource_ledger_reservations ADD COLUMN resource_member_key UUID GENERATED ALWAYS AS(COALESCE(resource_member_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED;
ALTER TABLE resource_ledger_reservations ADD CHECK((child_attempt_id IS NULL AND child_plan_revision IS NULL AND child_stage_attempt_id IS NULL)
  OR(child_attempt_id IS NOT NULL AND child_plan_revision IS NOT NULL AND child_stage_attempt_id IS NOT NULL AND group_id IS NOT NULL AND line_id IS NOT NULL));
ALTER TABLE resource_ledger_reservations ADD FOREIGN KEY(group_id,ticket_id,child_plan_revision,child_stage_attempt_id,tenant_id,location_id)
  REFERENCES queue_reservation_groups(id,ticket_id,plan_revision,stage_attempt_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_ledger_reservations ADD FOREIGN KEY(child_attempt_id,ticket_id,child_plan_revision,child_stage_attempt_id,line_id,pool_id,units,resource_member_key,tenant_id,location_id)
  REFERENCES queue_child_attempts(id,ticket_id,plan_revision,stage_attempt_id,selection_id,pool_id,units,resource_member_key,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_ledger_reservations ADD UNIQUE(id,child_attempt_id,child_plan_revision,child_stage_attempt_id,pool_id,units,resource_member_key,line_id,ticket_id,tenant_id,location_id);
CREATE UNIQUE INDEX resource_reservation_child_attempt_idx ON resource_ledger_reservations(child_attempt_id) WHERE child_attempt_id IS NOT NULL AND state IN('protected','converted');

ALTER TABLE resource_allocations ADD COLUMN child_attempt_id UUID,ADD COLUMN child_plan_revision BIGINT,ADD COLUMN child_stage_attempt_id UUID;
ALTER TABLE resource_allocations ADD COLUMN resource_member_key UUID GENERATED ALWAYS AS(COALESCE(resource_member_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED;
ALTER TABLE resource_allocations ADD CHECK((child_attempt_id IS NULL AND child_plan_revision IS NULL AND child_stage_attempt_id IS NULL)
  OR(child_attempt_id IS NOT NULL AND child_plan_revision IS NOT NULL AND child_stage_attempt_id IS NOT NULL AND group_id IS NOT NULL AND line_id IS NOT NULL AND reservation_id IS NOT NULL));
ALTER TABLE resource_allocations ADD FOREIGN KEY(group_id,ticket_id,child_stage_attempt_id,tenant_id,location_id)
  REFERENCES queue_allocation_groups(id,ticket_id,stage_attempt_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_allocations ADD FOREIGN KEY(reservation_id,child_attempt_id,child_plan_revision,child_stage_attempt_id,pool_id,units,resource_member_key,line_id,ticket_id,tenant_id,location_id)
  REFERENCES resource_ledger_reservations(id,child_attempt_id,child_plan_revision,child_stage_attempt_id,pool_id,units,resource_member_key,line_id,ticket_id,tenant_id,location_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX resource_allocation_child_attempt_idx ON resource_allocations(child_attempt_id) WHERE child_attempt_id IS NOT NULL;
COMMIT;
