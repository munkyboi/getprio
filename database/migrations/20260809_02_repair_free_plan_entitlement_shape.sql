UPDATE subscription_plans
SET entitlements = jsonb_build_object(
  'analytics', FALSE,
  'csvExport', FALSE,
  'pdfExport', FALSE,
  'allowedHistoryExportRanges', '[]'::jsonb,
  'advancedRoles', FALSE,
  'slaSupport', FALSE,
  'supportLevel', 'self_serve',
  'customDomain', FALSE,
  'sso', FALSE
) || entitlements,
updated_at = NOW()
WHERE slug = 'free';
