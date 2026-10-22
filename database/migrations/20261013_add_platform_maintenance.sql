BEGIN;
CREATE TABLE platform_maintenance (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  force_screen BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL DEFAULT 'GetPrio is undergoing maintenance. New bookings and queue joins are temporarily paused.' CHECK (length(message) BETWEEN 1 AND 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (NOT force_screen OR enabled)
);
INSERT INTO platform_maintenance (id) VALUES (1);
CREATE TABLE platform_maintenance_operations (
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL CHECK (length(operation_key) BETWEEN 8 AND 128),
  payload_digest TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_user_id, operation_key)
);
COMMIT;
