-- Track funds received for a submitted proof that the vendor cannot accept.
ALTER TABLE group_funded_booking_refunds
  DROP CONSTRAINT IF EXISTS group_funded_booking_refunds_refund_reason_check;

ALTER TABLE group_funded_booking_refunds
  ADD CONSTRAINT group_funded_booking_refunds_refund_reason_check CHECK (
    refund_reason IN (
      'organizer_canceled',
      'funding_failed',
      'vendor_rejected',
      'vendor_review_expired',
      'vendor_canceled',
      'policy_review_required',
      'contribution_rejected',
      'excess_contribution'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS group_funded_refunds_contribution_unique_idx
  ON group_funded_booking_refunds (contribution_id);
