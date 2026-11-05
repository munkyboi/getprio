BEGIN;
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS queue_board_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS queue_board_public boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS store_locations_queue_board_id_unique ON store_locations(queue_board_id);
CREATE TABLE IF NOT EXISTS queue_board_display_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id bigint NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  board_id uuid NOT NULL,
  secret_hash text NOT NULL,
  display_name varchar(80) NOT NULL,
  approved_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  UNIQUE(board_id, secret_hash)
);
CREATE TABLE IF NOT EXISTS queue_board_pairing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id bigint NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  board_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE,
  browser_hash text NOT NULL,
  match_code varchar(6) NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by bigint REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS queue_board_pairing_expiry ON queue_board_pairing_requests(expires_at);
CREATE INDEX IF NOT EXISTS queue_board_grants_location ON queue_board_display_grants(location_id);
COMMIT;
