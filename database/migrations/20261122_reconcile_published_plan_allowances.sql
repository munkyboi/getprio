-- Keep the normalized published allowance rows in sync with the plan catalog.
-- Older databases can already contain plan_allowances from before the paid-plan
-- entitlement values were finalized; an insert-on-conflict seed does not repair
-- those rows.  Repair only the two live allowance authorities verified by the
-- deployment gate and leave the retired email allowance untouched.
UPDATE plan_allowances AS allowance
SET monthly_limit = (plan.entitlements ->> entitlement.entitlement_key)::integer,
    updated_at = NOW()
FROM subscription_plans AS plan
     CROSS JOIN (VALUES
  ('queueTickets', 'monthlyTickets'),
  ('serviceBookings', 'monthlyServiceBookings')
) AS entitlement(allowance_key, entitlement_key)
WHERE allowance.plan_slug = plan.slug
  AND entitlement.allowance_key = allowance.allowance_key
  AND plan.slug IN ('free', 'economical', 'pro', 'enterprise')
  AND jsonb_typeof(plan.entitlements -> entitlement.entitlement_key) = 'number'
  AND allowance.monthly_limit IS DISTINCT FROM
      (plan.entitlements ->> entitlement.entitlement_key)::integer;
