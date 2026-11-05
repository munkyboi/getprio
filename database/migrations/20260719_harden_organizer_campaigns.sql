BEGIN;

ALTER TABLE organizer_campaign_contributions
  DROP CONSTRAINT IF EXISTS organizer_campaign_contributions_contribution_status_check;
ALTER TABLE organizer_campaign_contributions
  ADD CONSTRAINT organizer_campaign_contributions_contribution_status_check CHECK (
    contribution_status IN (
      'pending_proof', 'submitted', 'review_overdue', 'accepted', 'rejected',
      'refund_pending', 'refund_sent', 'refund_confirmed', 'refund_disputed'
    )
  );

CREATE INDEX IF NOT EXISTS organizer_campaign_contributions_review_due_idx
  ON organizer_campaign_contributions (submitted_at ASC)
  WHERE contribution_status = 'submitted';

COMMIT;
