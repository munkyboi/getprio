const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateMonthlyPeriod } = require("../src/services/allowanceService");

test("monthly allowance periods preserve a month-end activation anchor", () => {
  assert.deepEqual(
    calculateMonthlyPeriod(
      new Date("2026-01-31T10:00:00.000Z"),
      new Date("2026-02-15T00:00:00.000Z")
    ),
    {
      start: new Date("2026-01-31T10:00:00.000Z"),
      end: new Date("2026-02-28T10:00:00.000Z")
    }
  );
  assert.deepEqual(
    calculateMonthlyPeriod(
      new Date("2026-01-31T10:00:00.000Z"),
      new Date("2026-03-15T00:00:00.000Z")
    ),
    {
      start: new Date("2026-02-28T10:00:00.000Z"),
      end: new Date("2026-03-31T10:00:00.000Z")
    }
  );
});
