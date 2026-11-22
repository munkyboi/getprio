require("tsx/cjs");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getQueueStateSummary,
  getTicketStateSummary,
  getQueueDaySyncNotice,
  isQueueAcceptingJoins,
  resolveQueueDayState,
  selectFreshestQueueSnapshot
} = require("../src/utils/queueStatus.ts");
const {
  getQueueCustomerDisplayName,
  getQueueCustomerFullNameLabel
} = require("../src/utils/queueNames.ts");

const frontendRoot = path.resolve(__dirname, "..");
const readSource = (relativePath) =>
  fs.readFileSync(path.join(frontendRoot, relativePath), "utf8");

test("queue lifecycle summaries enforce manual opening and terminal outcomes", () => {
  assert.equal(resolveQueueDayState({ state: "unopened", isClosed: true }), "unopened");
  assert.equal(resolveQueueDayState({ state: "open", isClosed: false }), "open");
  assert.equal(resolveQueueDayState({ state: "closed", isClosed: true }), "closed");

  assert.equal(
    isQueueAcceptingJoins({
      queueDay: {
        state: "unopened",
        intakeMode: "closed",
        isClosed: true,
        isPaused: false,
        availabilityReason: "not_opened"
      },
      queueIntake: { state: "closed" }
    }),
    false
  );
  assert.equal(
    isQueueAcceptingJoins({
      queueDay: {
        state: "open",
        intakeMode: "accepting",
        isClosed: false,
        isPaused: false,
        availabilityReason: "accepting"
      },
      queueIntake: { state: "open" }
    }),
    true
  );

  assert.equal(
    getQueueStateSummary({
      queueDay: {
        state: "unopened",
        isClosed: true,
        availabilityReason: "not_opened"
      },
      queueIntake: { state: "closed" },
      location: { openStatus: { isOpen: true } }
    }).label,
    "Not open yet"
  );
  assert.equal(getTicketStateSummary("pending_carry_over").label, "Saved for carry-over");
  assert.equal(getTicketStateSummary("expired").label, "Expired");
  assert.match(getTicketStateSummary("unserved").message, /final/);
});

test("queue customer labels preserve staff identity and public privacy", () => {
  assert.equal(getQueueCustomerDisplayName("Doreen Mills", "Maldita"), "Maldita");
  assert.equal(getQueueCustomerDisplayName("Doreen Mills", "  "), "D***n M***s");
  assert.equal(getQueueCustomerFullNameLabel("Alex Boyer", "LexBoy"), "Alex Boyer (LexBoy)");
  assert.equal(getQueueCustomerFullNameLabel("Alex Boyer", "  "), "Alex Boyer");
});

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

test("vendor queue lifecycle UI exposes warning, extension, and close controls", () => {
  const dashboard = readSource("src/pages/VendorDashboardPage.tsx");
  const tray = readSource("src/components/VendorQueueLifecycleTray.tsx");
  const styles = readSource("src/styles.css");

  assert.match(dashboard, /<VendorQueueLifecycleTray/);
  assert.match(dashboard, /Close queue and reconcile/);
  assert.match(dashboard, /refetchInterval:\s*30_000/);
  assert.match(tray, /Review & extend/);
  assert.match(tray, /Extend \$\{locationName\} by 30 minutes/);
  assert.match(tray, /Close queue now/);
  assert.match(styles, /\.queue-lifecycle-tray/);
  assert.match(styles, /\.queue-auto-close-modal \.mantine-Modal-content/);
});

test("vendor queue UI blocks calling next while a current ticket is unresolved", () => {
  const dashboard = readSource("src/pages/VendorDashboardPage.tsx");

  assert.match(
    dashboard,
    /disabled=\{[\s\S]*?busyAction === "call-next"[\s\S]*?Boolean\(activeTicket\)[\s\S]*?\}/
  );
});

test("vendor overflow identifies tickets saved for carry-over", () => {
  const dashboard = readSource("src/pages/VendorDashboardPage.tsx");

  assert.match(dashboard, /<Title order=\{3\}>Carry-over tickets<\/Title>/);
  assert.match(dashboard, /<Table\.Th>Status<\/Table\.Th>/);
  assert.match(dashboard, /<Table\.Th>Activated at<\/Table\.Th>/);
  assert.match(dashboard, /getTicketStateSummary\(ticket\.status\)\.label/);
  assert.match(dashboard, /:\s*"Carried over"/);
});

test("public and customer queue screens use the authoritative lifecycle state", () => {
  const joinPage = readSource("src/pages/JoinQueuePage.tsx");
  const ticketPage = readSource("src/pages/JoinedQueuePage.tsx");
  const publicBoard = readSource("src/pages/PublicQueuePage.tsx");
  const vendorProfile = readSource("src/pages/VendorProfilePage.tsx");

  assert.match(joinPage, /isQueueAcceptingJoins/);
  assert.match(ticketPage, /apiRequest<QueueSnapshot>\(`\$\{basePath\}\/queue\$\{query\}`,[\s\S]*?token/);
  assert.match(ticketPage, /Carried over/);
  assert.doesNotMatch(publicBoard, /Top tickets are emphasized/);
  assert.match(publicBoard, /public-board-tv-calendar/);
  assert.match(
    vendorProfile,
    /queryKey: \["public-vendor-queue-status", profileSlug, selectedBookingLocationSlug\]/
  );
  assert.match(
    vendorProfile,
    /to=\{selectedBookingLocationSlug \? `\/join\/\$\{vendor\.slug\}\/\$\{selectedBookingLocationSlug\}`/
  );
  assert.match(vendorProfile, /vendor-profile-join-queue-status/);
});

test("payment return does not render an empty ticket shell while sync awaits a ticket", () => {
  const ticketPage = readSource("src/pages/JoinedQueuePage.tsx");

  assert.match(ticketPage, /const \[paymentSyncPending, setPaymentSyncPending\] = useState\(false\);/);
  assert.match(ticketPage, /setPaymentSyncPending\(true\);/);
  assert.match(ticketPage, /setPaymentSyncPending\(false\);/);
  assert.match(ticketPage, /if \(shouldAwaitPaymentSync && !lookupCode\) \{/);
  assert.match(ticketPage, /Payment confirmation is still pending/);
  assert.match(ticketPage, /Refresh payment status/);
});
