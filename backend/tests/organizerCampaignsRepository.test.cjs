const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function requireWithDbMock(mockDb) {
  const targetPath = require.resolve("../src/repositories/organizerCampaigns.js");
  const dbPath = require.resolve("../src/config/db.js");
  const original = require.cache[dbPath];

  try {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: mockDb };
    delete require.cache[targetPath];
    return require(targetPath);
  } finally {
    delete require.cache[targetPath];
    if (original) require.cache[dbPath] = original;
    else delete require.cache[dbPath];
  }
}

test("organizer campaign repository creates a campaign linked to an already confirmed booking", async () => {
  const calls = [];
  const repository = requireWithDbMock({
    pool: {
      query: async (query, params) => {
        calls.push({ query: String(query), params });
        assert.match(String(query), /INSERT INTO organizer_campaigns/);
        assert.match(String(query), /booking_id/);
        return {
          rows: [{
            id: 81,
            public_token: params[0],
            booking_id: params[1],
            organizer_user_id: params[2],
            campaign_status: params[3],
            visibility: params[4],
            title: params[5],
            description: params[6],
            deadline_at: params[7],
            contribution_fee_cents: params[8],
            required_contributors: params[9],
            payment_instructions: params[10],
            currency: "PHP",
            created_at: new Date("2026-07-19T00:00:00.000Z"),
            updated_at: new Date("2026-07-19T00:00:00.000Z")
          }]
        };
      }
    }
  });

  const campaign = await repository.createCampaign({
    bookingId: 50,
    organizerUserId: 9,
    title: "Team booking",
    description: "Please contribute before the deadline.",
    deadlineAt: "2026-07-22T08:00:00.000Z",
    contributionFeeCents: 50000,
    requiredContributors: 3,
    paymentInstructions: "Send via the organizer's QR code."
  });

  assert.equal(calls.length, 1);
  assert.equal(campaign.id, "81");
  assert.equal(campaign.bookingId, "50");
  assert.equal(campaign.organizerUserId, "9");
  assert.equal(campaign.status, repository.CAMPAIGN_STATUSES.DRAFT);
  assert.equal(campaign.contributionFeeCents, 50000);
});

test("organizer campaign discovery searches campaign, organizer, vendor, and branch address", async () => {
  const calls = [];
  const repository = requireWithDbMock({
    pool: {
      query: async (query, params) => {
        calls.push({ query: String(query), params });
        return { rows: [] };
      }
    }
  });

  await repository.listPublicCampaigns({ search: "Cebu open play", date: "2026-08-20" });

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /campaigns\.title ILIKE \$1/);
  assert.match(calls[0].query, /users\.display_name/);
  assert.match(calls[0].query, /tenants\.name ILIKE \$1/);
  assert.match(calls[0].query, /store_locations\.address_line1/);
  assert.match(calls[0].query, /store_locations\.city/);
  assert.match(calls[0].query, /store_locations\.province/);
  assert.match(calls[0].query, /\(bookings\.scheduled_start_at AT TIME ZONE store_locations\.timezone\)::date = \$2::date/);
  assert.deepEqual(calls[0].params, ["%Cebu open play%", "2026-08-20", 50]);
});

test("organizer campaign contribution lookup returns join-order slot and safe proof metadata", async () => {
  const calls = [];
  const repository = requireWithDbMock({
    pool: {
      query: async (query, params) => {
        calls.push({ query: String(query), params });
        return {
          rows: [{
            id: 15,
            campaign_id: 9,
            contributor_user_id: 8,
            contribution_status: "submitted",
            amount_cents: 10000,
            currency: "PHP",
            payment_reference: "PAY-123",
            payment_proof_object_key: "private/campaigns/9/proof.png",
            payment_proof_file_name: "proof.png",
            payment_proof_content_type: "image/png",
            payment_proof_size_bytes: 2048,
            submitted_at: new Date("2026-07-28T04:00:00.000Z"),
            created_at: new Date("2026-07-28T03:00:00.000Z"),
            updated_at: new Date("2026-07-28T04:00:00.000Z"),
            slot_number: 3
          }]
        };
      }
    }
  });

  const contribution = await repository.findContributionByCampaignAndUser("9", "8");

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /ROW_NUMBER\(\) OVER \(PARTITION BY campaign_id ORDER BY created_at ASC, id ASC\)/);
  assert.match(calls[0].query, /WHERE ranked\.campaign_id = \$1 AND ranked\.contributor_user_id = \$2/);
  assert.deepEqual(calls[0].params, [9, 8]);
  assert.equal(contribution.slotNumber, 3);
  assert.deepEqual(contribution.paymentProof, {
    fileName: "proof.png",
    contentType: "image/png",
    sizeBytes: 2048
  });
  assert.equal("objectKey" in contribution.paymentProof, false);
});

test("organizer campaign detail includes campaign-wide contribution aggregates", async () => {
  const calls = [];
  const repository = requireWithDbMock({
    pool: {
      query: async (query, params) => {
        calls.push({ query: String(query), params });
        return {
          rows: [{
            id: 1,
            public_token: "share-token",
            booking_id: 42,
            organizer_user_id: 7,
            organizer_display_name: "Organizer",
            campaign_status: "collecting",
            visibility: "private_link",
            title: "Open play",
            description: "",
            deadline_at: new Date("2026-08-19T14:00:00.000Z"),
            contribution_fee_cents: 10000,
            required_contributors: 8,
            payment_instructions: "Pay directly",
            currency: "PHP",
            accepted_contributors: 4,
            joined_contributors: 4,
            accepted_amount_cents: 40000
          }]
        };
      }
    }
  });

  const campaign = await repository.findCampaignById("1");

  assert.match(calls[0].query, /accepted_contributors/);
  assert.match(calls[0].query, /joined_contributors/);
  assert.match(calls[0].query, /accepted_amount_cents/);
  assert.deepEqual(calls[0].params, [1]);
  assert.equal(campaign.acceptedContributors, 4);
  assert.equal(campaign.joinedContributors, 4);
  assert.equal(campaign.acceptedAmountCents, 40000);
});

test("customer campaign list includes campaign-wide contribution aggregates", async () => {
  const calls = [];
  const repository = requireWithDbMock({
    pool: {
      query: async (query, params) => {
        calls.push({ query: String(query), params });
        return {
          rows: [{
            id: 1,
            public_token: "share-token",
            booking_id: 42,
            organizer_user_id: 7,
            organizer_display_name: "Organizer",
            campaign_status: "collecting",
            visibility: "private_link",
            title: "Open play",
            description: "",
            deadline_at: new Date("2026-08-19T14:00:00.000Z"),
            contribution_fee_cents: 10000,
            required_contributors: 8,
            payment_instructions: "Pay directly",
            currency: "PHP",
            accepted_contributors: 4,
            joined_contributors: 4,
            accepted_amount_cents: 40000
          }]
        };
      }
    }
  });

  const campaigns = await repository.listCampaignsForCustomer("7");

  assert.match(calls[0].query, /accepted_contributors/);
  assert.match(calls[0].query, /joined_contributors/);
  assert.match(calls[0].query, /accepted_amount_cents/);
  assert.deepEqual(calls[0].params, [7]);
  assert.equal(campaigns[0].acceptedContributors, 4);
  assert.equal(campaigns[0].joinedContributors, 4);
  assert.equal(campaigns[0].acceptedAmountCents, 40000);
});

test("campaign history includes the actor display name", async () => {
  const calls = [];
  const repository = requireWithDbMock({
    pool: {
      query: async (query, params) => {
        calls.push({ query: String(query), params });
        return {
          rows: [{
            id: 10,
            event_type: "contributor_joined",
            actor_role: "customer",
            actor_display_name: "Alex Boyer",
            source: "account",
            metadata: {},
            created_at: new Date("2026-07-29T04:48:45.000Z")
          }]
        };
      }
    }
  });

  const events = await repository.listEventsByCampaign("1");

  assert.match(calls[0].query, /LEFT JOIN users/);
  assert.match(calls[0].query, /actor_display_name/);
  assert.deepEqual(calls[0].params, [1]);
  assert.equal(events[0].actorDisplayName, "Alex Boyer");
});
