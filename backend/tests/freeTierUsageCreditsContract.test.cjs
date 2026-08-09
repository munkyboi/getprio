const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("queue OTP timing and lockout policy uses the settled customer-safe limits", () => {
  const service = require("../src/services/queueJoinOtpService");
  assert.deepEqual(service.OTP_RESEND_DELAYS_SECONDS, [300, 450, 675]);
  assert.equal(service.OTP_MAX_RESENDS, 3);
  assert.equal(service.OTP_MAX_INCORRECT_ATTEMPTS, 5);
  assert.equal(service.OTP_RESTART_LOCKOUT_MINUTES, 30);
});

test("Usage Credit schema fixes catalog snapshots and excludes Service Bookings", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../database/migrations/20260804_06_add_usage_credit_commerce.sql"), "utf8");
  assert.match(sql, /'P100' THEN 100/);
  assert.match(sql, /'P500' THEN 500/);
  assert.match(sql, /'P100' THEN 9900/);
  assert.match(sql, /'P500' THEN 39900/);
  assert.match(sql, /ELSE 69900/);
  assert.match(sql, /resource_key IN \('queueTickets','queueEmailJourneys'\)/);
  assert.doesNotMatch(sql, /usage_credit_lots[\s\S]*resource_key[^\n]*serviceBookings/);
});

test("rollout tooling creates correlated baselines and remains explicitly gated", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../scripts/entitlement-rollout.mjs"), "utf8");
  assert.match(source, /FREE_PLAN_BACKFILL_ENABLED/);
  assert.match(source, /resource: "queueTickets"/);
  assert.match(source, /resource: "queueEmailJourneys"/);
  assert.match(source, /resource: "serviceBookings"/);
  assert.match(source, /JOIN queue_email_journeys/);
  assert.match(source, /LEGACY_EMAIL_UNIT_NOT_CONVERTED/);
  assert.match(source, /tenant_entitlement_overrides/);
  assert.match(source, /plan_policy_baselines/);
  assert.match(source, /entitlement_comparison_hash/);
  assert.match(source, /blocking_anomalies/);
});

test("paid policy baselines are captured before live defaults mutate", () => {
  const sql = fs.readFileSync(path.join(__dirname, "../../database/migrations/20260804_03_add_free_plan_and_live_policies.sql"), "utf8");
  const baselineCapture = sql.indexOf("INSERT INTO plan_policy_baselines");
  const paidDefaultsMutation = sql.indexOf("UPDATE subscription_plans\nSET entitlements");

  assert.ok(baselineCapture >= 0);
  assert.ok(paidDefaultsMutation > baselineCapture);
  assert.match(sql, /entitlement_comparison_hash TEXT/);
  assert.match(sql, /blocking BOOLEAN NOT NULL DEFAULT TRUE/);
});

test("Free plan policy data preserves the complete dashboard entitlement contract", () => {
  const migration = fs.readFileSync(path.join(__dirname, "../../database/migrations/20260804_03_add_free_plan_and_live_policies.sql"), "utf8");
  const init = fs.readFileSync(path.join(__dirname, "../../database/init.sql"), "utf8");

  for (const source of [migration, init]) {
    assert.match(source, /"analytics":false/);
    assert.match(source, /"csvExport":false/);
    assert.match(source, /"pdfExport":false/);
    assert.match(source, /"allowedHistoryExportRanges":\[\]/);
    assert.match(source, /"supportLevel":"self_serve"/);
  }
});

test("all authoritative booking and Journey paths retain one-unit and retry contracts", () => {
  const campaign = fs.readFileSync(path.join(__dirname, "../src/services/groupFundedBookingService.js"), "utf8");
  const journey = fs.readFileSync(path.join(__dirname, "../src/services/queueEmailJourneyService.js"), "utf8");
  assert.match(campaign, /Approved group-funded campaign created one Service Booking/);
  assert.match(campaign, /resourceKey: "serviceBookings"/);
  assert.match(journey, /status IN \('unused', 'failed'\)/);
});

test("paid queue admission commits its durable allowance reservation atomically", () => {
  const queueService = fs.readFileSync(path.join(__dirname, "../src/services/queueService.js"), "utf8");
  const paymentService = fs.readFileSync(path.join(__dirname, "../src/services/queueJoinPaymentService.js"), "utf8");
  const ledger = fs.readFileSync(path.join(__dirname, "../src/repositories/allowanceLedger.js"), "utf8");
  const schema = fs.readFileSync(path.join(__dirname, "../../database/migrations/20260804_05_add_allowance_ledger.sql"), "utf8");

  assert.match(paymentService, /allowanceReservationKey: `queue-payment:\$\{payment\._id\}`/);
  assert.match(queueService, /allowanceService\.commitReservation/);
  assert.match(ledger, /status='committed'/);
  assert.match(ledger, /allowance_reservation_allocations/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS allowance_reservation_allocations/);
});

test("Plan Matrix core is permanent while mutations and vendor capacity remain server-controlled", () => {
  const platformRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/platformRoutes.js"), "utf8");
  const billingRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/billingRoutes.js"), "utf8");
  assert.match(platformRoutes, /planMatrix: true/);
  assert.match(platformRoutes, /planPolicyMutations: releaseControls\.planPolicyMutations/);
  assert.match(billingRoutes, /vendorCapacityExperience: releaseControls\.vendorCapacityExperience/);
});

test("auth and billing API families retain explicit HTTP rate limits", () => {
  const app = fs.readFileSync(path.join(__dirname, "../src/app.ts"), "utf8");
  const authRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/authRoutes.js"), "utf8");
  const billingRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/billingRoutes.js"), "utf8");

  assert.match(app, /app\.use\("\/api", apiRateLimiter\)/);
  assert.match(authRoutes, /router\.use\(authHttpLimiter\)/);
  assert.match(billingRoutes, /router\.use\(billingHttpLimiter\)/);
});

test("new Free-tier API families have fail-closed server route gates", () => {
  const platformRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/platformRoutes.js"), "utf8");
  const billingRoutes = fs.readFileSync(path.join(__dirname, "../src/routes/billingRoutes.js"), "utf8");

  for (const control of [
    "usageCreditCatalog",
    "usageCreditGrants",
    "usageCreditRefunds",
    "usageCreditDisputes",
    "entitlementOverrides",
    "allowanceRepairs",
    "subscriptionLifecycle",
    "planPolicyMutations"
  ]) {
    assert.match(platformRoutes, new RegExp(`(?:assert|require)ReleaseControl\\(\\"${control}\\"\\)`));
  }

  for (const control of [
    "usageCreditCatalog",
    "usageCreditCheckout",
    "usageCreditRefunds",
    "subscriptionLifecycle",
    "vendorCapacityExperience"
  ]) {
    assert.match(billingRoutes, new RegExp(`(?:assert|require)ReleaseControl\\(\\"${control}\\"\\)`));
  }

  assert.match(platformRoutes, /requireReleaseControl\("usageCreditDisputes"\),\s*requireIdempotency/);
  assert.match(platformRoutes, /requireReleaseControl\("allowanceRepairs"\),\s*requireIdempotency/);
  assert.match(platformRoutes, /"queue\.fees\.publish": "planPolicyMutations"/);
  assert.match(platformRoutes, /"\/queue-fees",\s*requirePlatformPermission\("platform\.queue_fees\.manage"\),\s*requireReleaseControl\("planPolicyMutations"\),\s*requireIdempotency/);
  assert.match(billingRoutes, /requireReleaseControl\("usageCreditCheckout"\),\s*authorizeTenant\("tenant\.credits\.purchase"\),\s*requireIdempotency/);
  assert.match(billingRoutes, /requireReleaseControl\("usageCreditRefunds"\),\s*authorizeTenant\("tenant\.credits\.refund_request"\),\s*requireIdempotency/);
});

test("subscription and Usage Credit lifecycle fail closed on stale or unpaid authority", () => {
  const lifecycleRepository = fs.readFileSync(path.join(__dirname, "../src/repositories/subscriptionLifecycle.js"), "utf8");
  const lifecycleService = fs.readFileSync(path.join(__dirname, "../src/services/subscriptionLifecycleService.js"), "utf8");
  const creditService = fs.readFileSync(path.join(__dirname, "../src/services/usageCreditService.js"), "utf8");
  const creditRepository = fs.readFileSync(path.join(__dirname, "../src/repositories/usageCredits.js"), "utf8");

  assert.match(lifecycleRepository, /WITH RECURSIVE periods/);
  assert.match(lifecycleRepository, /WHERE period_end > NOW\(\)/);
  assert.match(lifecycleRepository, /PAID_PROVIDER_EVIDENCE_REQUIRED/);
  assert.match(lifecycleService, /providerEvidence\?\.status !== "confirmed"/);
  assert.match(creditService, /CREDIT_CHECKOUT_SUBSCRIPTION_RESTRICTED/);
  assert.match(creditRepository, /CREDIT_FULFILLMENT_SUBSCRIPTION_RESTRICTED/);
  assert.ok(creditRepository.indexOf("CREDIT_FULFILLMENT_SUBSCRIPTION_RESTRICTED") < creditRepository.indexOf("await grantLot"));
});

test("allowance warnings use the settled thresholds and expose retryable delivery evidence", () => {
  const ledger = fs.readFileSync(path.join(__dirname, "../src/repositories/allowanceLedger.js"), "utf8");
  const migration = fs.readFileSync(path.join(__dirname, "../../database/migrations/20260804_05_add_allowance_ledger.sql"), "utf8");
  const capacity = fs.readFileSync(path.join(__dirname, "../src/services/usageCreditService.js"), "utf8");

  assert.match(ledger, /ARRAY\[80,90,100\]/);
  assert.doesNotMatch(ledger, /ARRAY\[50,75,90,100\]/);
  assert.match(ledger, /last_delivery_attempt_at < NOW\(\) - INTERVAL '5 minutes'/);
  assert.match(migration, /threshold_percent IN \(80,90,100\)/);
  assert.match(migration, /last_delivery_attempt_at TIMESTAMPTZ/);
  assert.match(capacity, /thresholdPercent: Number\(row\.threshold_percent\)/);
  assert.match(capacity, /deliveredAt: row\.delivered_at \|\| null/);
});

test("Free-tier migrations have an explicit release boundary", () => {
  const applyScript = fs.readFileSync(path.join(__dirname, "../../scripts/db-apply.sh"), "utf8");
  const runbook = fs.readFileSync(path.join(__dirname, "../../docs/operations/free-tier-entitlements-rollout.md"), "utf8");
  const expected = [
    "20260804_01_harden_auth_sessions.sql",
    "20260804_02_add_mfa_and_privileged_confirmations.sql",
    "20260804_03_add_free_plan_and_live_policies.sql",
    "20260804_04_add_idempotency_and_security_audit.sql",
    "20260804_05_add_allowance_ledger.sql",
    "20260804_06_add_usage_credit_commerce.sql",
    "20260804_07_add_queue_otp_chains.sql",
    "20260809_01_finalize_free_tier_rollout.sql",
    "20260809_02_repair_free_plan_entitlement_shape.sql",
    "20260809_03_repair_mfa_replacement_indexes.sql"
  ];
  assert.match(applyScript, /migrate-free-tier/);
  for (const filename of expected) {
    assert.match(applyScript, new RegExp(filename.replaceAll(".", "\\.")));
    assert.match(runbook, new RegExp(filename.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(applyScript.match(/free_tier_migrations=\([\s\S]*?\n\)/)?.[0] || "", /20260731|20260801/);
  assert.match(applyScript, /Free-tier migration refused: independently qualify and apply Queue Day prerequisite/);
  assert.match(runbook, /Queue Day migrations are a separate prerequisite release unit/);
});

test("database scripts preserve the explicit target when psql runs under Docker Compose", () => {
  for (const filename of ["db-apply.sh", "db-status.sh", "db-verify-schema.sh"]) {
    const source = fs.readFileSync(path.join(__dirname, "../../scripts", filename), "utf8");
    assert.match(source, /docker_database_url="\$\{DATABASE_URL\/127\.0\.0\.1\/host\.docker\.internal\}"/);
    assert.match(source, /psql "\$docker_database_url"/);
    assert.doesNotMatch(source, /psql -U "\$POSTGRES_USER" -d "\$POSTGRES_DB"/);
    assert.doesNotMatch(source, /docker compose exec -T database env DATABASE_URL="\$DATABASE_URL" psql "\$DATABASE_URL"/);
  }
});

test("MFA schema permits one active factor and one pending replacement", () => {
  const foundation = fs.readFileSync(path.join(__dirname, "../../database/migrations/20260804_02_add_mfa_and_privileged_confirmations.sql"), "utf8");
  const repair = fs.readFileSync(path.join(__dirname, "../../database/migrations/20260809_03_repair_mfa_replacement_indexes.sql"), "utf8");
  const init = fs.readFileSync(path.join(__dirname, "../../database/init.sql"), "utf8");

  for (const source of [foundation, repair, init]) {
    assert.match(source, /auth_mfa_factors_active_type_idx[\s\S]*WHERE status = 'active'/);
    assert.match(source, /auth_mfa_factors_pending_type_idx[\s\S]*WHERE status = 'pending'/);
  }
  assert.match(repair, /DROP INDEX IF EXISTS auth_mfa_factors_active_type_idx/);
  assert.match(repair, /CREATE UNIQUE INDEX IF NOT EXISTS auth_mfa_factors_pending_type_idx/);
});
