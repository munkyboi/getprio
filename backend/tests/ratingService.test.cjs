const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function load(mocks) {
  const target = require.resolve("../src/services/ratingService.js"); const originals = new Map();
  for (const [request, exports] of Object.entries(mocks)) { const resolved = require.resolve(request, { paths: [path.dirname(target)] }); originals.set(resolved, require.cache[resolved]); require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports }; }
  try { delete require.cache[target]; return require(target); } finally { delete require.cache[target]; for (const [resolved, original] of originals) { if (original) require.cache[resolved] = original; else delete require.cache[resolved]; } }
}

test("customer can leave one five-star vendor review only after completed service", async () => {
  const created = [];
  const service = load({ "../repositories/bookings": { findBookingById: async () => ({ _id: "4", tenantId: "2", customerUserId: "7", status: "completed" }) }, "../repositories/organizerCampaigns": {}, "../repositories/ratings": { createVendorReview: async (data) => { created.push(data); return data; } }, "./contentModeration": { assertPublicTextFieldsAllowed: () => {} } });
  const rating = await service.rateVendor({ user: { _id: "7" }, bookingId: "4", body: { stars: 5, comment: "Excellent service" } });
  assert.equal(rating.stars, 5); assert.equal(created[0].tenantId, "2");
});

test("registered customer can rate a served queue ticket exactly once", async () => {
  const created = [];
  const ticket = {
    _id: "14",
    tenantId: "2",
    userId: "7",
    status: "served"
  };
  const service = load({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {},
    "../repositories/tickets": {
      findTicketByLookupCode: async () => ticket
    },
    "../repositories/ratings": {
      createVendorReview: async (data) => {
        created.push(data);
        return { id: "21", ...data };
      },
      findVendorReviewByTicketId: async () => null
    },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  const status = await service.getQueueTicketRating({ user: { _id: "7" }, lookupCode: "abcd1234" });
  assert.deepEqual(status, { eligible: true, rating: null });

  const rating = await service.rateQueueTicket({
    user: { _id: "7" },
    lookupCode: "abcd1234",
    body: { stars: 5, comment: "Fast and friendly" }
  });
  assert.equal(rating.ticketId, "14");
  assert.equal(created[0].bookingId, null);
  assert.equal(created[0].tenantId, "2");
  assert.equal(created[0].customerUserId, "7");
});

test("queue ratings reject unregistered ownership and unfinished visits", async () => {
  const loadService = (ticket) => load({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {},
    "../repositories/tickets": { findTicketByLookupCode: async () => ticket },
    "../repositories/ratings": { createVendorReview: async (data) => data },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await assert.rejects(
    () => loadService({ _id: "14", tenantId: "2", userId: null, status: "served" }).rateQueueTicket({
      user: { _id: "7", email: "matching@example.com" },
      lookupCode: "abcd1234",
      body: { stars: 5 }
    }),
    { statusCode: 404 }
  );
  await assert.rejects(
    () => loadService({ _id: "14", tenantId: "2", userId: "7", status: "called" }).rateQueueTicket({
      user: { _id: "7" },
      lookupCode: "abcd1234",
      body: { stars: 5 }
    }),
    { statusCode: 409 }
  );
});

test("queue vendor reviews have a single booking-or-ticket source constraint", () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, "../../database/migrations/20260809_05_add_queue_ticket_vendor_reviews.sql"),
    "utf8"
  );
  const routes = fs.readFileSync(path.resolve(__dirname, "../src/routes/accountRoutes.js"), "utf8");

  assert.match(migration, /ALTER COLUMN booking_id DROP NOT NULL/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS ticket_id BIGINT REFERENCES tickets\(id\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS vendor_reviews_ticket_unique_idx/);
  assert.match(migration, /booking_id IS NOT NULL AND ticket_id IS NULL/);
  assert.match(migration, /booking_id IS NULL AND ticket_id IS NOT NULL/);
  assert.match(routes, /router\.get\("\/tickets\/:lookupCode\/rating"/);
  assert.match(routes, /router\.post\("\/tickets\/:lookupCode\/rating"/);
});

test("one or two-star private trust rating requires a structured reason", async () => {
  const service = load({ "../repositories/bookings": {}, "../repositories/organizerCampaigns": { findCampaignById: async () => ({ id: "9", organizerUserId: "7", status: "collected" }), findContributionById: async () => ({ id: "5", campaignId: "9", contributorUserId: "8", status: "accepted" }) }, "../repositories/ratings": { createTrustRating: async (data) => data }, "./contentModeration": { assertPublicTextFieldsAllowed: () => {} } });
  await assert.rejects(() => service.rateCampaignUser({ user: { _id: "7" }, campaignId: "9", contributionId: "5", body: { stars: 2 } }), { statusCode: 400 });
});

test("only a private trust rating participant can appeal it within 30 days", async () => {
  const created = [];
  const repository = {
    findTrustRatingById: async () => ({ id: "3", rater_user_id: "7", subject_user_id: "8", created_at: new Date().toISOString() }),
    createDispute: async (data) => { created.push(data); return data; }
  };
  const service = load({ "../repositories/bookings": {}, "../repositories/organizerCampaigns": {}, "../repositories/ratings": repository, "./contentModeration": { assertPublicTextFieldsAllowed: () => {} } });
  await assert.rejects(() => service.disputeRating({ user: { _id: "9" }, body: { ratingType: "user_trust", ratingId: "3", reason: "Incorrect" } }), { statusCode: 404 });
  await service.disputeRating({ user: { _id: "8" }, body: { ratingType: "user_trust", ratingId: "3", reason: "Incorrect" } });
  assert.equal(created[0].reporterUserId, "8");
});
