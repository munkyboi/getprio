BEGIN;

CREATE TABLE customer_notification_inbox_policy (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO customer_notification_inbox_policy(singleton) VALUES(TRUE);

CREATE TABLE customer_notification_inbox (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL,
  title TEXT,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  read_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  UNIQUE(user_id, notification_key),
  CHECK ((cleared_at IS NULL AND title IS NOT NULL AND body IS NOT NULL)
    OR (cleared_at IS NOT NULL AND title IS NULL AND body IS NULL))
);
CREATE INDEX customer_notification_inbox_user_page_idx
  ON customer_notification_inbox(user_id, id DESC) WHERE cleared_at IS NULL;
CREATE INDEX customer_notification_inbox_expiry_idx ON customer_notification_inbox(created_at);

COMMIT;
