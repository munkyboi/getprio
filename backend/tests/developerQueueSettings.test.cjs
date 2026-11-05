const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDeveloperQueueSettings } = require("../src/utils/developerQueueSettings");

test("developer queue settings derive the requested defaults", () => {
  assert.deepEqual(normalizeDeveloperQueueSettings({}, "main-service"), {
    queuePrefix: "MAIN",
    averageServiceMinutes: 15,
    notificationThreshold: 2
  });
});

test("developer queue settings accept explicit values and partial updates", () => {
  assert.deepEqual(normalizeDeveloperQueueSettings({ queue_prefix: "desk", average_service_minutes: "20", notification_threshold: 4 }, "main"), {
    queuePrefix: "DESK",
    averageServiceMinutes: 20,
    notificationThreshold: 4
  });
  assert.deepEqual(normalizeDeveloperQueueSettings({ notificationThreshold: 5 }, "main", { partial: true }), { notificationThreshold: 5 });
});

test("developer queue settings reject values outside the API contract", () => {
  assert.throws(() => normalizeDeveloperQueueSettings({ queuePrefix: "TOOLONG" }, "main"), /queuePrefix/);
  assert.throws(() => normalizeDeveloperQueueSettings({ averageServiceMinutes: 0 }, "main"), /averageServiceMinutes/);
  assert.throws(() => normalizeDeveloperQueueSettings({ notificationThreshold: 11 }, "main"), /notificationThreshold/);
});
