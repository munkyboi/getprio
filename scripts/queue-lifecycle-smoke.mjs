#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const databaseUrlText = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrlText) {
  throw new Error("DATABASE_URL is required.");
}
const databaseUrl = new URL(databaseUrlText);
const databaseName = databaseUrl.pathname.replace(/^\//, "");
if (!/(smoke|test)/i.test(databaseName)) {
  throw new Error(
    "Queue lifecycle smoke requires a disposable database whose name contains smoke or test."
  );
}

const require = createRequire(import.meta.url);
const db = require("../backend/src/config/db");
const queueDays = require("../backend/src/repositories/queueDays");
const outbox = require("../backend/src/repositories/queueNotificationOutbox");
const lifecycle = require("../backend/src/services/queueDayLifecycleService");

const runKey = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const tenantSlug = `queue-lifecycle-smoke-${runKey}`;
let tenantId = null;

function isoDateInTimeZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function createFixture() {
  return db.withTransaction(async (client) => {
    const tenant = await client.query(
      `INSERT INTO tenants (name, slug, queue_prefix)
       VALUES ('Queue Lifecycle Smoke', $1, 'Q')
       RETURNING id, name, slug, queue_prefix`,
      [tenantSlug]
    );
    const location = await client.query(
      `INSERT INTO store_locations (
         tenant_id, name, slug, timezone, is_primary, queue_lifecycle_mode
       )
       VALUES ($1, 'Main', 'main', 'Asia/Manila', TRUE, 'enforced')
       RETURNING id, tenant_id, name, slug, timezone`,
      [tenant.rows[0].id]
    );
    await client.query(
      `INSERT INTO store_hours (location_id, weekday, opens_at, closes_at, is_closed)
       SELECT $1, weekday, '00:00', '00:00', FALSE
       FROM generate_series(0, 6) AS weekday`,
      [location.rows[0].id]
    );
    return {
      tenant: {
        _id: String(tenant.rows[0].id),
        name: tenant.rows[0].name,
        slug: tenant.rows[0].slug,
        queuePrefix: tenant.rows[0].queue_prefix
      },
      location: {
        _id: String(location.rows[0].id),
        tenantId: String(location.rows[0].tenant_id),
        name: location.rows[0].name,
        slug: location.rows[0].slug,
        timezone: location.rows[0].timezone
      }
    };
  });
}

async function insertTicket({
  fixture,
  queueDay,
  sequence,
  status,
  priorityBand = "normal",
  carryOverConsumed = false,
  carryOverExpiresAt = null,
  withSegment = true
}) {
  const queueDateKey = String(queueDay.businessDate).replaceAll("-", "");
  const inserted = await db.pool.query(
    `INSERT INTO tickets (
       tenant_id, location_id, ticket_number, sequence, date_key, queue_date_key,
       lookup_code, customer_name, customer_email, status,
       service_priority_band, carry_over_consumed, carry_over_expires_at,
       original_queue_day_id, current_queue_day_id
     )
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      Number(fixture.tenant._id),
      Number(fixture.location._id),
      `Q${String(sequence).padStart(3, "0")}`,
      sequence,
      queueDateKey,
      crypto.randomUUID(),
      `Queue Smoke ${sequence}`,
      `queue-smoke-${runKey}-${sequence}@example.invalid`,
      status,
      priorityBand,
      carryOverConsumed,
      carryOverExpiresAt,
      Number(queueDay._id),
      ["waiting", "called", "skipped"].includes(status) ? Number(queueDay._id) : null
    ]
  );
  if (withSegment) {
    await db.pool.query(
      `INSERT INTO queue_ticket_segments (
         ticket_id, queue_day_id, display_number, sequence, priority_band
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        inserted.rows[0].id,
        Number(queueDay._id),
        `Q${String(sequence).padStart(3, "0")}`,
        sequence,
        priorityBand
      ]
    );
  }
  return String(inserted.rows[0].id);
}

async function assertTicketStatus(ticketId, expectedStatus) {
  const result = await db.pool.query(
    "SELECT status, status_reason FROM tickets WHERE id = $1",
    [Number(ticketId)]
  );
  assert.equal(result.rows[0]?.status, expectedStatus);
  return result.rows[0];
}

async function exerciseNotificationRetry(fixture) {
  await db.pool.query(
    `UPDATE queue_notification_outbox
     SET status = 'sent', sent_at = NOW()
     WHERE tenant_id = $1 AND status IN ('pending', 'retry', 'processing')`,
    [Number(fixture.tenant._id)]
  );
  const id = await outbox.enqueue({
    idempotencyKey: `queue-smoke:${runKey}:retry`,
    tenantId: fixture.tenant._id,
    recipientKey: `tenant:${fixture.tenant._id}:queue-admins`,
    channel: "email",
    templateName: "queue_reconciliation_failed"
  });
  assert.ok(id);
  const workerId = `queue-smoke-${runKey}`;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await db.pool.query(
      "UPDATE queue_notification_outbox SET available_at = NOW() - INTERVAL '1 second' WHERE id = $1",
      [Number(id)]
    );
    const claimed = await outbox.claimBatch(workerId, 1);
    assert.equal(String(claimed[0]?.id), String(id));
    await outbox.markRetry(id, workerId, `synthetic failure ${attempt}`);
  }
  const dead = await db.pool.query(
    "SELECT status, attempt_count FROM queue_notification_outbox WHERE id = $1",
    [Number(id)]
  );
  assert.deepEqual(dead.rows[0], { status: "dead", attempt_count: 8 });
  assert.ok(await outbox.requeue(id));
  const requeued = await db.pool.query(
    "SELECT status, last_error FROM queue_notification_outbox WHERE id = $1",
    [Number(id)]
  );
  assert.deepEqual(requeued.rows[0], { status: "pending", last_error: null });
}

async function run() {
  const fixture = await createFixture();
  tenantId = fixture.tenant._id;
  const now = new Date();
  const opened = await lifecycle.openQueueDay(fixture.tenant, fixture.location, { now });
  assert.equal(opened.queueDay.state, "open");
  assert.equal(opened.queueDay.deadlineVersion, 1);
  const snapshottedClose = new Date(opened.queueDay.effectiveClosesAt).toISOString();

  await db.pool.query(
    "UPDATE store_hours SET closes_at = '23:00' WHERE location_id = $1",
    [Number(fixture.location._id)]
  );
  const afterHoursEdit = await queueDays.findById(opened.queueDay._id);
  assert.equal(new Date(afterHoursEdit.effectiveClosesAt).toISOString(), snapshottedClose);

  await db.pool.query(
    `UPDATE queue_days
     SET initial_closes_at = NOW() + INTERVAL '10 minutes',
         current_closes_at = NOW() + INTERVAL '10 minutes'
     WHERE id = $1`,
    [Number(opened.queueDay._id)]
  );
  const warningDay = await queueDays.findById(opened.queueDay._id);
  const warningTransitions = [];
  assert.equal(
    await lifecycle.emitDueWarnings({
      onTransition: async (transition) => warningTransitions.push(transition)
    }),
    1
  );
  assert.equal(await lifecycle.emitDueWarnings(), 0);
  assert.deepEqual(warningTransitions, [{
    tenantId: warningDay.tenantId,
    locationId: warningDay.locationId,
    transition: "warning_15m"
  }]);
  const warningIntent = await db.pool.query(
    `SELECT template_name, deadline_version, status
     FROM queue_notification_outbox
     WHERE queue_day_id = $1 AND template_name = 'queue_closing_15m'`,
    [Number(warningDay._id)]
  );
  assert.deepEqual(warningIntent.rows, [{
    template_name: "queue_closing_15m",
    deadline_version: 1,
    status: "pending"
  }]);
  const previousDeadline = new Date(warningDay.currentClosesAt).getTime();
  const extended = await lifecycle.extendQueueDay(fixture.tenant, fixture.location, {
    expectedVersion: warningDay.version,
    reason: "queue_lifecycle_smoke"
  });
  assert.equal(extended.queueDay.deadlineVersion, 2);
  assert.equal(
    new Date(extended.queueDay.currentClosesAt).getTime() - previousDeadline,
    30 * 60 * 1000
  );

  const freshWaitingId = await insertTicket({
    fixture,
    queueDay: extended.queueDay,
    sequence: 1,
    status: "waiting"
  });
  const calledId = await insertTicket({
    fixture,
    queueDay: extended.queueDay,
    sequence: 2,
    status: "called"
  });
  const skippedId = await insertTicket({
    fixture,
    queueDay: extended.queueDay,
    sequence: 3,
    status: "skipped"
  });
  const carriedWaitingId = await insertTicket({
    fixture,
    queueDay: extended.queueDay,
    sequence: 4,
    status: "waiting",
    priorityBand: "carry_over",
    carryOverConsumed: true
  });
  await db.pool.query(
    "UPDATE queue_days SET next_sequence = 5 WHERE id = $1",
    [Number(extended.queueDay._id)]
  );

  const closed = await lifecycle.closeQueueDay(fixture.tenant, fixture.location, {
    expectedVersion: extended.queueDay.version,
    reason: "smoke_first_close"
  });
  assert.deepEqual(closed.outcomes, {
    pendingCarryOver: 1,
    expired: 1,
    unserved: 1,
    skipped: 1
  });
  await assertTicketStatus(freshWaitingId, "pending_carry_over");
  await assertTicketStatus(calledId, "unserved");
  await assertTicketStatus(skippedId, "skipped");
  await assertTicketStatus(carriedWaitingId, "expired");
  assert.equal(
    (await lifecycle.closeQueueDay(fixture.tenant, fixture.location)).idempotent,
    true
  );

  const reopened = await lifecycle.reopenQueueDay(fixture.tenant, fixture.location, {
    expectedVersion: closed.queueDay.version,
    reason: "smoke_reopen"
  });
  assert.equal(reopened.queueDay.closeReason, null);
  assert.equal(reopened.queueDay.closeSource, null);
  const reclosed = await lifecycle.closeQueueDay(fixture.tenant, fixture.location, {
    expectedVersion: reopened.queueDay.version,
    reason: "smoke_reclose"
  });
  assert.equal(reclosed.queueDay.closeReason, "smoke_reclose");

  await db.pool.query(
    `UPDATE queue_days
     SET business_date = business_date - 1
     WHERE id = $1`,
    [Number(reclosed.queueDay._id)]
  );
  const nextDay = await lifecycle.openQueueDay(fixture.tenant, fixture.location, { now });
  assert.equal(nextDay.activatedCarryOverCount, 1);
  const carried = await assertTicketStatus(freshWaitingId, "waiting");
  assert.equal(carried.status_reason, "carry_over_activated");
  const finalClose = await lifecycle.closeQueueDay(fixture.tenant, fixture.location, {
    expectedVersion: nextDay.queueDay.version,
    reason: "smoke_carry_over_close"
  });
  assert.equal(finalClose.outcomes.expired, 1);
  await assertTicketStatus(freshWaitingId, "expired");

  const pendingExpiryId = await insertTicket({
    fixture,
    queueDay: reclosed.queueDay,
    sequence: 5,
    status: "pending_carry_over",
    carryOverExpiresAt: new Date(Date.now() - 60_000),
    withSegment: false
  });
  assert.equal(await lifecycle.expirePendingCarryOvers(100), 1);
  assert.equal(await lifecycle.expirePendingCarryOvers(100), 0);
  await assertTicketStatus(pendingExpiryId, "expired");

  const secondLocation = await db.pool.query(
    `INSERT INTO store_locations (
       tenant_id, name, slug, timezone, queue_lifecycle_mode
     )
     VALUES ($1, 'Recovery', 'recovery', 'Pacific/Auckland', 'enforced')
     RETURNING id`,
    [Number(fixture.tenant._id)]
  );
  const dueDay = await db.pool.query(
    `INSERT INTO queue_days (
       tenant_id, location_id, business_date, state, intake_mode,
       timezone_snapshot, effective_opens_at, effective_closes_at,
       initial_closes_at, current_closes_at, opened_at
     )
     VALUES (
       $1, $2, $3, 'open', 'accepting', 'Pacific/Auckland',
       NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour',
       NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 minute', NOW() - INTERVAL '2 hours'
     )
     RETURNING id, business_date::text AS business_date`,
    [
      Number(fixture.tenant._id),
      secondLocation.rows[0].id,
      isoDateInTimeZone(now, "Pacific/Auckland")
    ]
  );
  const recoveryFixture = {
    tenant: fixture.tenant,
    location: { ...fixture.location, _id: String(secondLocation.rows[0].id) }
  };
  const dueQueueDay = {
    _id: String(dueDay.rows[0].id),
    businessDate: dueDay.rows[0].business_date
  };
  const downtimeTicketId = await insertTicket({
    fixture: recoveryFixture,
    queueDay: dueQueueDay,
    sequence: 1,
    status: "waiting"
  });
  const concurrent = await Promise.all([
    lifecycle.reconcileDueQueueDays(50),
    lifecycle.reconcileDueQueueDays(50)
  ]);
  assert.equal(concurrent[0] + concurrent[1], 1);
  await assertTicketStatus(downtimeTicketId, "pending_carry_over");
  const closeEventCount = await db.pool.query(
    `SELECT COUNT(*)::INTEGER AS count
     FROM queue_events
     WHERE queue_day_id = $1 AND event_type = 'queue_day_closed'`,
    [dueDay.rows[0].id]
  );
  assert.equal(closeEventCount.rows[0].count, 1);

  await exerciseNotificationRetry(fixture);

  const summary = await db.pool.query(
    `SELECT
       (SELECT COUNT(*)::INTEGER FROM queue_days WHERE tenant_id = $1) AS queue_days,
       (SELECT COUNT(*)::INTEGER FROM queue_events WHERE tenant_id = $1) AS events,
       (SELECT COUNT(*)::INTEGER FROM queue_notification_outbox WHERE tenant_id = $1) AS outbox_intents`,
    [Number(fixture.tenant._id)]
  );
  return {
    database: databaseName,
    tenantSlug,
    ...summary.rows[0],
    scenarios: [
      "manual-open",
      "store-hours-snapshot",
      "warning-delivery-and-extension",
      "atomic-close-outcomes",
      "idempotent-close",
      "reopen-reclose",
      "carry-over-activation-and-expiration",
      "seven-day-pending-expiration",
      "downtime-and-concurrent-reconciliation",
      "notification-dead-letter-and-requeue",
      "cross-timezone-reconciliation"
    ]
  };
}

try {
  const result = await run();
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (tenantId) {
    await db.pool.query("DELETE FROM tenants WHERE id = $1", [Number(tenantId)]);
  }
  await db.pool.end();
}
