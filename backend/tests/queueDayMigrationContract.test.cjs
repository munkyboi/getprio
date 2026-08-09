const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
function readMigration(name) {
  return fs.readFileSync(path.join(root, "database", "migrations", name), "utf8");
}

test("Queue Day migrations are additive and install the authoritative lock row", () => {
  const foundation = readMigration("20260731_01_add_queue_day_lifecycle_foundation.sql");
  assert.match(foundation, /CREATE TABLE IF NOT EXISTS queue_days/);
  assert.match(foundation, /UNIQUE \(tenant_id, location_id, business_date\)/);
  assert.match(foundation, /state IN \('unopened', 'open', 'closed'\)/);
  assert.match(foundation, /queue_lifecycle_mode IN \('legacy', 'shadow', 'enforced'\)/);
  assert.doesNotMatch(foundation, /DROP TABLE queue_day_closures/);
});

test("ticket and booking status constraints are reconciled by definition", () => {
  const lifecycle = readMigration("20260731_02_expand_queue_ticket_booking_lifecycle.sql");
  assert.match(lifecycle, /conkey @> ARRAY/);
  assert.match(lifecycle, /attname = 'status'/);
  assert.match(lifecycle, /'pending_carry_over'/);
  assert.match(lifecycle, /'expired'/);
  assert.match(lifecycle, /'unfulfilled'/);
  assert.match(lifecycle, /'missed'/);
  assert.match(lifecycle, /CREATE TABLE IF NOT EXISTS queue_ticket_segments/);
});

test("events and notification intents have durable idempotency keys", () => {
  const events = readMigration("20260731_03_expand_queue_events_and_add_outbox.sql");
  assert.match(events, /queue_events_event_key_idx/);
  assert.match(events, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(events, /'pending', 'processing', 'retry', 'sent', 'dead', 'obsolete'/);
});

test("staff access is backfilled without revoking legacy location access", () => {
  const access = readMigration("20260731_04_add_queue_location_assignments_and_payments.sql");
  assert.match(access, /CREATE TABLE IF NOT EXISTS tenant_membership_locations/);
  assert.match(access, /membership\.role = 'staff'/);
  assert.match(access, /'legacy_backfill'/);
  assert.match(access, /ticket_issuance_status IN \('pending', 'issued', 'blocked', 'refund_pending'\)/);
});

test("the backfill is bounded, checkpointed, and anomaly preserving", () => {
  const script = fs.readFileSync(
    path.join(root, "scripts", "queue-lifecycle-backfill.mjs"),
    "utf8"
  );
  assert.match(script, /QUEUE_LIFECYCLE_BACKFILL_BATCH/);
  assert.match(script, /QUEUE_LIFECYCLE_BACKFILL_RUN_ID/);
  assert.match(script, /last_scope_key/);
  assert.match(script, /LPAD\(tenant_id::text, 20, '0'\)/);
  assert.match(script, /ORDER BY cursor_key/);
  assert.match(script, /queue_lifecycle_migration_anomalies/);
  assert.match(script, /duplicate_daily_sequence/);
  assert.doesNotMatch(script, /customer_email|customer_phone|lookup_code/);
});
