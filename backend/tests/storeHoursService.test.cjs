const test = require("node:test");
const assert = require("node:assert/strict");

const { getOpenStatus } = require("../src/services/storeHoursService");

function weeklyHours(overrides = {}) {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: "09:00",
    closesAt: "17:00",
    isClosed: true,
    ...overrides[weekday]
  }));
}

test("legacy store hours keep the prior day's overnight interval open after midnight", async () => {
  const status = await getOpenStatus(
    { _id: "location-1", timezone: "Asia/Manila" },
    {
      now: new Date("2026-09-01T17:00:00.000Z"),
      hours: weeklyHours({
        2: { opensAt: "22:00", closesAt: "02:00", isClosed: false }
      })
    }
  );

  assert.equal(status.isOpen, true);
});

test("a later overnight interval does not open early on its starting date", async () => {
  const status = await getOpenStatus(
    { _id: "location-1", timezone: "Asia/Manila" },
    {
      now: new Date("2026-09-01T17:00:00.000Z"),
      hours: weeklyHours({
        3: { opensAt: "22:00", closesAt: "02:00", isClosed: false }
      })
    }
  );

  assert.equal(status.isOpen, false);
});
