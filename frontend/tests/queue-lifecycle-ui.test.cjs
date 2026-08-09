require("tsx/cjs");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getQueueDaySyncNotice,
  selectFreshestQueueSnapshot
} = require("../src/utils/queueStatus.ts");

const frontendRoot = path.resolve(__dirname, "..");
const readSource = (relativePath) =>
  fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");

test("queue snapshots cannot move backward when an older request resolves last", () => {
  const current = { queueDay: { serverNow: "2026-07-31T12:00:30.000Z" }, marker: "current" };
  const stale = { queueDay: { serverNow: "2026-07-31T12:00:00.000Z" }, marker: "stale" };
  const fresh = { queueDay: { serverNow: "2026-07-31T12:01:00.000Z" }, marker: "fresh" };

  assert.equal(selectFreshestQueueSnapshot(current, stale), current);
  assert.equal(selectFreshestQueueSnapshot(current, fresh), fresh);
  assert.equal(selectFreshestQueueSnapshot(null, fresh), fresh);
});

test("queue deadline synchronization distinguishes the acting session from another operator", () => {
  const previous = {
    id: "10",
    state: "open",
    deadlineVersion: 2,
    reconciliationError: null
  };
  const extended = { ...previous, deadlineVersion: 3 };

  assert.equal(
    getQueueDaySyncNotice(previous, extended, {
      kind: "deadline",
      id: "10",
      state: "open",
      deadlineVersion: 3
    }),
    "local_update"
  );
  assert.equal(
    getQueueDaySyncNotice(previous, extended, {
      kind: "state",
      id: "10",
      state: "open",
      deadlineVersion: 3
    }),
    "deadline_updated"
  );
  assert.equal(getQueueDaySyncNotice(previous, extended, null, true), "defer");
  assert.equal(getQueueDaySyncNotice(previous, extended, null), "deadline_updated");
});

test("vendor dashboard refreshes queue lifecycle state while idle", () => {
  const dashboard = readSource("src/pages/VendorDashboardPage.tsx");

  assert.match(dashboard, /vendor-dashboard-queue-lifecycle/);
  assert.match(dashboard, /refetchInterval:\s*30_000/);
});

test("vendor overflow identifies tickets saved for carry-over", () => {
  const dashboard = readSource("src/pages/VendorDashboardPage.tsx");

  assert.match(dashboard, /<Title order=\{3\}>Carry-over tickets<\/Title>/);
  assert.match(dashboard, /<Table\.Th>Status<\/Table\.Th>/);
  assert.match(dashboard, /<Table\.Th>Activated at<\/Table\.Th>/);
  assert.match(dashboard, /getTicketStateSummary\(ticket\.status\)\.label/);
  assert.match(dashboard, /:\s*"Carried over"/);
});
