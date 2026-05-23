CREATE TABLE IF NOT EXISTS subscription_plans (
  slug TEXT PRIMARY KEY CHECK (slug IN ('economical', 'pro', 'enterprise')),
  name TEXT NOT NULL,
  best_for TEXT NOT NULL,
  checkout_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_amount_cents INTEGER NOT NULL CHECK (monthly_amount_cents >= 0),
  annual_amount_cents INTEGER NOT NULL CHECK (annual_amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'PHP',
  entitlements JSONB NOT NULL DEFAULT '{}'::JSONB,
  included JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (
  slug, name, best_for, checkout_enabled, monthly_amount_cents, annual_amount_cents, currency, entitlements, included
)
VALUES
  ('economical','Economical','Solo vendors, small shops, small clinics',TRUE,49900,498000,'PHP',
   '{"locations":1,"counters":1,"staffSeats":1,"monthlyTickets":500,"monthlyTransactionalEmails":100,"historyDays":30,"historyLabel":"30-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"none","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":false,"brandedQueuePages":false,"analytics":false,"csvExport":false,"pdfExport":false,"allowedHistoryExportRanges":["today","month"],"advancedRoles":false,"slaSupport":false,"supportLevel":"self_serve","customDomain":false,"sso":false}',
   '["1 location","1 counter","1 vendor seat","QR join page","Public queue board","Basic dashboard","Email alerts","100 transactional emails/mo","500 tickets/mo","30-day history"]'),
  ('pro','Pro','Clinics, salons, offices, busier service counters',TRUE,149900,1499000,'PHP',
   '{"locations":3,"counters":5,"staffSeats":10,"monthlyTickets":5000,"monthlyTransactionalEmails":500,"historyDays":365,"historyLabel":"365-day history","emailAlerts":true,"smsAllowance":300,"smsBundleType":"fixed","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":true,"analytics":true,"csvExport":true,"pdfExport":true,"allowedHistoryExportRanges":["today","week","month","quarter","year"],"advancedRoles":false,"slaSupport":false,"supportLevel":"standard","customDomain":false,"sso":false}',
   '["3 locations","5 counters","10 staff seats","Branded queue pages","Analytics","CSV export","PDF export","Queue settings","Email alerts","500 transactional emails/mo","5,000 tickets/mo","300 SMS/mo"]'),
  ('enterprise','Enterprise','Multi-branch businesses, schools, LGUs, hospitals',FALSE,699900,6999000,'PHP',
   '{"locations":10,"counters":20,"staffSeats":50,"monthlyTickets":25000,"monthlyTransactionalEmails":null,"historyDays":1095,"historyLabel":"1,095-day history","emailAlerts":true,"smsAllowance":0,"smsBundleType":"custom","qrJoinPage":true,"publicQueueBoard":true,"basicDashboard":true,"queueSettings":true,"brandedQueuePages":true,"analytics":true,"csvExport":true,"pdfExport":true,"allowedHistoryExportRanges":["today","week","month","quarter","year"],"advancedRoles":true,"slaSupport":true,"supportLevel":"sla","customDomain":true,"sso":true}',
   '["10+ locations","20 counters","Advanced roles","SLA/support","Longer history","Custom SMS bundle","Optional custom domain/SSO"]')
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS service_counters (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id BIGINT NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (location_id, slug)
);

CREATE TABLE IF NOT EXISTS service_counter_assignments (
  counter_id BIGINT NOT NULL REFERENCES service_counters(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (counter_id, user_id)
);
