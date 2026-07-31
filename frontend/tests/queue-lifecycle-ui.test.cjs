require("tsx/cjs");

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getQueueStateSummary,
  getTicketStateSummary,
  isQueueAcceptingJoins,
  resolveQueueDayState
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

test("vendor queue lifecycle UI exposes warning, extension, and close controls", () => {
  const dashboard = readSource("src/pages/VendorDashboardPage.tsx");
  const tray = readSource("src/components/VendorQueueLifecycleTray.tsx");
  const styles = readSource("src/styles.css");

  assert.match(dashboard, /<VendorQueueLifecycleTray/);
  assert.match(dashboard, /Close queue and reconcile/);
  assert.match(tray, /Review & extend/);
  assert.match(tray, /Extend \$\{locationName\} by 30 minutes/);
  assert.match(tray, /Close queue now/);
  assert.match(styles, /\.queue-lifecycle-tray/);
  assert.match(styles, /\.queue-auto-close-modal \.mantine-Modal-content/);
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
