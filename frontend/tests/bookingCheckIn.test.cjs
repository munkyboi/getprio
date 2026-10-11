require("tsx/cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MantineProvider } = require("@mantine/core");
const { getBookingCheckInState } = require("../src/utils/bookingCheckIn.ts");
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
  assert.match(notice({ now: start - 16 * minute }), /Check-in opens 15 minutes before the booking/);
  assert.doesNotMatch(notice(), /role="alert"/);
});

test("arrived and terminal bookings do not get check-in or rescheduling guidance", () => {
  for (const changes of [{ checkedInAt: new Date(start).toISOString() }, { linkedTicket: { id: "9" } },
    ...["pending", "canceled", "completed"].map(status => ({ status }))]) {
    const current = { ...booking, ...changes };
    assert.equal(getBookingCheckInState(current, start + 16 * minute).isAwaitingCheckIn, false);
    assert.doesNotMatch(notice({ booking: current, now: start + 16 * minute, queueBlocked: true }), /role="alert"/);
  }
});
