BEGIN;

-- Privacy-minimized activity counters for Platform abuse triage. No token,
-- request path, request body, or client network address is retained here.
CREATE TABLE IF NOT EXISTS developer_api_key_activity_hourly (
  developer_api_key_id UUID NOT NULL REFERENCES developer_api_keys(id) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count BIGINT NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  read_requests BIGINT NOT NULL DEFAULT 0 CHECK (read_requests >= 0),
  write_requests BIGINT NOT NULL DEFAULT 0 CHECK (write_requests >= 0),
  client_errors BIGINT NOT NULL DEFAULT 0 CHECK (client_errors >= 0),
  server_errors BIGINT NOT NULL DEFAULT 0 CHECK (server_errors >= 0),
  rate_limited_requests BIGINT NOT NULL DEFAULT 0 CHECK (rate_limited_requests >= 0),
  auth_failures BIGINT NOT NULL DEFAULT 0 CHECK (auth_failures >= 0),
  last_seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (developer_api_key_id, bucket_start)
);

CREATE INDEX IF NOT EXISTS developer_api_key_activity_hourly_bucket_idx
  ON developer_api_key_activity_hourly (bucket_start);

COMMIT;
