const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAllowedHistoryExportRanges,
  shouldEnableVendorDashboardBootstrap
} = require("../src/lib/vendorDashboardBootstrap.js");

test("vendor dashboard bootstrap does not require a location slug before it can load billing", () => {
  assert.equal(shouldEnableVendorDashboardBootstrap("token-1", "picklebois"), true);
  assert.equal(shouldEnableVendorDashboardBootstrap("token-1", ""), false);
  assert.equal(shouldEnableVendorDashboardBootstrap("", "picklebois"), false);
});

test("vendor dashboard bootstrap stays off while privileged MFA enrollment is required", () => {
  assert.equal(shouldEnableVendorDashboardBootstrap("token-1", "picklebois", true), false);
});

test("missing history export ranges cannot crash the dashboard after MFA enrollment", () => {
  assert.deepEqual(getAllowedHistoryExportRanges(undefined), []);
  assert.deepEqual(getAllowedHistoryExportRanges({ allowedHistoryExportRanges: undefined }), []);
  assert.deepEqual(
    getAllowedHistoryExportRanges({ allowedHistoryExportRanges: ["today", "month"] }),
    ["today", "month"]
  );
});

const { getPeriodTicketMetric: readPeriodMetric } = require("../src/lib/vendorDashboardBootstrap.js");
const getPeriodTicketMetric = (usage, failed = false) => readPeriodMetric(usage, failed, Date.parse("2026-10-14T16:00:00Z"));
const monthlyUsage = {
  usageAvailable: true,
  observedAt: "2026-10-14T15:57:15.097Z",
  period: { start: "2026-10-11T16:31:21.376Z", end: "2026-11-11T16:31:21.376Z" },
  resources: { queueTickets: { limit: 5000, used: 18, observedUsed: 18 } },
  stats: { servedToday: 1 }
};

test("period metric uses canonical usage, not the daily count or unaccounted diagnostics", () => {
  assert.equal(getPeriodTicketMetric(monthlyUsage).value, "18/5,000");
  assert.equal(getPeriodTicketMetric({ ...monthlyUsage, resources: {
    queueTickets: { limit: 5, used: 5, observedUsed: 18, unaccountedUsed: 18 }
  } }).value, "5/5");
  assert.match(getPeriodTicketMetric(monthlyUsage).detail, /Across all locations/);
});

test("unknown, failed and expired billing usage never falls back to a daily count or zero", () => {
  for (const usage of [undefined, { ...monthlyUsage, usageAvailable: false },
    { ...monthlyUsage, period: null },
    { ...monthlyUsage, observedAt: monthlyUsage.period.end },
    { ...monthlyUsage, observedAt: "2026-10-01T00:00:00Z" },
    { ...monthlyUsage, resources: { queueTickets: { limit: 5000, used: null } } }]) {
    assert.equal(getPeriodTicketMetric(usage).value, "Usage unavailable");
  }
  assert.equal(getPeriodTicketMetric(monthlyUsage, true).value, "Usage unavailable");
});

test("authoritative zero usage is distinct from unavailable usage", () => {
  assert.equal(getPeriodTicketMetric({ ...monthlyUsage, resources: {
    queueTickets: { limit: 5000, used: 0 }
  } }).value, "0/5,000");
});

test("a cached valid observation cannot label an ended period as current", () => {
  assert.equal(readPeriodMetric(monthlyUsage, false, Date.parse(monthlyUsage.period.end)).value, "Usage unavailable");
});
