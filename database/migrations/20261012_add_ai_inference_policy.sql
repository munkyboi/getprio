BEGIN;
CREATE TABLE ai_inference_policy (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  requested_mode TEXT NOT NULL DEFAULT 'off' CHECK (requested_mode IN ('off', 'private_shadow')),
  timeout_ms INTEGER NOT NULL DEFAULT 100 CHECK (timeout_ms BETWEEN 1 AND 1000),
  freshness_ms INTEGER NOT NULL DEFAULT 1000 CHECK (freshness_ms BETWEEN 1 AND 5000),
  pilots JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(pilots) = 'array' AND jsonb_array_length(pilots) <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO ai_inference_policy (id) VALUES (1);
CREATE TABLE ai_inference_policy_operations (
  actor_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL CHECK (length(operation_key) BETWEEN 8 AND 128),
  payload_digest TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_user_id, operation_key)
);
COMMIT;
