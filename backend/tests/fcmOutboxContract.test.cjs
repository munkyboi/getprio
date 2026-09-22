const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../..");

test("FCM outbox migration preserves leases and adds per-installation delivery state", () => {
  const migration = fs.readFileSync(
    path.join(repositoryRoot, "database/migrations/20260922_01_add_fcm_outbox_channel.sql"),
    "utf8"
  );
  assert.match(migration, /queue_notification_outbox_channel_check/);
  assert.match(migration, /'web_push', 'fcm'/);
  assert.match(migration, /notification_deliveries_channel_check/);
  assert.match(migration, /'web_push', 'fcm'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS mobile_push_outbox_deliveries/);
  assert.match(migration, /PRIMARY KEY \(outbox_id, registration_id\)/);
  assert.match(migration, /status IN \('pending', 'sent', 'stale'\)/);
  assert.match(migration, /lease_owner TEXT/);
  assert.match(migration, /leased_until TIMESTAMPTZ/);
  assert.match(migration, /mobile_push_outbox_deliveries_registration_idx/);
});

test("durable queue lifecycle customer intents include one FCM channel key", () => {
  const lifecycle = fs.readFileSync(
    path.join(repositoryRoot, "backend/src/services/queueDayLifecycleService.js"),
    "utf8"
  );
  const fcmOccurrences = (lifecycle.match(/customer:fcm/g) || []).length;
  assert.equal(fcmOccurrences, 2);
  assert.match(lifecycle, /channel: "fcm"/);
  assert.match(lifecycle, /recipientKey: `user:\$\{ticket\.user_id\}`/);
});
