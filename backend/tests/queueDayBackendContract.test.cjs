const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("vendor API exposes manual open and audited 30-minute extension mutations", () => {
  const routes = fs.readFileSync(
    path.join(root, "backend/src/routes/vendorRoutes.js"),
    "utf8"
  );
  assert.match(routes, /"\/tenant\/:tenantSlug\/queue\/open"/);
  assert.match(routes, /"\/tenant\/:tenantSlug\/queue\/extend"/);
  assert.match(routes, /tenant\.queue\.reopen/);
  assert.match(routes, /assertQueueLocationAccess/);
  assert.match(routes, /expectedVersion/);
});

test("customer ticket detail authorization is rate-limited on public routes", () => {
  const routes = fs.readFileSync(
    path.join(root, "backend/src/routes/publicRoutes.js"),
    "utf8"
  );
  assert.match(routes, /const queueTicketReadLimiter = rateLimit/);
  assert.match(routes, /\["\/tenant\/:tenantSlug\/queue",[\s\S]*?queueTicketReadLimiter,\s*maybeAuthenticate,/);
  assert.match(routes, /"\/ticket\/:lookupCode",\s*queueTicketReadLimiter,\s*maybeAuthenticate,/);
  assert.match(routes, /\["\/tenant\/:tenantSlug\/stream",[\s\S]*?queueTicketReadLimiter,\s*maybeAuthenticate,/);
});

test("all automatic recovery entry points share the same idempotent close command", () => {
  const lifecycle = fs.readFileSync(
    path.join(root, "backend/src/services/queueDayLifecycleService.js"),
    "utf8"
  );
  const worker = fs.readFileSync(
    path.join(root, "backend/src/services/queueLifecycleWorker.js"),
    "utf8"
  );
  assert.match(lifecycle, /closeLockedQueueDay/);
  assert.match(lifecycle, /request_reconciliation/);
  assert.match(lifecycle, /scheduled_reconciliation/);
  assert.match(worker, /reconcileDueQueueDays/);
  assert.match(worker, /expirePendingCarryOvers/);
});

test("close outcomes preserve the one-time carry-over and linked booking contract", () => {
  const lifecycle = fs.readFileSync(
    path.join(root, "backend/src/services/queueDayLifecycleService.js"),
    "utf8"
  );
  assert.match(lifecycle, /nextStatus = "pending_carry_over"/);
  assert.match(lifecycle, /nextStatus = "expired"/);
  assert.match(lifecycle, /nextStatus = "unserved"/);
  assert.match(lifecycle, /bookingStatus = "unfulfilled"/);
  assert.match(lifecycle, /bookingStatus = "missed"/);
  assert.match(lifecycle, /refund_eligible = \$4/);
  assert.doesNotMatch(lifecycle, /draining/);
});

test("paid callbacks remain bound to their checkout Queue Day", () => {
  const service = fs.readFileSync(
    path.join(root, "backend/src/services/queueJoinPaymentService.js"),
    "utf8"
  );
  assert.match(service, /queueDayId: checkoutQueueDay\?\._id/);
  assert.match(service, /payment\.queueDayId/);
  assert.match(service, /markPaidTicketBlocked/);
  assert.match(service, /bound_queue_day_unavailable/);
});

test("platform recovery is separate from routine vendor queue operation", () => {
  const permissions = fs.readFileSync(
    path.join(root, "backend/src/services/permissions.js"),
    "utf8"
  );
  const routes = fs.readFileSync(
    path.join(root, "backend/src/routes/platformRoutes.js"),
    "utf8"
  );
  assert.match(permissions, /platform\.queue_lifecycle\.reconcile/);
  assert.match(permissions, /platform\.queue_notifications\.requeue/);
  assert.match(routes, /queue-lifecycle\/repair\/preview/);
  assert.match(routes, /x-mfa-confirmed/);
});

test("headless smoke covers authoritative queue state across product roles", () => {
  const smoke = fs.readFileSync(
    path.join(root, "scripts/smoke-test.mjs"),
    "utf8"
  );
  assert.match(smoke, /SMOKE_STAGE === "queue"/);
  assert.match(smoke, /Vendor Admin queue lifecycle snapshot/);
  assert.match(smoke, /Vendor Staff queue lifecycle snapshot/);
  assert.match(smoke, /customer queue history/);
  assert.match(smoke, /public queue lifecycle snapshot/);
  assert.match(smoke, /Platform Admin queue lifecycle diagnostics/);
});

test("destructive lifecycle smoke is guarded to disposable databases", () => {
  const smoke = fs.readFileSync(
    path.join(root, "scripts/queue-lifecycle-smoke.mjs"),
    "utf8"
  );
  assert.match(smoke, /\/\(smoke\|test\)\/i/);
  assert.match(smoke, /downtime-and-concurrent-reconciliation/);
  assert.match(smoke, /notification-dead-letter-and-requeue/);
  assert.match(smoke, /DELETE FROM tenants WHERE id = \$1/);
});

test("database rollout scripts preserve explicit environment targets and support Docker psql", () => {
  for (const scriptName of ["db-apply.sh", "db-status.sh", "db-verify-schema.sh"]) {
    const script = fs.readFileSync(path.join(root, "scripts", scriptName), "utf8");
    assert.match(script, /docker compose ps --status running -q database/);
  }
  const apply = fs.readFileSync(path.join(root, "scripts", "db-apply.sh"), "utf8");
  assert.match(apply, /if \[\[ -z "\$\{!key\+x\}" \]\]/);
  const status = fs.readFileSync(path.join(root, "scripts", "db-status.sh"), "utf8");
  assert.doesNotMatch(status, /mapfile/);
});
