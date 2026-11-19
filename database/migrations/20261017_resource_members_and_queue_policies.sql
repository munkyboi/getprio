BEGIN;
CREATE TABLE resource_pool_members (
  id UUID PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  pool_id BIGINT NOT NULL,
  name TEXT NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
  revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,pool_id,tenant_id,location_id),
  FOREIGN KEY(pool_id,tenant_id,location_id) REFERENCES location_resource_pools(id,tenant_id,location_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX resource_pool_member_name_idx ON resource_pool_members(tenant_id,location_id,pool_id,lower(btrim(name)));
CREATE TABLE resource_pool_member_versions (
  member_id UUID NOT NULL,
  pool_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  revision BIGINT NOT NULL CHECK(revision>0),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(member_id,revision),
  FOREIGN KEY(member_id,pool_id,tenant_id,location_id) REFERENCES resource_pool_members(id,pool_id,tenant_id,location_id) ON DELETE RESTRICT
);
ALTER TABLE resource_pool_members ADD FOREIGN KEY(id,revision) REFERENCES resource_pool_member_versions(member_id,revision) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE resource_ledger_reservations ADD COLUMN resource_member_id UUID;
ALTER TABLE resource_ledger_reservations ADD FOREIGN KEY(resource_member_id,pool_id,tenant_id,location_id)
  REFERENCES resource_pool_members(id,pool_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_ledger_reservations ADD CHECK(resource_member_id IS NULL OR units=1);
CREATE UNIQUE INDEX resource_reservation_named_member_idx ON resource_ledger_reservations(resource_member_id) WHERE resource_member_id IS NOT NULL AND state='protected';
ALTER TABLE resource_allocations ADD COLUMN resource_member_id UUID;
ALTER TABLE resource_allocations ADD FOREIGN KEY(resource_member_id,pool_id,tenant_id,location_id)
  REFERENCES resource_pool_members(id,pool_id,tenant_id,location_id) ON DELETE RESTRICT;
ALTER TABLE resource_allocations ADD CHECK(resource_member_id IS NULL OR units=1);
CREATE UNIQUE INDEX resource_allocation_named_member_active_idx ON resource_allocations(resource_member_id) WHERE resource_member_id IS NOT NULL AND released_at IS NULL;

CREATE TABLE queue_service_policies (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  service_id BIGINT NOT NULL,
  revision BIGINT NOT NULL CHECK(revision>0),
  selection_mode TEXT NOT NULL CHECK(selection_mode IN('named','pooled')),
  duration_options JSONB NOT NULL CHECK(jsonb_typeof(duration_options)='array' AND jsonb_array_length(duration_options) BETWEEN 1 AND 96),
  quote_mode TEXT NOT NULL DEFAULT 'unavailable' CHECK(quote_mode='unavailable'),
  extra_service_ids JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(extra_service_ids)='array' AND jsonb_array_length(extra_service_ids)<=20),
  PRIMARY KEY(tenant_id,location_id,service_id),
  FOREIGN KEY(service_id,tenant_id) REFERENCES vendor_services(id,tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY(location_id,service_id) REFERENCES location_services(location_id,service_id) ON DELETE RESTRICT,
  FOREIGN KEY(location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT
);
CREATE TABLE queue_service_policy_versions (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  service_id BIGINT NOT NULL,
  revision BIGINT NOT NULL CHECK(revision>0),
  snapshot JSONB NOT NULL,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,location_id,service_id,revision),
  FOREIGN KEY(tenant_id,location_id,service_id) REFERENCES queue_service_policies(tenant_id,location_id,service_id) ON DELETE RESTRICT
);
ALTER TABLE queue_service_policies ADD FOREIGN KEY(tenant_id,location_id,service_id,revision)
  REFERENCES queue_service_policy_versions(tenant_id,location_id,service_id,revision) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION assert_named_pool_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed INTEGER; active_count INTEGER;
BEGIN
  IF TG_TABLE_NAME='resource_pool_members' THEN
    SELECT capacity INTO allowed FROM location_resource_pools
      WHERE id=NEW.pool_id AND tenant_id=NEW.tenant_id AND location_id=NEW.location_id FOR NO KEY UPDATE;
    SELECT count(*) INTO active_count FROM resource_pool_members
      WHERE pool_id=NEW.pool_id AND tenant_id=NEW.tenant_id AND location_id=NEW.location_id AND is_active=TRUE;
  ELSE
    allowed:=NEW.capacity;
    SELECT count(*) INTO active_count FROM resource_pool_members
      WHERE pool_id=NEW.id AND tenant_id=NEW.tenant_id AND location_id=NEW.location_id AND is_active=TRUE;
  END IF;
  IF active_count>allowed THEN
    RAISE EXCEPTION 'Pool capacity cannot be below its active named members.'
      USING ERRCODE='23514',CONSTRAINT='resource_pool_active_member_capacity';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER resource_member_capacity_guard AFTER INSERT OR UPDATE ON resource_pool_members
  FOR EACH ROW EXECUTE FUNCTION assert_named_pool_capacity();
CREATE TRIGGER resource_pool_member_capacity_guard AFTER UPDATE OF capacity ON location_resource_pools
  FOR EACH ROW EXECUTE FUNCTION assert_named_pool_capacity();
COMMIT;
