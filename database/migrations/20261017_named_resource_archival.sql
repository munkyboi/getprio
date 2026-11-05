BEGIN;
-- No archive intent/date is inferred from the historical maintenance flag.
ALTER TABLE resource_pool_members ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE resource_pool_members ADD COLUMN archived_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE resource_pool_members ADD CHECK((archived_at IS NULL)=(archived_by_user_id IS NULL));
ALTER TABLE resource_pool_member_versions ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE resource_pool_member_versions ADD COLUMN archived_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE resource_pool_member_versions ADD CHECK((archived_at IS NULL)=(archived_by_user_id IS NULL));
CREATE OR REPLACE FUNCTION assert_named_pool_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed INTEGER; active_count INTEGER;
BEGIN
  IF TG_TABLE_NAME='resource_pool_members' THEN
    SELECT capacity INTO allowed FROM location_resource_pools
      WHERE id=NEW.pool_id AND tenant_id=NEW.tenant_id AND location_id=NEW.location_id FOR NO KEY UPDATE;
    SELECT count(*) INTO active_count FROM resource_pool_members
      WHERE pool_id=NEW.pool_id AND tenant_id=NEW.tenant_id AND location_id=NEW.location_id
        AND is_active=TRUE AND archived_at IS NULL;
  ELSE
    allowed:=NEW.capacity;
    SELECT count(*) INTO active_count FROM resource_pool_members
      WHERE pool_id=NEW.id AND tenant_id=NEW.tenant_id AND location_id=NEW.location_id
        AND is_active=TRUE AND archived_at IS NULL;
  END IF;
  IF active_count>allowed THEN
    RAISE EXCEPTION 'Active named members exceed pool capacity' USING ERRCODE='23514',CONSTRAINT='resource_pool_active_member_capacity';
  END IF;
  RETURN NEW;
END $$;
COMMIT;
