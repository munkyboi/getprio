BEGIN;

ALTER TABLE developer_api_keys
  ADD COLUMN IF NOT EXISTS profile_slugs TEXT[];

ALTER TABLE developer_api_keys
  DROP CONSTRAINT IF EXISTS developer_api_keys_profile_slugs_check;

ALTER TABLE developer_api_keys
  ADD CONSTRAINT developer_api_keys_profile_slugs_check
  CHECK (profile_slugs IS NULL OR cardinality(profile_slugs) > 0);

CREATE INDEX IF NOT EXISTS developer_api_keys_profile_slugs_idx
  ON developer_api_keys USING GIN (profile_slugs);

COMMIT;
