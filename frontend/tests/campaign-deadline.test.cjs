const test = require("node:test");
const assert = require("node:assert/strict");

require("tsx/cjs");
const {
  formatCampaignDeadlineDate,
  getCampaignDeadlineBounds,
  resolveCampaignDeadline
} = require("../src/components/CampaignDeadlinePicker.tsx");

test("campaign deadline resolves the selected Manila date to 10:00 PM", () => {
  assert.equal(resolveCampaignDeadline("2026-07-20"), "2026-07-20T14:00:00.000Z");
  assert.equal(formatCampaignDeadlineDate("2026-07-20T14:00:00.000Z"), "2026-07-20");
});

test("campaign deadline allows today only while its 10:00 PM cutoff is still future", () => {
  const now = new Date("2026-07-19T13:30:00.000Z");
  const bookingStart = new Date("2026-07-21T05:00:00.000Z");
  const bounds = getCampaignDeadlineBounds(bookingStart, now);

  assert.equal(bounds.min, "2026-07-19");
  assert.equal(bounds.max, "2026-07-20");
  assert.equal(bounds.hasValidWindow, true);
});

test("campaign deadline moves the minimum date to tomorrow once 10:00 PM arrives", () => {
  const bounds = getCampaignDeadlineBounds(
    new Date("2026-07-21T05:00:00.000Z"),
    new Date("2026-07-19T14:00:00.000Z")
  );

  assert.equal(bounds.min, "2026-07-20");
  assert.equal(bounds.max, "2026-07-20");
  assert.equal(bounds.hasValidWindow, true);
});

test("campaign deadline may use the booking date when the booking starts after 10:00 PM", () => {
  const bounds = getCampaignDeadlineBounds(
    new Date("2026-07-20T15:00:00.000Z"),
    new Date("2026-07-19T01:00:00.000Z")
  );

  assert.equal(bounds.max, "2026-07-20");
});

test("campaign deadline reports no window when the booking is too close", () => {
  const bounds = getCampaignDeadlineBounds(
    new Date("2026-07-20T01:00:00.000Z"),
    new Date("2026-07-19T14:00:00.000Z")
  );

  assert.equal(bounds.hasValidWindow, false);
});
