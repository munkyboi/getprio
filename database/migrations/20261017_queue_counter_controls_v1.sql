BEGIN;
CREATE TABLE queue_counter_command_receipts (
 tenant_id BIGINT NOT NULL,
 location_id BIGINT NOT NULL,
 actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 operation_key TEXT NOT NULL CHECK(length(operation_key) BETWEEN 1 AND 120),
 command TEXT NOT NULL CHECK(command='legacy_call_next'),
 payload_hash TEXT NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 result JSONB NOT NULL CHECK(jsonb_typeof(result)='object'),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,location_id,actor_user_id,operation_key),
 FOREIGN KEY(location_id,tenant_id) REFERENCES store_locations(id,tenant_id) ON DELETE RESTRICT
);
COMMIT;
