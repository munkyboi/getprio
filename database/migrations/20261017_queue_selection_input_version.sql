BEGIN;
ALTER TABLE queue_plan_drafts ADD COLUMN selection_contract_version INTEGER CHECK(selection_contract_version IN(3,4));
UPDATE queue_plan_drafts SET selection_contract_version=3 WHERE service_selections IS NOT NULL;
COMMIT;
