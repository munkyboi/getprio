BEGIN;
ALTER TABLE customer_notification_inbox ADD COLUMN kind TEXT NOT NULL DEFAULT 'general'
  CHECK (kind IN ('queue','booking','general'));

-- Retained keys identify these server namespaces. UUID-only legacy alerts have
-- no saved event provenance and deliberately stay general; content is not guessed.
UPDATE customer_notification_inbox
SET kind = CASE
  WHEN notification_key ~ '^booking:[1-9][0-9]*:schedule:[1-9][0-9]*:reminder:(24h|1h)$' THEN 'booking'
  ELSE 'queue'
END
WHERE notification_key ~ '^booking:[1-9][0-9]*:schedule:[1-9][0-9]*:reminder:(24h|1h)$'
  OR notification_key ~ '^queue-event:[1-9][0-9]*:.+$'
  OR notification_key ~ '^queue-intent:.+$';
COMMIT;
