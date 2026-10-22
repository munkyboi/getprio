BEGIN;
ALTER TABLE service_counters ADD CONSTRAINT service_counter_station_scope_key UNIQUE(id,tenant_id,location_id);
CREATE TABLE queue_stations (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  name TEXT NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(id,tenant_id,location_id),
  FOREIGN KEY(location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT
);
CREATE TABLE queue_station_counters (
  station_id UUID NOT NULL,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  counter_id BIGINT NOT NULL,
  PRIMARY KEY(station_id,counter_id),
  FOREIGN KEY(station_id,tenant_id,location_id) REFERENCES queue_stations(id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(counter_id,tenant_id,location_id) REFERENCES service_counters(id,tenant_id,location_id) ON DELETE RESTRICT
);
CREATE TABLE queue_workflow_versions (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  revision BIGINT NOT NULL CHECK(revision>0),
  mode TEXT NOT NULL CHECK(mode IN('linear','multi_station')),
  stations JSONB NOT NULL CHECK(jsonb_typeof(stations)='array'),
  stages JSONB NOT NULL CHECK(jsonb_typeof(stages)='array'),
  actor_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,location_id,revision),
  UNIQUE(tenant_id,location_id,revision,mode),
  FOREIGN KEY(location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT
);
CREATE TABLE queue_workflow_configurations (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  revision BIGINT NOT NULL,
  PRIMARY KEY(tenant_id,location_id),
  FOREIGN KEY(tenant_id,location_id,revision) REFERENCES queue_workflow_versions(tenant_id,location_id,revision) ON DELETE RESTRICT
);
ALTER TABLE ticket_service_plans ADD COLUMN workflow_configuration_revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE ticket_service_plans ADD COLUMN current_station_id UUID;
ALTER TABLE ticket_service_plans ADD COLUMN current_station_counter_ids JSONB;
ALTER TABLE queue_plan_versions ADD COLUMN workflow_configuration_revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE queue_stage_attempts ADD COLUMN station_id UUID;
ALTER TABLE queue_stage_attempts ADD COLUMN station_snapshot JSONB;
ALTER TABLE queue_stage_attempts ADD COLUMN label TEXT;
ALTER TABLE queue_stage_attempts ADD COLUMN assigned_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE queue_stage_attempts DROP CONSTRAINT queue_stage_attempts_state_check;
ALTER TABLE queue_stage_attempts ADD CHECK(state IN('pending','waiting','called','in_service','paused','completed','interrupted','superseded'));
ALTER TABLE queue_stage_attempts ADD FOREIGN KEY(station_id,tenant_id,location_id) REFERENCES queue_stations(id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE ticket_service_plans ADD FOREIGN KEY(current_station_id,tenant_id,location_id) REFERENCES queue_stations(id,tenant_id,location_id) ON DELETE RESTRICT;
INSERT INTO queue_workflow_versions(tenant_id,location_id,revision,mode,stations,stages,actor_role)
  SELECT tenant_id,id,1,'linear','[]','[]','system_default' FROM store_locations;
INSERT INTO queue_workflow_configurations(tenant_id,location_id,revision) SELECT tenant_id,id,1 FROM store_locations;
ALTER TABLE ticket_service_plans ADD FOREIGN KEY(tenant_id,location_id,workflow_configuration_revision,workflow_mode)
  REFERENCES queue_workflow_versions(tenant_id,location_id,revision,mode) ON DELETE RESTRICT;
ALTER TABLE queue_plan_versions ADD FOREIGN KEY(tenant_id,location_id,workflow_configuration_revision,workflow_mode)
  REFERENCES queue_workflow_versions(tenant_id,location_id,revision,mode) ON DELETE RESTRICT;
ALTER TABLE queue_stage_attempts ADD UNIQUE(id,ticket_id,stage_id,station_id,tenant_id,location_id);
ALTER TABLE ticket_service_plans ADD FOREIGN KEY(stage_attempt_id,ticket_id,stage_id,current_station_id,tenant_id,location_id)
  REFERENCES queue_stage_attempts(id,ticket_id,stage_id,station_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE ticket_service_plans ADD CHECK((workflow_mode='linear' AND current_station_id IS NULL) OR(workflow_mode='multi_station' AND current_station_id IS NOT NULL));
ALTER TABLE queue_stage_attempts ADD CHECK(station_id IS NULL OR(station_snapshot IS NOT NULL AND station_snapshot->>'stationId' IS NOT NULL AND station_snapshot->>'stationId'=station_id::text));
COMMIT;
