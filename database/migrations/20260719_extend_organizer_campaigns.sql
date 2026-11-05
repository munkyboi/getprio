BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS organizer_campaign_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS vendor_reviews (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT CHECK (char_length(comment) <= 1000),
  revision_count SMALLINT NOT NULL DEFAULT 0 CHECK (revision_count BETWEEN 0 AND 1),
  revised_at TIMESTAMPTZ,
  vendor_reply TEXT CHECK (char_length(vendor_reply) <= 1000),
  vendor_replied_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  vendor_replied_at TIMESTAMPTZ,
  moderation_status TEXT NOT NULL DEFAULT 'active' CHECK (moderation_status IN ('active', 'disputed', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_reviews_tenant_idx ON vendor_reviews (tenant_id, moderation_status, created_at DESC);

CREATE TABLE IF NOT EXISTS user_trust_ratings (
  id BIGSERIAL PRIMARY KEY,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('vendor_to_organizer', 'organizer_to_contributor', 'contributor_to_organizer')),
  booking_id BIGINT REFERENCES bookings(id) ON DELETE CASCADE,
  campaign_id BIGINT REFERENCES organizer_campaigns(id) ON DELETE CASCADE,
  contribution_id BIGINT REFERENCES organizer_campaign_contributions(id) ON DELETE CASCADE,
  rater_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  reason_category TEXT,
  private_note TEXT CHECK (char_length(private_note) <= 1000),
  moderation_status TEXT NOT NULL DEFAULT 'active' CHECK (moderation_status IN ('active', 'disputed', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (stars > 2 OR reason_category IS NOT NULL),
  UNIQUE (interaction_type, rater_user_id, booking_id, campaign_id, contribution_id)
);
CREATE INDEX IF NOT EXISTS user_trust_ratings_subject_idx ON user_trust_ratings (subject_user_id, moderation_status, created_at DESC);

CREATE TABLE IF NOT EXISTS rating_disputes (
  id BIGSERIAL PRIMARY KEY,
  rating_type TEXT NOT NULL CHECK (rating_type IN ('vendor_review', 'user_trust')),
  rating_id BIGINT NOT NULL,
  reporter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  dispute_status TEXT NOT NULL DEFAULT 'open' CHECK (dispute_status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rating_type, rating_id, reporter_user_id)
);

DROP TRIGGER IF EXISTS set_vendor_reviews_updated_at ON vendor_reviews;
CREATE TRIGGER set_vendor_reviews_updated_at BEFORE UPDATE ON vendor_reviews FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_user_trust_ratings_updated_at ON user_trust_ratings;
CREATE TRIGGER set_user_trust_ratings_updated_at BEFORE UPDATE ON user_trust_ratings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_rating_disputes_updated_at ON rating_disputes;
CREATE TRIGGER set_rating_disputes_updated_at BEFORE UPDATE ON rating_disputes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
