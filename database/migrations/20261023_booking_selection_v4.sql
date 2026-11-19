BEGIN;
-- Additive opt-in contract; existing V1 bookings and global Queue named-member
-- protection indexes are deliberately unchanged.
ALTER TABLE bookings ADD COLUMN selection_contract_version INTEGER NOT NULL DEFAULT 1
  CHECK(selection_contract_version IN (1,4));
ALTER TABLE bookings ADD COLUMN selection_revision BIGINT;
ALTER TABLE bookings ADD COLUMN selection_payment_required BOOLEAN;
ALTER TABLE bookings ADD CHECK ((selection_contract_version=1 AND selection_revision IS NULL)
  OR (selection_contract_version=4 AND selection_revision IS NOT NULL AND selection_revision>0 AND selection_payment_required IS NOT NULL));
CREATE TABLE booking_v4_selection_versions (
  booking_id BIGINT NOT NULL,
  revision BIGINT NOT NULL CHECK(revision>0),
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  scheduled_end_at TIMESTAMPTZ NOT NULL,
  snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(booking_id,revision),
  UNIQUE(booking_id,revision,tenant_id,location_id),
  CHECK(scheduled_end_at>scheduled_start_at),
  FOREIGN KEY(booking_id,tenant_id,location_id) REFERENCES bookings(id,tenant_id,location_id) ON DELETE RESTRICT
);
ALTER TABLE bookings ADD CONSTRAINT booking_v4_current_selection_fkey
  FOREIGN KEY(id,selection_revision,tenant_id,location_id)
  REFERENCES booking_v4_selection_versions(booking_id,revision,tenant_id,location_id)
  DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE booking_v4_selection_leaves (
 booking_id BIGINT NOT NULL,
 selection_revision BIGINT NOT NULL,
 selection_id TEXT NOT NULL CHECK(selection_id ~ '^[A-Za-z0-9_-]{1,80}$'),
 tenant_id BIGINT NOT NULL,
 location_id BIGINT NOT NULL,
 service_id BIGINT NOT NULL,
 pool_id BIGINT NOT NULL,
 resource_member_id UUID,
 resource_member_revision BIGINT,
 resource_member_key UUID GENERATED ALWAYS AS(COALESCE(resource_member_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED,
 units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 100),
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 480),
 starts_at TIMESTAMPTZ NOT NULL,
 ends_at TIMESTAMPTZ NOT NULL,
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 PRIMARY KEY(booking_id,selection_revision,selection_id),
 UNIQUE(booking_id,selection_revision,selection_id,tenant_id,location_id,pool_id,resource_member_key,units,starts_at,ends_at),
 CHECK(ends_at=starts_at+duration_minutes*INTERVAL '1 minute'),
 CHECK((resource_member_id IS NULL AND resource_member_revision IS NULL)
   OR(resource_member_id IS NOT NULL AND resource_member_revision IS NOT NULL AND units=1)),
 FOREIGN KEY(booking_id,selection_revision,tenant_id,location_id)
   REFERENCES booking_v4_selection_versions(booking_id,revision,tenant_id,location_id) ON DELETE RESTRICT,
 FOREIGN KEY(service_id,tenant_id) REFERENCES vendor_services(id,tenant_id) ON DELETE RESTRICT,
 FOREIGN KEY(pool_id,tenant_id,location_id) REFERENCES location_resource_pools(id,tenant_id,location_id) ON DELETE RESTRICT,
 FOREIGN KEY(resource_member_id,pool_id,tenant_id,location_id)
   REFERENCES resource_pool_members(id,pool_id,tenant_id,location_id) ON DELETE RESTRICT,
 FOREIGN KEY(resource_member_id,resource_member_revision) REFERENCES resource_pool_member_versions(member_id,revision) ON DELETE RESTRICT
);
CREATE TABLE booking_v4_reservations (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL,
  selection_revision BIGINT NOT NULL,
  selection_id TEXT NOT NULL CHECK(selection_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  pool_id BIGINT NOT NULL,
  resource_member_id UUID,
  resource_member_key UUID GENERATED ALWAYS AS(COALESCE(resource_member_id,'00000000-0000-0000-0000-000000000000'::uuid)) STORED,
  units INTEGER NOT NULL CHECK(units BETWEEN 1 AND 100),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL DEFAULT 'protected' CHECK(state IN ('protected','converted','released')),
  released_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resolved_at TIMESTAMPTZ,
  CHECK(ends_at>starts_at),
  CHECK(resource_member_id IS NULL OR units=1),
  CHECK((state='released')=(resolved_at IS NOT NULL)),
  CHECK(state<>'released' OR length(btrim(released_reason))>0 AND released_reason IS NOT NULL),
  UNIQUE(booking_id,selection_revision,selection_id),
  FOREIGN KEY(booking_id,selection_revision,selection_id,tenant_id,location_id,pool_id,resource_member_key,units,starts_at,ends_at)
    REFERENCES booking_v4_selection_leaves(booking_id,selection_revision,selection_id,tenant_id,location_id,pool_id,resource_member_key,units,starts_at,ends_at) ON DELETE RESTRICT,
  FOREIGN KEY(booking_id,selection_revision,tenant_id,location_id)
    REFERENCES booking_v4_selection_versions(booking_id,revision,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(pool_id,tenant_id,location_id) REFERENCES location_resource_pools(id,tenant_id,location_id) ON DELETE RESTRICT,
  FOREIGN KEY(resource_member_id,pool_id,tenant_id,location_id)
    REFERENCES resource_pool_members(id,pool_id,tenant_id,location_id) ON DELETE RESTRICT
);
CREATE INDEX booking_v4_reserved_interval_idx ON booking_v4_reservations(tenant_id,location_id,pool_id,starts_at,ends_at)
 WHERE state IN ('protected','converted');
CREATE TABLE booking_v4_command_receipts (
 tenant_id BIGINT NOT NULL,
 location_id BIGINT NOT NULL,
 actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operation_key TEXT NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 120),
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,location_id,actor_user_id,operation_key),
 FOREIGN KEY(location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT
);
CREATE FUNCTION protect_booking_v4_selection_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Captured booking selections are immutable.' USING ERRCODE='23514',CONSTRAINT='booking_v4_capture_immutable';
END; $$;
CREATE TRIGGER booking_v4_leaves_immutable BEFORE UPDATE OR DELETE ON booking_v4_selection_leaves
 FOR EACH ROW EXECUTE FUNCTION protect_booking_v4_selection_history();
CREATE TRIGGER booking_v4_receipts_immutable BEFORE UPDATE OR DELETE ON booking_v4_command_receipts
 FOR EACH ROW EXECUTE FUNCTION protect_booking_v4_selection_history();
CREATE TRIGGER booking_v4_selection_immutable BEFORE UPDATE OR DELETE ON booking_v4_selection_versions
 FOR EACH ROW EXECUTE FUNCTION protect_booking_v4_selection_history();
CREATE FUNCTION protect_booking_v4_reservation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Booking reservation history cannot be deleted.' USING ERRCODE='23514';
 END IF;
 IF (to_jsonb(NEW)-ARRAY['state','released_reason','resolved_at','resource_member_key']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','released_reason','resolved_at','resource_member_key'])
    OR (OLD.state='released' AND (to_jsonb(NEW)-'resource_member_key') IS DISTINCT FROM (to_jsonb(OLD)-'resource_member_key'))
    OR (OLD.state='converted' AND NEW.state='protected') THEN
   RAISE EXCEPTION 'Booking reservation identity and resolved history are immutable.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER booking_v4_reservation_immutable BEFORE UPDATE OR DELETE ON booking_v4_reservations
 FOR EACH ROW EXECUTE FUNCTION protect_booking_v4_reservation_identity();
COMMIT;
