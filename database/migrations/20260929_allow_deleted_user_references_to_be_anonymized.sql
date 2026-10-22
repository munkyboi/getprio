BEGIN;

-- Retain selected business and moderation history without retaining the deleted
-- account's direct identity link. Account-deletion worker rules freeze owned
-- campaigns and hide trust ratings before clearing these nullable references.
ALTER TABLE organizer_campaigns
  ALTER COLUMN organizer_user_id DROP NOT NULL;

ALTER TABLE organizer_campaign_reports
  ALTER COLUMN reporter_user_id DROP NOT NULL;

ALTER TABLE user_trust_ratings
  ALTER COLUMN rater_user_id DROP NOT NULL,
  ALTER COLUMN subject_user_id DROP NOT NULL;

COMMIT;
