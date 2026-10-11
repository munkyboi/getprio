require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MantineProvider } = require("@mantine/core");
const { getBookingCheckInState } = require("../src/utils/bookingCheckIn.ts");
const { formatBookingScheduleDateTime } = require("../src/utils/dates.ts");
const { BookingCheckInNotice } = require("../src/components/BookingCheckInNotice.tsx");

const start = Date.parse("2026-10-11T04:00:00Z");
const booking = { scheduledStartAt: new Date(start).toISOString(), status: "confirmed", checkedInAt: null, linkedTicket: null };
const minute = 60_000;
function notice(overrides = {}) {
  return renderToStaticMarkup(React.createElement(MantineProvider, null,
    React.createElement(BookingCheckInNotice, { booking, now: start, canReschedule: true,
      queueBlocked: false, queueGuidance: "Open the queue before checking in customers.", ...overrides })));
}

test("check-in includes both window boundaries and closes immediately after the late boundary", () => {
  assert.equal(getBookingCheckInState(booking, start - 15 * minute - 1).isTooEarly, true);
  assert.equal(getBookingCheckInState(booking, start - 15 * minute).isTooEarly, false);
  assert.equal(getBookingCheckInState(booking, start + 15 * minute).isLate, false);
  assert.equal(getBookingCheckInState(booking, start + 15 * minute + 1).isLate, true);
  assert.equal(getBookingCheckInState({ ...booking, scheduledStartAt: "invalid" }, start).isTooEarly, true);
});

test("missed-window notice takes priority over queue closure and follows reschedule permissions", () => {
  for (const status of ["confirmed", "rescheduled"]) {
    const markup = notice({ booking: { ...booking, status }, now: start + 16 * minute, queueBlocked: true });
    assert.match(markup, /Check-in window missed/);
    assert.match(markup, /Reschedule this booking to choose a new time/);
    assert.doesNotMatch(markup, /Open the queue/);
  }
  assert.match(notice({ now: start + 16 * minute, canReschedule: false }), /Ask a vendor admin to reschedule/);
});

test("closed and early check-in guidance is inline and absent when ready", () => {
  assert.match(notice({ queueBlocked: true }), /role="alert"[\s\S]*Open the queue before checking in customers/);
  assert.match(notice({ now: start - 16 * minute }), /Check-in not open yet/);
  assert.doesNotMatch(notice(), /role="alert"/);
});

test("October 20 booking has no check-in action on October 11 and displays its opening time", () => {
  const futureBooking = { ...booking, scheduledStartAt: "2026-10-20T04:00:00Z" };
  const now = Date.parse("2026-10-11T04:00:00Z");
  const state = getBookingCheckInState(futureBooking, now);
  assert.equal(state.isWindowOpen, false);
  assert.equal(state.opensAt, "2026-10-20T03:45:00.000Z");
  const markup = notice({ booking: futureBooking, now, queueBlocked: true });
  assert.match(markup, /Check-in not open yet/);
  assert.ok(markup.includes(`Check-in opens ${formatBookingScheduleDateTime(state.opensAt)}, 15 minutes before the booking.`));
  assert.doesNotMatch(markup, /Open the queue/);
  assert.equal(getBookingCheckInState(futureBooking, Date.parse(state.opensAt)).isWindowOpen, true);
  assert.equal(getBookingCheckInState(futureBooking, Date.parse("2026-10-20T04:15:00.001Z")).isWindowOpen, false);
  assert.equal(getBookingCheckInState({ ...futureBooking, scheduledStartAt: "invalid" }, now).isWindowOpen, false);
  assert.match(notice({ booking: { ...futureBooking, scheduledStartAt: "invalid" }, now }), /booking schedule is unavailable/);
});

test("arrived and terminal bookings do not get check-in or rescheduling guidance", () => {
  for (const changes of [{ checkedInAt: new Date(start).toISOString() }, { linkedTicket: { id: "9" } },
    ...["pending", "canceled", "completed"].map(status => ({ status }))]) {
    const current = { ...booking, ...changes };
    assert.equal(getBookingCheckInState(current, start + 16 * minute).isAwaitingCheckIn, false);
    assert.doesNotMatch(notice({ booking: current, now: start + 16 * minute, queueBlocked: true }), /role="alert"/);
  }
});

test("successful rescheduling refreshes matching open details with the server response", async () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const ts = require("typescript");
  const source = fs.readFileSync(require("node:path").join(__dirname, "../src/pages/VendorDashboardPage.tsx"), "utf8");
  const startAt = source.indexOf("  async function handleRescheduleBooking(");
  const endAt = source.indexOf("  async function handleCheckInBooking(", startAt);
  const script = ts.transpileModule(source.slice(startAt, endAt) + "\nhandleRescheduleBooking;", {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const updated = { ...booking, id: "1", reference: "BKG-1", status: "rescheduled", scheduledStartAt: new Date(start + 60 * minute).toISOString() };
  for (const detailId of ["1", "2"]) {
    let details = { ...booking, id: detailId };
    let list = [{ ...booking, id: "1" }];
    let dialogOpen = true;
    const noop = () => {};
    const handler = vm.runInNewContext(script, {
      reschedulingBooking: { id: "1" }, rescheduleStartAt: updated.scheduledStartAt,
      token: "fixture", selectedTenantSlug: "fixture",
      vendorDashboardBookings: { rescheduleBooking: async () => ({ booking: updated }) },
      setBookingDetailBooking: fn => { details = fn(details); },
      setVendorBookings: fn => { list = fn(list); },
      setRescheduleDialogOpen: value => { dialogOpen = value; },
      setBusyAction: noop, setError: noop, clearBookingAlert: noop, setReschedulingBooking: noop,
      setRescheduleDate: noop, setRescheduleStartAt: noop, setRescheduleSlots: noop,
      reloadBookings: async () => {}, reloadDashboardSnapshot: async () => {},
      showSuccessNotification: noop, getErrorMessage: error => error.message
    });
    await handler({ preventDefault: noop });
    assert.equal(dialogOpen, false);
    assert.equal(list[0], updated);
    if (detailId === "1") {
      assert.equal(details, updated);
      assert.equal(getBookingCheckInState(details, start + 16 * minute).isLate, false);
    } else {
      assert.equal(details.id, "2");
      assert.equal(details.scheduledStartAt, booking.scheduledStartAt);
    }
  }
});
