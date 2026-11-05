require("tsx/cjs");

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getCampaignFunding,
  selectActiveCustomerCampaign,
  selectActiveCustomerTicket,
  selectNextCustomerBooking,
  selectRecentCustomerActivity
} = require("../src/utils/customerDashboard.ts");

function booking(overrides = {}) {
  return {
    id: "1",
    serviceName: "Pickleball Court",
    tenantName: "Rally Pickleball",
    status: "confirmed",
    scheduledStartAt: "2026-07-30T05:00:00.000Z",
    scheduledEndAt: "2026-07-30T06:00:00.000Z",
    updatedAt: "2026-07-28T03:00:00.000Z",
    ...overrides
  };
}

function ticket(overrides = {}) {
  return {
    id: "1",
    lookupCode: "ABC123",
    ticketNumber: "A-003",
    tenantName: "Rally Pickleball",
    tenantSlug: "rally-pickleball",
    locationName: "BGC Sports Complex",
    locationSlug: "bgc",
    status: "waiting",
    createdAt: "2026-07-28T01:00:00.000Z",
    updatedAt: "2026-07-28T04:00:00.000Z",
    ...overrides
  };
}

function campaign(overrides = {}) {
  return {
    id: "1",
    status: "collecting",
    deadlineAt: "2026-07-31T14:00:00.000Z",
    contributionFeeCents: 10000,
    requiredContributors: 8,
    acceptedContributors: 5,
    currency: "PHP",
    ...overrides
  };
}

test("selectNextCustomerBooking ignores past and canceled bookings", () => {
  const selected = selectNextCustomerBooking([
    booking({ id: "past", scheduledStartAt: "2026-07-20T05:00:00.000Z", scheduledEndAt: "2026-07-20T06:00:00.000Z" }),
    booking({ id: "canceled", status: "canceled", scheduledStartAt: "2026-07-29T05:00:00.000Z", scheduledEndAt: "2026-07-29T06:00:00.000Z" }),
    booking({ id: "later", scheduledStartAt: "2026-08-01T05:00:00.000Z", scheduledEndAt: "2026-08-01T06:00:00.000Z" }),
    booking({ id: "next" })
  ], new Date("2026-07-28T00:00:00.000Z"));

  assert.equal(selected.id, "next");
});

test("selectActiveCustomerTicket returns the latest waiting or called ticket", () => {
  const selected = selectActiveCustomerTicket([
    ticket({ id: "served", status: "served", updatedAt: "2026-07-28T06:00:00.000Z" }),
    ticket({ id: "waiting-old", updatedAt: "2026-07-28T02:00:00.000Z" }),
    ticket({ id: "called-new", status: "called", updatedAt: "2026-07-28T05:00:00.000Z" })
  ]);

  assert.equal(selected.id, "called-new");
});

test("selectActiveCustomerCampaign prioritizes refund work before collecting", () => {
  const selected = selectActiveCustomerCampaign([
    campaign({ id: "collecting" }),
    campaign({ id: "cancelled", status: "cancelled" }),
    campaign({ id: "refund", status: "refund_pending" })
  ]);

  assert.equal(selected.id, "refund");
});

test("getCampaignFunding uses accepted amount and caps the progress bar", () => {
  assert.deepEqual(
    getCampaignFunding(campaign({ acceptedAmountCents: 90000 })),
    {
      acceptedContributors: 5,
      fundedAmountCents: 90000,
      targetAmountCents: 80000,
      progressPercent: 100
    }
  );
});

test("selectRecentCustomerActivity returns the newest booking or ticket event", () => {
  const activity = selectRecentCustomerActivity(
    [booking()],
    [ticket({ updatedAt: "2026-07-28T05:00:00.000Z" })]
  );

  assert.equal(activity.kind, "ticket");
  assert.equal(activity.path, "/join/rally-pickleball/bgc?ticket=ABC123");
});
