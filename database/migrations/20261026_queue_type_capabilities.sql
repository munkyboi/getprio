-- Add execution policy metadata only. Never rewrite admitted work or reservations.
BEGIN;
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS queue_type TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE store_locations ADD COLUMN IF NOT EXISTS queue_type_revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE store_locations DROP CONSTRAINT IF EXISTS store_locations_queue_type_check;
ALTER TABLE store_locations ADD CONSTRAINT store_locations_queue_type_check CHECK (queue_type IN ('simple','resource','workflow'));
ALTER TABLE store_locations DROP CONSTRAINT IF EXISTS store_locations_queue_type_revision_check;
ALTER TABLE store_locations ADD CONSTRAINT store_locations_queue_type_revision_check CHECK (queue_type_revision > 0);
ALTER TABLE plan_feature_entitlements DROP CONSTRAINT IF EXISTS plan_feature_entitlements_feature_key_check;
ALTER TABLE plan_feature_entitlements ADD CONSTRAINT plan_feature_entitlements_feature_key_check
 CHECK (feature_key IN ('queue','resourceQueue','workflowQueue','branding','discovery','booking','campaigns'));
-- Explicit existing values win; unknown/custom plans receive no new access by default.
UPDATE subscription_plans SET entitlements =
 jsonb_build_object('resourceQueueAccess', slug IN ('economical','pro','enterprise'),
                    'workflowQueueAccess', slug IN ('pro','enterprise')) || COALESCE(entitlements, '{}'::jsonb);
INSERT INTO plan_feature_entitlements (plan_slug, feature_key, enabled)
 SELECT slug, 'resourceQueue', entitlements->'resourceQueueAccess' = 'true'::jsonb FROM subscription_plans
 ON CONFLICT (plan_slug, feature_key) DO NOTHING;
INSERT INTO plan_feature_entitlements (plan_slug, feature_key, enabled)
 SELECT slug, 'workflowQueue', entitlements->'workflowQueueAccess' = 'true'::jsonb FROM subscription_plans
 ON CONFLICT (plan_slug, feature_key) DO NOTHING;
-- Legacy snapshots only gain missing keys; pinned allocations/plans remain untouched.
UPDATE tenant_subscriptions s SET entitlements =
 jsonb_build_object('resourceQueueAccess', COALESCE(p.entitlements->'resourceQueueAccess','false'::jsonb),
                    'workflowQueueAccess', COALESCE(p.entitlements->'workflowQueueAccess','false'::jsonb))
 || COALESCE(s.entitlements, '{}'::jsonb)
 FROM subscription_plans p WHERE p.slug = s.plan_slug;
COMMIT;
