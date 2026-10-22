BEGIN;
ALTER TABLE queue_plan_drafts ADD COLUMN service_selections JSONB
  CHECK(service_selections IS NULL OR(jsonb_typeof(service_selections)='array' AND jsonb_array_length(service_selections)<=20));
COMMIT;
