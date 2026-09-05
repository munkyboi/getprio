CREATE TABLE IF NOT EXISTS business_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS business_categories_name_key ON business_categories (LOWER(BTRIM(name)));
CREATE TABLE IF NOT EXISTS business_category_aliases (
  label_key TEXT PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES business_categories(id) ON DELETE RESTRICT
);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_category_id BIGINT REFERENCES business_categories(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS tenants_business_category_idx ON tenants(business_category_id);
INSERT INTO business_categories (name, sort_order)
SELECT seed.name, seed.sort_order FROM (VALUES
 ('Sports and Recreation', 10), ('Health and Wellness', 20),
 ('Retail and E-Commerce', 30), ('Food and Beverage', 40), ('Generic Service Business', 50)) AS seed(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM business_category_aliases a WHERE a.label_key=LOWER(seed.name))
ON CONFLICT DO NOTHING;
-- Preserve custom legacy values without making them available for new selection.
INSERT INTO business_categories (name, is_active, sort_order)
SELECT MIN(BTRIM(public_profile_category)), FALSE, 1000 FROM tenants
WHERE NULLIF(BTRIM(public_profile_category), '') IS NOT NULL
GROUP BY LOWER(BTRIM(public_profile_category)) ON CONFLICT DO NOTHING;
INSERT INTO business_category_aliases (label_key, category_id)
SELECT LOWER(BTRIM(name)), id FROM business_categories ON CONFLICT DO NOTHING;
UPDATE tenants t SET business_category_id = c.id, public_profile_category = c.name
FROM business_categories c WHERE t.business_category_id IS NULL
AND LOWER(BTRIM(t.public_profile_category)) = LOWER(BTRIM(c.name));

-- Keep legacy string responses consistent, including concurrent admin renames.
CREATE OR REPLACE FUNCTION enforce_tenant_business_category() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE category business_categories%ROWTYPE; unchanged BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    unchanged := NEW.business_category_id IS NOT DISTINCT FROM OLD.business_category_id;
  END IF;
  IF NEW.business_category_id IS NULL THEN
    IF NULLIF(BTRIM(NEW.public_profile_category), '') IS NOT NULL THEN
      SELECT c.* INTO category FROM business_categories c JOIN business_category_aliases a ON a.category_id=c.id
      WHERE a.label_key=LOWER(BTRIM(NEW.public_profile_category)) FOR SHARE OF c;
      IF NOT FOUND OR NOT category.is_active THEN RAISE EXCEPTION 'Choose an active business category.' USING ERRCODE='23514'; END IF;
      NEW.business_category_id := category.id;
      NEW.public_profile_category := category.name;
    ELSIF TG_OP = 'UPDATE' AND NOT unchanged THEN
      RAISE EXCEPTION 'Choose an active business category.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO category FROM business_categories WHERE id=NEW.business_category_id FOR SHARE;
  IF NOT FOUND OR (NOT unchanged AND NOT category.is_active) THEN
    RAISE EXCEPTION 'Choose an active business category.' USING ERRCODE='23514';
  END IF;
  NEW.public_profile_category := category.name;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tenants_business_category_guard ON tenants;
CREATE TRIGGER tenants_business_category_guard BEFORE INSERT OR UPDATE OF business_category_id, public_profile_category ON tenants
FOR EACH ROW EXECUTE FUNCTION enforce_tenant_business_category();
