BEGIN;
-- Legacy metadata stays explicitly legacy; no business-specific policy is
-- inferred from catalog duration, prior option lists, names or resource pools.
ALTER TABLE queue_service_policies ADD COLUMN configuration JSONB
  CHECK(configuration IS NULL OR jsonb_typeof(configuration)='object');
ALTER TABLE ticket_service_plans DROP CONSTRAINT ticket_service_plans_contract_version_check;
ALTER TABLE ticket_service_plans ADD CONSTRAINT ticket_service_plans_contract_version_check CHECK(contract_version IN(1,2,3,4));
ALTER TABLE queue_selection_definitions ADD CONSTRAINT queue_selection_count_duration_snapshot CHECK(
  snapshot->>'inputContractVersion' IS DISTINCT FROM '4' OR kind='service' OR COALESCE(
    jsonb_typeof(snapshot->'durationCount')='number'
    AND jsonb_typeof(snapshot->'baseMinutes')='number'
    AND (snapshot->>'durationCount')::numeric=trunc((snapshot->>'durationCount')::numeric)
    AND (snapshot->>'durationCount')::numeric BETWEEN 1 AND 96
    AND (snapshot->>'baseMinutes')::numeric BETWEEN 5 AND 480
    AND duration_minutes=(snapshot->>'durationCount')::numeric*(snapshot->>'baseMinutes')::numeric
    AND length(snapshot->>'durationPolicyRevision')>0
    AND snapshot->'executionPolicy'->>'resourceStart'='together'
    AND snapshot->'executionPolicy'->>'extraStart'='with_parent'
    AND snapshot->'executionPolicy'->>'extraContainment'='within_parent'
    AND snapshot->'executionPolicy'->>'selectedExtraResolution'='explicit_required',FALSE));
COMMIT;
