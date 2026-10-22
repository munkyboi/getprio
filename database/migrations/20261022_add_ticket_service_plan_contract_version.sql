BEGIN;

ALTER TABLE ticket_service_plans
  ADD COLUMN contract_version INTEGER;

COMMIT;
