BEGIN;

WITH verified_seed AS (
  SELECT revision
  FROM platform_help_center_revisions
  WHERE created_by IS NULL
    AND change_reason = 'Initial audited Help Center content — awaiting Platform Admin preview and publish'
  ORDER BY revision
  LIMIT 1
), published_seed AS (
  UPDATE platform_help_center_revisions revision
  SET published_at = COALESCE(revision.published_at, NOW())
  FROM verified_seed
  WHERE revision.revision = verified_seed.revision
  RETURNING revision.revision
)
UPDATE platform_help_center_state state
SET published_revision = published_seed.revision,
    updated_at = NOW()
FROM published_seed
WHERE state.singleton = TRUE
  AND state.published_revision IS NULL
  AND state.draft_revision = published_seed.revision;

COMMIT;
