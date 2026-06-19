const test = require("node:test");
const assert = require("node:assert/strict");
const queueLifecycle = require("../src/services/queueLifecycle");

test("queue lifecycle exposes canonical statuses and valid transitions", () => {
  assert.deepEqual(queueLifecycle.CANONICAL_STATUSES, [
    "waiting",
    "called",
    "served",
    "skipped",
    "cancelled",
    "unserved"
  ]);

  assert.equal(queueLifecycle.isValidTransition("waiting", "called"), true);
  assert.equal(queueLifecycle.isValidTransition("called", "served"), true);
  assert.equal(queueLifecycle.isValidTransition("called", "skipped"), true);
  assert.equal(queueLifecycle.isValidTransition("skipped", "waiting"), true);
  assert.equal(queueLifecycle.isValidTransition("unserved", "waiting"), true);
  assert.equal(queueLifecycle.isValidTransition("served", "waiting"), false);
  assert.equal(queueLifecycle.isValidTransition("cancelled", "waiting"), false);
  assert.equal(queueLifecycle.isValidTransition("waiting", "served"), false);
});

test("queue lifecycle throws on invalid transitions", () => {
  assert.throws(
    () => queueLifecycle.assertValidTransition("served", "waiting"),
    /Invalid ticket transition/
  );

  assert.throws(
    () => queueLifecycle.assertValidTransition("waiting", "served"),
    /Invalid ticket transition/
  );
});

test("queue lifecycle builds timestamp patches for lifecycle statuses", () => {
  const now = new Date("2026-06-05T00:00:00.000Z");

  assert.deepEqual(queueLifecycle.buildLifecycleTimestampPatch("called", now), {
    calledAt: now
  });
  assert.deepEqual(queueLifecycle.buildLifecycleTimestampPatch("served", now), {
    servedAt: now
  });
  assert.deepEqual(queueLifecycle.buildLifecycleTimestampPatch("cancelled", now), {
    cancelledAt: now
  });
  assert.deepEqual(queueLifecycle.buildLifecycleTimestampPatch("unserved", now), {
    unservedAt: now
  });
});

test("queue lifecycle limits current-ticket resolution statuses", () => {
  assert.doesNotThrow(() => queueLifecycle.assertSupportedCurrentTicketResolution("served"));
  assert.doesNotThrow(() => queueLifecycle.assertSupportedCurrentTicketResolution("skipped"));
  assert.doesNotThrow(() => queueLifecycle.assertSupportedCurrentTicketResolution("cancelled"));
  assert.doesNotThrow(() => queueLifecycle.assertSupportedCurrentTicketResolution("unserved"));

  assert.throws(
    () => queueLifecycle.assertSupportedCurrentTicketResolution("waiting"),
    /Unsupported ticket status update/
  );
});
