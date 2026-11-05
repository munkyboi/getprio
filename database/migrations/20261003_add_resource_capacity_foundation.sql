BEGIN;

-- Draft configuration only. A later migration and operational release must
-- supply booking/session concurrency controls before tracking can be enabled.
CREATE TABLE location_resource_pools (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  tracking_enabled BOOLEAN NOT NULL DEFAULT FALSE
    CONSTRAINT resource_pools_tracking_disabled_check CHECK (tracking_enabled = FALSE),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, tenant_id, location_id),
  UNIQUE (tenant_id, location_id, name),
  CONSTRAINT resource_pools_location_scope_fkey FOREIGN KEY (location_id, tenant_id)
    REFERENCES store_locations (id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE service_resource_requirements (
  tenant_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  service_id BIGINT NOT NULL,
  pool_id BIGINT NOT NULL,
  units_required INTEGER NOT NULL CHECK (units_required BETWEEN 1 AND 100),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, location_id, service_id),
  CONSTRAINT resource_requirements_pool_scope_fkey FOREIGN KEY (pool_id, tenant_id, location_id)
    REFERENCES location_resource_pools (id, tenant_id, location_id) ON DELETE CASCADE,
  CONSTRAINT resource_requirements_service_scope_fkey FOREIGN KEY (service_id, tenant_id)
    REFERENCES vendor_services (id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT resource_requirements_location_service_fkey FOREIGN KEY (location_id, service_id)
    REFERENCES location_services (location_id, service_id) ON DELETE CASCADE
);

CREATE INDEX resource_requirements_pool_idx
  ON service_resource_requirements (pool_id, tenant_id, location_id);

CREATE TRIGGER set_resource_pools_updated_at BEFORE UPDATE ON location_resource_pools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_resource_requirements_updated_at BEFORE UPDATE ON service_resource_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
