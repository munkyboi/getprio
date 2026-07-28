const test = require("node:test");
const assert = require("node:assert/strict");
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
