BEGIN;

ALTER TABLE organizer_campaign_contributions
  DROP CONSTRAINT IF EXISTS organizer_campaign_contributions_contribution_status_check;
ALTER TABLE organizer_campaign_contributions
  ADD CONSTRAINT organizer_campaign_contributions_contribution_status_check CHECK (
    contribution_status IN (
      'pending_proof', 'submitted', 'review_overdue', 'accepted', 'rejected', 'expired', 'withdrawn',
      'refund_pending', 'refund_sent', 'refund_confirmed', 'refund_disputed'
    )
  );

ALTER TABLE organizer_campaign_contributions
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS retry_available_at TIMESTAMPTZ;

UPDATE organizer_campaign_contributions contributions
SET reservation_expires_at = LEAST(NOW() + INTERVAL '15 minutes', campaigns.deadline_at)
FROM organizer_campaigns campaigns
WHERE campaigns.id = contributions.campaign_id
  AND contributions.contribution_status = 'pending_proof'
  AND contributions.reservation_expires_at IS NULL;

ALTER TABLE organizer_campaign_contributions
  DROP CONSTRAINT IF EXISTS organizer_campaign_contributions_reservation_attempt_count_check;
ALTER TABLE organizer_campaign_contributions
  ADD CONSTRAINT organizer_campaign_contributions_reservation_attempt_count_check
  CHECK (reservation_attempt_count BETWEEN 1 AND 2);

CREATE INDEX IF NOT EXISTS organizer_campaign_contributions_reservation_expiry_idx
  ON organizer_campaign_contributions (reservation_expires_at ASC)
  WHERE contribution_status = 'pending_proof';

CREATE INDEX IF NOT EXISTS organizer_campaign_contributions_unpaid_user_idx
  ON organizer_campaign_contributions (contributor_user_id, reservation_expires_at ASC)
  WHERE contribution_status = 'pending_proof';

COMMIT;
