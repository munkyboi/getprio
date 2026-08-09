const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getWarningPhase,
  resolveEffectiveStoreInterval
} = require("../src/services/queueDayTime");

function weeklyHours(overrides) {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: "09:00",
    closesAt: "17:00",
    isClosed: true,
    ...overrides[weekday]
  }));
}

test("resolves same-day effective hours in the location timezone", () => {
  const interval = resolveEffectiveStoreInterval({
    now: new Date("2026-07-31T04:00:00.000Z"),
    timezone: "Asia/Manila",
    hours: weeklyHours({ 5: { isClosed: false } })
  });
  assert.equal(interval.businessDate, "2026-07-31");
  assert.equal(interval.opensAt.toISOString(), "2026-07-31T01:00:00.000Z");
  assert.equal(interval.closesAt.toISOString(), "2026-07-31T09:00:00.000Z");
});

test("an overnight interval retains the opening date as its business date", () => {
  const interval = resolveEffectiveStoreInterval({
    now: new Date("2026-07-31T17:30:00.000Z"),
    timezone: "Asia/Manila",
    hours: weeklyHours({
      5: { opensAt: "22:00", closesAt: "02:00", isClosed: false }
    })
  });
  assert.equal(interval.businessDate, "2026-07-31");
  assert.equal(interval.isOvernight, true);
  assert.equal(interval.closesAt.toISOString(), "2026-07-31T18:00:00.000Z");
});

test("equal opening and closing times represent a 24-hour interval", () => {
  const interval = resolveEffectiveStoreInterval({
    now: new Date("2026-07-31T12:00:00.000Z"),
    timezone: "Asia/Manila",
    hours: weeklyHours({
      5: { opensAt: "00:00", closesAt: "00:00", isClosed: false }
    })
  });
  assert.equal(interval.isTwentyFourHours, true);
  assert.equal(
    interval.closesAt.getTime() - interval.opensAt.getTime(),
    24 * 60 * 60 * 1000
  );
});

test("closed and missing-hour days do not produce an eligible interval", () => {
  assert.equal(resolveEffectiveStoreInterval({
    now: new Date("2026-07-31T04:00:00.000Z"),
    timezone: "Asia/Manila",
    hours: weeklyHours({})
  }), null);
});

test("an extended queue day re-enters warning before its new deadline", () => {
  const now = new Date("2026-07-31T08:50:00.000Z");
  assert.equal(getWarningPhase({
    state: "open",
    currentClosesAt: "2026-07-31T09:00:00.000Z",
    deadlineVersion: 1
  }, now), "warning");
  assert.equal(getWarningPhase({
    state: "open",
    currentClosesAt: "2026-07-31T09:00:00.000Z",
    deadlineVersion: 2
  }, now), "warning");
  assert.equal(getWarningPhase({
    state: "open",
    currentClosesAt: "2026-07-31T09:20:00.000Z",
    deadlineVersion: 2
  }, now), "extended");
  assert.equal(getWarningPhase({
    state: "open",
    currentClosesAt: "2026-07-31T08:49:59.000Z",
    deadlineVersion: 2
  }, now), "overdue");
});
