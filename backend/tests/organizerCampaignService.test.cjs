const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function futureIso(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function futureManilaCutoffDate(days = 1) {
  const manila = new Date(Date.now() + 8 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000);
  const year = manila.getUTCFullYear();
  const month = String(manila.getUTCMonth() + 1).padStart(2, "0");
  const day = String(manila.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadService(mocks) {
  const target = require.resolve("../src/services/organizerCampaignService.js");
  const originals = new Map();
  const isolatedMocks = {
    "../repositories/ratings": { getUserTrustAggregate: async () => null },
    ...mocks
  };
  for (const [request, exports] of Object.entries(isolatedMocks)) {
    const resolved = require.resolve(request, { paths: [path.dirname(target)] });
    originals.set(resolved, require.cache[resolved]);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  }
  try {
    delete require.cache[target];
    return require(target);
  } finally {
    delete require.cache[target];
    for (const [resolved, original] of originals) {
      if (original) require.cache[resolved] = original;
      else delete require.cache[resolved];
    }
  }
}

test("organizer campaign service only creates a campaign from the customer's paid confirmed booking", async () => {
  const created = [];
  const scheduledStartAt = "2099-07-21T05:00:00.000Z";
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: true, scheduledStartAt }) },
    "../repositories/organizerCampaigns": { createCampaign: async (input) => { created.push(input); return input; }, listCampaignsForOrganizer: async () => [], findCampaignById: async () => null },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  const result = await service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42, title: "Team session", description: "Share the cost.", deadlineAt: "2099-07-20", contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions: "Use my QR code."
  } });
  assert.equal(created.length, 1);
  assert.equal(created[0].deadlineAt, "2099-07-20T14:00:00.000Z");
  assert.equal(result.bookingId, 42);
  assert.equal(result.organizerUserId, "7");
  assert.equal(result.scheduledStartAt, scheduledStartAt);
});

test("organizer campaign service rejects a deadline outside the fixed 10:00 PM Manila cutoff", async () => {
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: true, scheduledStartAt: "2099-07-21T05:00:00.000Z" }) },
    "../repositories/organizerCampaigns": { createCampaign: async (input) => input },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await assert.rejects(() => service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42, title: "Team session", description: "Share the cost.", deadlineAt: "2099-07-20T13:00:00.000Z", contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions: "Use my QR code."
  } }), {
    message: "Campaign deadline must use the 10:00 PM Asia/Manila cutoff.",
    statusCode: 400
  });
});

test("organizer campaign service rejects an invalid campaign deadline date", async () => {
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: true, scheduledStartAt: "2099-03-05T05:00:00.000Z" }) },
    "../repositories/organizerCampaigns": { createCampaign: async (input) => input },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await assert.rejects(() => service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42, title: "Team session", description: "Share the cost.", deadlineAt: "2099-02-31", contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions: "Use my QR code."
  } }), {
    message: "Campaign deadline must be a valid date.",
    statusCode: 400
  });
});

test("organizer campaign discovery rejects an impossible booking date", async () => {
  const service = loadService({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {},
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await assert.rejects(
    () => service.listPublicCampaigns({ search: "Cebu", date: "2026-02-31" }),
    { message: "Invalid date filter.", statusCode: 400 }
  );
});

test("organizer campaign service rejects a cutoff that is not strictly future", async () => {
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: true, scheduledStartAt: "2099-03-05T05:00:00.000Z" }) },
    "../repositories/organizerCampaigns": { createCampaign: async (input) => input },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await assert.rejects(() => service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42, title: "Team session", description: "Share the cost.", deadlineAt: "2000-01-01", contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions: "Use my QR code."
  } }), {
    message: "Campaign deadline must be in the future.",
    statusCode: 400
  });
});

test("organizer campaign service rejects a cutoff equal to the booking start", async () => {
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: true, scheduledStartAt: "2099-07-20T14:00:00.000Z" }) },
    "../repositories/organizerCampaigns": { createCampaign: async (input) => input },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await assert.rejects(() => service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42, title: "Team session", description: "Share the cost.", deadlineAt: "2099-07-20", contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions: "Use my QR code."
  } }), {
    message: "Campaign deadline must be before the booking starts.",
    statusCode: 400
  });
});

test("organizer campaign service enforces the fixed cutoff when a draft is updated", async () => {
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ scheduledStartAt: "2099-07-21T05:00:00.000Z" }) },
    "../repositories/organizerCampaigns": {
      CAMPAIGN_STATUSES: { DRAFT: "draft" },
      findCampaignById: async () => ({ id: "9", bookingId: "42", organizerUserId: "7", status: "draft" }),
      listContributionsByCampaign: async () => [],
      listReimbursementsByCampaign: async () => [],
      listEventsByCampaign: async () => [],
      updateDraftCampaign: async (input) => input
    },
    "../repositories/ratings": { getUserTrustAggregate: async () => null },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await assert.rejects(() => service.updateCampaign({ user: { _id: "7" }, campaignId: "9", body: {
    title: "Team session", description: "Share the cost.", deadlineAt: "2099-07-20T13:00:00.000Z", contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions: "Use my QR code."
  } }), {
    message: "Campaign deadline must use the 10:00 PM Asia/Manila cutoff.",
    statusCode: 400
  });
});

test("organizer campaign service accepts simple rich text based on visible description length", async () => {
  const created = [];
  const description = `<p>${"<strong>a</strong>".repeat(80)}</p>`;
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: true, scheduledStartAt: futureIso(48) }) },
    "../repositories/organizerCampaigns": { createCampaign: async (input) => { created.push(input); return input; } },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42, title: "Team session", description, deadlineAt: futureManilaCutoffDate(), contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions: "Use my QR code."
  } });

  assert.equal(created[0].description, description);
});

test("organizer campaign service safely stores simple rich text payment instructions", async () => {
  const created = [];
  const paymentInstructions = '<p><strong>GCash:</strong> 09171234567</p><script>alert("unsafe")</script>';
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: true, scheduledStartAt: futureIso(48) }) },
    "../repositories/organizerCampaigns": { createCampaign: async (input) => { created.push(input); return input; } },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42, title: "Team session", description: "Share the cost.", deadlineAt: futureManilaCutoffDate(), contributionFeeCents: 50000, requiredContributors: 3, paymentInstructions
  } });

  assert.equal(created[0].paymentInstructions, "<p><strong>GCash:</strong> 09171234567</p>");
});

test("organizer campaign service rejects a booking that is not vendor-validated and paid", async () => {
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "pending", paymentStatus: "unpaid" }) },
    "../repositories/organizerCampaigns": {},
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  await assert.rejects(() => service.createCampaign({ user: { _id: "7" }, body: { bookingId: 42 } }), { statusCode: 409 });
});

test("organizer campaign service requires the booking-time campaign opt-in", async () => {
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", status: "confirmed", paymentStatus: "paid", organizerCampaignOptIn: false }) },
    "../repositories/organizerCampaigns": {},
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  await assert.rejects(() => service.createCampaign({ user: { _id: "7" }, body: { bookingId: 42 } }), { statusCode: 409 });
});

test("organizer campaign response includes its isolated booking summary and hides empty ratings in the UI contract", async () => {
  const service = loadService({
    "../repositories/bookings": {
      findBookingById: async () => ({
        _id: "42",
        reference: "BKG-TEST42",
        tenantName: "Vendor One",
        tenantSlug: "vendor-one",
        locationName: "Main branch",
        locationSlug: "main-branch",
        locationAddress: "123 Sample Street, Cebu City, Cebu",
        locationTimezone: "Asia/Manila",
        scheduledStartAt: "2099-07-21T05:00:00.000Z",
        scheduledEndAt: "2099-07-21T07:00:00.000Z",
        bundleItems: [{
          id: "81",
          serviceId: "3",
          serviceName: "Court 1",
          serviceSlug: "court-1",
          imageUrl: "https://example.test/court-1.jpg",
          bookingQuantity: 2,
          scheduledStartAt: "2099-07-21T05:00:00.000Z",
          scheduledEndAt: "2099-07-21T07:00:00.000Z"
        }]
      })
    },
    "../repositories/organizerCampaigns": {
      findCampaignById: async () => ({ id: "9", bookingId: "42", organizerUserId: "7", organizerDisplayName: "Alex Organizer", status: "collecting" }),
      listContributionsByCampaign: async () => [],
      listReimbursementsByCampaign: async () => [],
      listEventsByCampaign: async () => [],
      listNotices: async () => []
    },
    "../repositories/ratings": { getUserTrustAggregate: async () => ({ average: 0, count: 0 }) },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  const result = await service.getCampaignForCustomer({ user: { _id: "7" }, campaignId: "9" });

  assert.equal(result.organizerDisplayName, "Alex Organizer");
  assert.deepEqual(result.organizerTrustRating, { average: 0, count: 0 });
  assert.equal(result.booking.reference, "BKG-TEST42");
  assert.equal(result.booking.locationSlug, "main-branch");
  assert.equal(result.booking.locationAddress, "123 Sample Street, Cebu City, Cebu");
  assert.equal(result.booking.locationTimezone, "Asia/Manila");
  assert.equal(result.booking.bundleItems[0].bookingQuantity, 2);
  assert.equal(result.booking.bundleItems[0].imageUrl, "https://example.test/court-1.jpg");
});

test("organizer campaign service publishes a generic public link only with vendor opt-in and within the public cap", async () => {
  const published = [];
  const service = loadService({
    "../repositories/bookings": { findBookingById: async () => ({ customerUserId: "7", tenantId: "1", locationId: "2", serviceId: "3", status: "confirmed", paymentStatus: "paid", scheduledStartAt: futureIso(48) }) },
    "../repositories/organizerCampaigns": {
      CAMPAIGN_STATUSES: { DRAFT: "draft", COLLECTING: "collecting" },
      findCampaignById: async () => ({ id: "9", bookingId: "42", organizerUserId: "7", status: "draft", deadlineAt: new Date(`${futureManilaCutoffDate()}T22:00:00+08:00`).toISOString() }),
      countActivePublicCampaignsForOrganizer: async () => 1,
      publishCampaign: async (input) => { published.push(input); return { ...input, id: "9", status: "collecting" }; }
    },
    "../repositories/locationServices": { findLocationServiceByLocationAndServiceId: async () => ({ groupFunded: { allowPublicCampaigns: true } }) },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  const result = await service.publishCampaign({ user: { _id: "7" }, campaignId: "9", visibility: "public" });
  assert.equal(published.length, 1);
  assert.equal(published[0].visibility, "public");
  assert.equal(result.status, "collecting");
});

test("unpublishing preserves the booking schedule needed to edit the deadline", async () => {
  const scheduledStartAt = futureIso(48);
  const service = loadService({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {
      CAMPAIGN_STATUSES: { DRAFT: "draft", COLLECTING: "collecting" },
      findCampaignById: async () => ({ id: "9", organizerUserId: "7", status: "collecting", scheduledStartAt }),
      unpublishCampaign: async () => ({ id: "9", organizerUserId: "7", status: "draft" })
    },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  const result = await service.unpublishCampaign({ user: { _id: "7" }, campaignId: "9" });

  assert.equal(result.status, "draft");
  assert.equal(result.scheduledStartAt, scheduledStartAt);
});

test("organizer campaign service reserves one contributor slot and rejects organizer self-joining", async () => {
  const created = [];
  const service = loadService({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {
      CAMPAIGN_STATUSES: { COLLECTING: "collecting" },
      findCampaignById: async () => ({ id: "9", organizerUserId: "7", status: "collecting", deadlineAt: futureIso(24), contributionFeeCents: 50000 }),
      createContribution: async (input) => { created.push(input); return input; }
    },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  const contribution = await service.joinCampaign({ user: { _id: "8" }, campaignId: "9", body: { website: "" } });
  assert.equal(contribution.amountCents, 50000);
  assert.equal(created[0].contributorUserId, "8");
  await assert.rejects(() => service.joinCampaign({ user: { _id: "7" }, campaignId: "9", body: {} }), { statusCode: 409 });
});

test("organizer campaign service publishes a real-time change after campaign audit events", async () => {
  const published = [];
  const scheduledStartAt = "2099-07-21T05:00:00.000Z";
  const service = loadService({
    "../repositories/bookings": {
      findBookingById: async () => ({
        _id: "42",
        customerUserId: "7",
        status: "confirmed",
        paymentStatus: "paid",
        organizerCampaignOptIn: true,
        scheduledStartAt
      })
    },
    "../repositories/organizerCampaigns": {
      createCampaign: async (input) => ({ id: "9", publicToken: "share-token", ...input }),
      recordEvent: async () => ({ id: "event-1" })
    },
    "./organizerCampaignEvents": {
      publish: (campaignId, payload) => published.push({ campaignId, payload })
    },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });

  await service.createCampaign({ user: { _id: "7" }, body: {
    bookingId: 42,
    title: "Team session",
    description: "Share the cost.",
    deadlineAt: "2099-07-20",
    contributionFeeCents: 50000,
    requiredContributors: 3,
    paymentInstructions: "Use my QR code."
  } });

  assert.deepEqual(published, [{
    campaignId: "9",
    payload: { eventType: "campaign_created" }
  }]);
});

test("organizer campaign service only accepts proof from a joined contributor", async () => {
  const service = loadService({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {
      CAMPAIGN_STATUSES: { COLLECTING: "collecting" }, CONTRIBUTION_STATUSES: { PENDING_PROOF: "pending_proof", REJECTED: "rejected" },
      findCampaignById: async () => ({ id: "9", status: "collecting", deadlineAt: futureIso(24) }),
      findContributionByCampaignAndUser: async () => ({ id: "5", status: "pending_proof" }),
      submitContributionProof: async (input) => ({ id: "5", ...input })
    },
    "./paymentProofStorageService": { uploadGroupFundedBinary: async () => ({ proof: { objectKey: "proof-key", fileName: "proof.png", contentType: "image/png", sizeBytes: 10 } }) },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  const result = await service.uploadContributionProofDirect({ user: { _id: "8" }, campaignId: "9", body: { paymentReference: "TX-1" }, fileBuffer: Buffer.from("proof") });
  assert.equal(result.paymentReference, "TX-1");
});

test("organizer campaign service lets only the organizer accept submitted proof", async () => {
  const service = loadService({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {
      CAMPAIGN_STATUSES: { COLLECTING: "collecting" },
      findCampaignById: async () => ({ id: "9", organizerUserId: "7", status: "collecting" }),
      findContributionById: async () => ({ id: "5", campaignId: "9", status: "submitted" }),
      reviewContribution: async (input) => ({ ...input, status: "accepted" })
    },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  const result = await service.reviewContribution({ user: { _id: "7" }, campaignId: "9", contributionId: "5", body: { decision: "accept" } });
  assert.equal(result.status, "accepted");
});

test("campaign cancellation creates refund obligations instead of immediately completing when contributions were accepted", async () => {
  const events = [];
  const service = loadService({
    "../repositories/bookings": {},
    "../repositories/organizerCampaigns": {
      CAMPAIGN_STATUSES: { DRAFT: "draft", COLLECTING: "collecting", COLLECTED: "collected" },
      findCampaignById: async () => ({ id: "9", organizerUserId: "7", status: "collecting" }),
      listAcceptedContributions: async () => [{ id: "5", contributorUserId: "8", amountCents: 50000 }],
      beginCancellation: async () => ({ id: "9", status: "refund_pending" }),
      markContributionRefundPending: async () => events.push("refund_pending"),
      createReimbursement: async () => events.push("reimbursement")
    },
    "./contentModeration": { assertPublicTextFieldsAllowed: () => {} }
  });
  const campaign = await service.cancelCampaign({ user: { _id: "7" }, campaignId: "9", body: { reason: "Schedule changed" } });
  assert.equal(campaign.status, "refund_pending");
  assert.deepEqual(events.sort(), ["refund_pending", "reimbursement"]);
});
