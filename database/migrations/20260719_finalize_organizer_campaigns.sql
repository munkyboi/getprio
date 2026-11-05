BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS user_trust_ratings_vendor_booking_once_idx
  ON user_trust_ratings (rater_user_id, booking_id)
  WHERE interaction_type = 'vendor_to_organizer';
CREATE UNIQUE INDEX IF NOT EXISTS user_trust_ratings_campaign_contribution_once_idx
  ON user_trust_ratings (interaction_type, rater_user_id, contribution_id)
  WHERE interaction_type IN ('organizer_to_contributor', 'contributor_to_organizer');

CREATE TABLE IF NOT EXISTS vendor_review_revisions (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES vendor_reviews(id) ON DELETE CASCADE,
  previous_stars SMALLINT NOT NULL CHECK (previous_stars BETWEEN 1 AND 5),
  previous_comment TEXT,
  revised_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_review_revisions_review_idx ON vendor_review_revisions (review_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organizer_campaign_notices (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES organizer_campaigns(id) ON DELETE CASCADE,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS organizer_campaign_notices_recipient_idx ON organizer_campaign_notices (recipient_user_id, campaign_id, created_at DESC);

CREATE OR REPLACE FUNCTION record_organizer_campaign_state_transition() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.campaign_status IS DISTINCT FROM NEW.campaign_status THEN
    INSERT INTO organizer_campaign_events (campaign_id, event_type, actor_role, source, metadata)
    VALUES (NEW.id, 'campaign_status_changed', 'system', 'database', jsonb_build_object('from', OLD.campaign_status, 'to', NEW.campaign_status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_organizer_campaign_state_transition ON organizer_campaigns;
CREATE TRIGGER audit_organizer_campaign_state_transition AFTER UPDATE OF campaign_status ON organizer_campaigns
FOR EACH ROW EXECUTE FUNCTION record_organizer_campaign_state_transition();

CREATE OR REPLACE FUNCTION record_organizer_contribution_state_transition() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.contribution_status IS DISTINCT FROM NEW.contribution_status THEN
    INSERT INTO organizer_campaign_events (campaign_id, event_type, actor_role, source, metadata)
    VALUES (NEW.campaign_id, 'contribution_status_changed', 'system', 'database', jsonb_build_object('contributionId', NEW.id, 'from', OLD.contribution_status, 'to', NEW.contribution_status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_organizer_contribution_state_transition ON organizer_campaign_contributions;
CREATE TRIGGER audit_organizer_contribution_state_transition AFTER UPDATE OF contribution_status ON organizer_campaign_contributions
FOR EACH ROW EXECUTE FUNCTION record_organizer_contribution_state_transition();

CREATE OR REPLACE FUNCTION record_organizer_reimbursement_state_transition() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.reimbursement_status IS DISTINCT FROM NEW.reimbursement_status THEN
    INSERT INTO organizer_campaign_events (campaign_id, event_type, actor_role, source, metadata)
    VALUES (NEW.campaign_id, 'reimbursement_status_changed', 'system', 'database', jsonb_build_object('reimbursementId', NEW.id, 'from', OLD.reimbursement_status, 'to', NEW.reimbursement_status));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_organizer_reimbursement_state_transition ON organizer_campaign_reimbursements;
CREATE TRIGGER audit_organizer_reimbursement_state_transition AFTER UPDATE OF reimbursement_status ON organizer_campaign_reimbursements
FOR EACH ROW EXECUTE FUNCTION record_organizer_reimbursement_state_transition();

COMMIT;
