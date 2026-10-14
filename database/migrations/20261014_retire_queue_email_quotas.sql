BEGIN;

-- Capacity fact scans select one tenant and one creation-time billing window.
CREATE INDEX IF NOT EXISTS tickets_tenant_created_at_idx ON tickets (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS bookings_tenant_created_at_idx ON bookings (tenant_id, created_at);

-- Preserve historical quota values, allocations, purchases and refunds. New
-- journeys record delivery slots only; an old exhausted mode is not a quota.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_email_journey_mode_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_email_journey_mode_check
  CHECK (email_journey_mode IN ('not_eligible','metered','journey_exhausted','unmetered'));
ALTER TABLE queue_email_journeys DROP CONSTRAINT IF EXISTS queue_email_journeys_mode_check;
ALTER TABLE queue_email_journeys ADD CONSTRAINT queue_email_journeys_mode_check
  CHECK (mode IN ('metered','journey_exhausted','unmetered'));

-- Append immutable ticket-only revisions; never rewrite purchased snapshots or
-- change ticket quantities, price, currency, pack state or historical revisions.
LOCK TABLE usage_credit_packs IN SHARE ROW EXCLUSIVE MODE;
WITH revisions AS (
  INSERT INTO usage_credit_pack_revisions
    (pack_id, revision, ticket_units, journey_units, price_cents, currency, reason)
  SELECT pack.id, pack.current_revision+1, current.ticket_units, 0,
    current.price_cents, current.currency, 'Queue Email Journey quota and credits retired; ticket terms unchanged'
  FROM usage_credit_packs pack
  JOIN usage_credit_pack_revisions current
    ON current.pack_id=pack.id AND current.revision=pack.current_revision
  WHERE pack.state <> 'archived' AND current.ticket_units > 0 AND current.journey_units > 0
  RETURNING pack_id, revision
)
UPDATE usage_credit_packs pack SET current_revision=revisions.revision, updated_at=NOW()
FROM revisions WHERE pack.id=revisions.pack_id;

COMMIT;
