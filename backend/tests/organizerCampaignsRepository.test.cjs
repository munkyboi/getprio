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

test("campaign joining expires stale claims and creates a fixed fifteen-minute reservation atomically", async () => {
  const calls = [];
  const client = {
    query: async (query, params) => {
      const sql = String(query);
      calls.push({ query: sql, params });
      if (/FROM organizer_campaigns/.test(sql) && /FOR UPDATE/.test(sql)) {
        return { rows: [{ id: 9, required_contributors: 2, deadline_at: new Date("2099-08-20T14:00:00.000Z") }] };
      }
      if (/FROM users/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: [{ id: 8 }] };
      if (/SET contribution_status = 'expired'/.test(sql)) return { rows: [{ id: 11 }] };
      if (/WHERE campaign_id = \$1 AND contributor_user_id = \$2/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: [] };
      if (/COUNT\(\*\)[\s\S]*contributor_user_id/.test(sql)) return { rows: [{ count: 1 }] };
      if (/COUNT\(\*\)[\s\S]*campaign_id/.test(sql)) return { rows: [{ count: 1 }] };
      if (/INSERT INTO organizer_campaign_contributions/.test(sql)) {
        return {
          rows: [{
            id: 15,
            campaign_id: 9,
            contributor_user_id: 8,
            contribution_status: "pending_proof",
            amount_cents: 10000,
            currency: "PHP",
            reservation_expires_at: new Date("2099-08-20T13:15:00.000Z"),
            reservation_attempt_count: 1
          }]
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const repository = requireWithDbMock({
    pool: {},
    withTransaction: async (callback) => callback(client)
  });

  const result = await repository.createContribution({
    campaignId: "9",
    contributorUserId: "8",
    amountCents: 10000
  });

  assert.equal(result.status, "pending_proof");
  assert.equal(result.reservationAttemptCount, 1);
  assert.equal(result.reservationExpiresAt.toISOString(), "2099-08-20T13:15:00.000Z");
  assert.match(calls[2].query, /reservation_expires_at <= NOW\(\)/);
  assert.match(calls.at(-1).query, /LEAST\(NOW\(\) \+ INTERVAL '15 minutes', \$4::timestamptz\)/);
});

test("campaign proof submission expires a pending reservation after its deadline", async () => {
  const calls = [];
  const client = {
    query: async (query) => {
      const sql = String(query);
      calls.push(sql);
      if (/SELECT contributions/.test(sql)) {
        return {
          rows: [{
            id: 15,
            campaign_id: 9,
            contributor_user_id: 8,
            contribution_status: "pending_proof",
            reservation_expires_at: new Date("2026-07-29T00:00:00.000Z"),
            required_contributors: 2
          }]
        };
      }
      if (/SET contribution_status = 'expired'/.test(sql)) return { rows: [{ id: 15 }] };
      return { rows: [{ contribution_status: "submitted" }] };
    }
  };
  const repository = requireWithDbMock({
    pool: {},
    withTransaction: async (callback) => callback(client)
  });

  const result = await repository.submitContributionProof({
    contributionId: "15",
    paymentReference: "PAY-123",
    proof: {
      objectKey: "proofs/15.png",
      fileName: "proof.png",
      contentType: "image/png",
      sizeBytes: 2048
    }
  });

  assert.equal(result, null);
  assert.match(calls[1], /SET contribution_status = 'expired'/);
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
  assert.match(calls[0].query, /AVG\(ratings\.stars\)/);
  assert.match(calls[0].query, /ratings\.subject_user_id = campaigns\.organizer_user_id/);
  assert.match(calls[0].query, /ratings\.moderation_status = 'active'/);
  assert.match(calls[0].query, /\(bookings\.scheduled_start_at AT TIME ZONE store_locations\.timezone\)::date = \$2::date/);
  assert.deepEqual(calls[0].params, ["%Cebu open play%", "2026-08-20", 50]);
});

test("public campaign preview exposes the organizer trust aggregate", async () => {
  const repository = requireWithDbMock({
    pool: {
      query: async () => ({
        rows: [{
          id: 81,
          public_token: "public-token",
          booking_id: 91,
          campaign_status: "collected",
          visibility: "private_link",
          title: "Open play",
          description: "Friendly games.",
          deadline_at: new Date("2026-08-19T14:00:00.000Z"),
          contribution_fee_cents: 10000,
          required_contributors: 8,
          currency: "PHP",
          accepted_contributors: 8,
          filled_contributors: 8,
          organizer_display_name: "Sadie",
          organizer_avatar_url: "https://cdn.example.test/sadie.png",
          organizer_trust_average: 4.4,
          organizer_trust_count: 5,
          scheduled_start_at: new Date("2026-08-20T02:00:00.000Z"),
          scheduled_end_at: new Date("2026-08-20T05:00:00.000Z"),
          tenant_name: "VD Sports Club",
          tenant_slug: "vd-sports-club",
          location_name: "Tulik",
          location_slug: "tulik",
          location_city: "Argao",
          location_province: "Cebu",
          location_timezone: "Asia/Manila",
          service_name: "Pickleball",
          service_slug: "pickleball"
        }]
      })
    }
  });

  const campaign = await repository.findPublicCampaignByToken("public-token");

  assert.deepEqual(campaign.organizerTrustRating, { average: 4.4, count: 5 });
  assert.equal(campaign.scheduledEndAt.toISOString(), "2026-08-20T05:00:00.000Z");
  assert.deepEqual(campaign.location, {
    name: "Tulik",
    slug: "tulik",
    city: "Argao",
    province: "Cebu",
    timezone: "Asia/Manila"
  });
  assert.equal(campaign.organizerAvatarUrl, "https://cdn.example.test/sadie.png");
  assert.equal(campaign.bookingId, "91");
  assert.deepEqual(campaign.vendor, { name: "VD Sports Club", slug: "vd-sports-club" });
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
  assert.match(calls[0].query, /users\.avatar_url AS organizer_avatar_url/);
  assert.deepEqual(calls[0].params, [1]);
  assert.equal(campaign.acceptedContributors, 4);
  assert.equal(campaign.joinedContributors, 4);
  assert.equal(campaign.acceptedAmountCents, 40000);
});

test("organizer contribution list exposes contributor avatars", async () => {
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
            contributor_display_name: "Alex Boyer",
            contributor_avatar_url: "https://cdn.example.test/alex.png",
            contribution_status: "accepted",
            amount_cents: 10000,
            currency: "PHP",
            slot_number: 1
          }]
        };
      }
    }
  });

  const contributions = await repository.listContributionsByCampaign("9");

  assert.match(calls[0].query, /users\.avatar_url AS contributor_avatar_url/);
  assert.deepEqual(calls[0].params, [9]);
  assert.equal(contributions[0].contributorAvatarUrl, "https://cdn.example.test/alex.png");
});

test("organizer rejection releases a proof-less slot without allowing stale proof submission", async () => {
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
            contribution_status: "rejected",
            amount_cents: 10000,
            currency: "PHP",
            resubmission_count: 1
          }]
        };
      }
    }
  });

  const contribution = await repository.reviewContribution({
    contributionId: "15",
    actorUserId: "7",
    decision: "reject",
    rejectionReason: "The participant list changed."
  });

  assert.match(calls[0].query, /\$2 = 'rejected' AND contribution_status IN \('pending_proof', 'submitted', 'review_overdue'\)/);
  assert.match(calls[0].query, /contribution_status = 'pending_proof' AND \$2 = 'rejected' THEN 1/);
  assert.equal(contribution.status, "rejected");
  assert.equal(contribution.resubmissionCount, 1);
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
            organizer_avatar_url: "https://example.com/organizer.jpg",
            organizer_trust_average: 4.4,
            organizer_trust_count: 51,
            tenant_name: "VD Sports Club",
            tenant_slug: "vd-sports-club",
            location_name: "Tulik",
            location_slug: "tulik",
            location_city: "Argao",
            location_province: "Cebu",
            location_timezone: "Asia/Manila",
            scheduled_start_at: new Date("2026-08-20T11:30:00.000Z"),
            scheduled_end_at: new Date("2026-08-20T14:30:00.000Z"),
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
            reserved_contributors: 1,
            under_review_contributors: 0,
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
  assert.match(calls[0].query, /tenants\.name AS tenant_name/);
  assert.match(calls[0].query, /store_locations\.city AS location_city/);
  assert.match(calls[0].query, /bookings\.scheduled_end_at/);
  assert.match(calls[0].query, /store_locations\.timezone AS location_timezone/);
  assert.match(calls[0].query, /AVG\(ratings\.stars\)/);
  assert.deepEqual(calls[0].params, [7]);
  assert.equal(campaigns[0].acceptedContributors, 4);
  assert.equal(campaigns[0].joinedContributors, 4);
  assert.equal(campaigns[0].reservedContributors, 1);
  assert.equal(campaigns[0].acceptedAmountCents, 40000);
  assert.equal(campaigns[0].scheduledEndAt.toISOString(), "2026-08-20T14:30:00.000Z");
  assert.deepEqual(campaigns[0].organizerTrustRating, { average: 4.4, count: 51 });
  assert.deepEqual(campaigns[0].vendor, { name: "VD Sports Club", slug: "vd-sports-club" });
  assert.deepEqual(campaigns[0].location, {
    name: "Tulik",
    slug: "tulik",
    city: "Argao",
    province: "Cebu",
    timezone: "Asia/Manila"
  });
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
