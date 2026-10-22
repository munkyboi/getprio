BEGIN;
ALTER TABLE location_resource_pools ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE location_resource_pools ADD COLUMN archived_by_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE location_resource_pools ADD CHECK ((archived_at IS NULL)=(archived_by_user_id IS NULL));
ALTER TABLE service_resource_requirements DROP CONSTRAINT IF EXISTS resource_requirements_pool_scope_fkey;
ALTER TABLE service_resource_requirements ADD CONSTRAINT resource_requirements_pool_scope_fkey
  FOREIGN KEY(pool_id,tenant_id,location_id) REFERENCES location_resource_pools(id,tenant_id,location_id) ON DELETE RESTRICT;
-- Tombstones intentionally survive physical deletion; they never cascade from a pool.
CREATE TABLE resource_pool_lifecycle_commands (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operation_key TEXT NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 120),
  pool_id BIGINT NOT NULL,
  action TEXT NOT NULL CHECK(action IN('deletePool','archivePool')),
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  before_snapshot JSONB NOT NULL,
  result JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,location_id,actor_user_id,operation_key),
  FOREIGN KEY(location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT
);
COMMIT;
