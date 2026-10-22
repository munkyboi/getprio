CREATE TABLE IF NOT EXISTS customer_favorites (
  customer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (customer_user_id, tenant_id)
);
ALTER TABLE vendor_reviews ADD COLUMN IF NOT EXISTS public_visible BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS vendor_reviews_public_page_idx ON vendor_reviews (tenant_id, created_at DESC, id DESC) WHERE moderation_status = 'active' AND public_visible = TRUE;
