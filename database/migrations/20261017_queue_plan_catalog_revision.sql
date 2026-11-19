BEGIN;
ALTER TABLE queue_plan_drafts ADD COLUMN catalog_revision TEXT CHECK(catalog_revision IS NULL OR catalog_revision ~ '^[a-f0-9]{64}$');
COMMIT;
