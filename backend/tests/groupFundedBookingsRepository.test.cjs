const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function resolveMockPath(requestPath, baseDir) {
  if (!requestPath.startsWith(".")) {
    return require.resolve(requestPath, { paths: [baseDir] });
  }

  const absoluteBase = path.resolve(baseDir, requestPath);
  const candidates = [
    absoluteBase,
    `${absoluteBase}.js`,
    `${absoluteBase}.ts`,
    path.join(absoluteBase, "index.js"),
    path.join(absoluteBase, "index.ts")
  ];

  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`Unable to resolve mock path: ${requestPath}`);
}

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const originals = new Map();

  try {
    for (const [requestPath, mockExports] of Object.entries(mocks)) {
      const resolvedDependency = resolveMockPath(requestPath, path.dirname(resolvedTarget));
      originals.set(resolvedDependency, require.cache[resolvedDependency]);
      require.cache[resolvedDependency] = {
        id: resolvedDependency,
        filename: resolvedDependency,
        loaded: true,
        exports: mockExports
      };
    }

    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedDependency, originalEntry] of originals.entries()) {
      if (originalEntry) {
        require.cache[resolvedDependency] = originalEntry;
      } else {
        delete require.cache[resolvedDependency];
      }
    }
  }
}

function campaignRow(overrides = {}) {
  return {
    id: 100,
    public_token: "campaign-token",
    tenant_id: 1,
    location_id: 2,
    service_id: 3,
    location_service_id: 4,
    organizer_user_id: 5,
    linked_booking_id: null,
    campaign_status: "vendor_review",
    visibility: "private_link",
    organizer_display_name: "Carlo A.",
    campaign_title: "Team consultation",
    description: "Team session",
    service_name_snapshot: "Consultation",
    service_slug_snapshot: "consultation",
    location_name_snapshot: "Main",
    location_slug_snapshot: "main",
    booking_quantity: 2,
    scheduled_start_at: new Date("2026-07-20T02:00:00.000Z"),
    scheduled_end_at: new Date("2026-07-20T03:00:00.000Z"),
    funding_deadline_at: new Date("2026-07-18T02:00:00.000Z"),
    currency: "PHP",
    target_amount_cents: 150000,
    required_contribution_amount_cents: 50000,
    rounding_adjustment_cents: 0,
    required_contributors: 3,
    paid_participant_count: 3,
    funded_amount_cents: 150000,
    funded_at: new Date("2026-07-18T01:00:00.000Z"),
    vendor_review_started_at: new Date("2026-07-18T01:05:00.000Z"),
    vendor_review_expires_at: new Date("2026-07-19T01:05:00.000Z"),
    confirmed_at: null,
    canceled_at: null,
    cancellation_reason: null,
    eligibility_snapshot: { groupFundedEnabled: true },
    created_at: new Date("2026-07-12T00:00:00.000Z"),
    updated_at: new Date("2026-07-12T00:00:00.000Z"),
    ...overrides
  };
}

function capacityHoldRow(overrides = {}) {
  return {
    id: 600,
    campaign_id: 100,
    group_funded_booking_item_id: null,
    tenant_id: 1,
    location_id: 2,
    service_id: 3,
    scheduled_start_at: new Date("2026-07-20T02:00:00.000Z"),
    scheduled_end_at: new Date("2026-07-20T03:00:00.000Z"),
    booking_quantity: 2,
    hold_status: "active",
    expires_at: new Date("2026-07-19T01:05:00.000Z"),
    released_at: null,
    converted_booking_id: null,
    created_at: new Date("2026-07-18T01:05:00.000Z"),
    updated_at: new Date("2026-07-18T01:05:00.000Z"),
    ...overrides
  };
}

function refundRow(overrides = {}) {
  return {
    id: 700,
    campaign_id: 100,
    contribution_id: 200,
    user_id: 5,
    amount_cents: 50000,
    currency: "PHP",
    refund_reason: "vendor_rejected",
    refund_status: "pending",
    vendor_actor_user_id: null,
    notes: null,
    evidence_object_key: null,
    evidence_file_name: null,
    evidence_content_type: null,
    evidence_size_bytes: null,
    completed_at: null,
    created_at: new Date("2026-07-18T01:05:00.000Z"),
    updated_at: new Date("2026-07-18T01:05:00.000Z"),
    ...overrides
  };
}

test("group-funded repository creates campaign records without inserting normal bookings", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query: String(query), params });
          assert.doesNotMatch(String(query), /INSERT INTO bookings\b/);
          assert.match(String(query), /INSERT INTO group_funded_bookings/);
          return {
            rows: [
              {
                id: 100,
                public_token: params[0],
                tenant_id: params[1],
                location_id: params[2],
                service_id: params[3],
                location_service_id: params[4],
                organizer_user_id: params[5],
                linked_booking_id: null,
                campaign_status: params[6],
                visibility: params[7],
                organizer_display_name: params[8],
                campaign_title: params[9],
                description: params[10],
                service_name_snapshot: params[11],
                service_slug_snapshot: params[12],
                location_name_snapshot: params[13],
                location_slug_snapshot: params[14],
                booking_quantity: params[15],
                scheduled_start_at: params[16],
                scheduled_end_at: params[17],
                funding_deadline_at: params[18],
                currency: params[19],
                target_amount_cents: params[20],
                required_contribution_amount_cents: params[21],
                rounding_adjustment_cents: params[22],
                required_contributors: params[23],
                paid_participant_count: 0,
                funded_amount_cents: 0,
                funded_at: null,
                vendor_review_started_at: null,
                vendor_review_expires_at: null,
                confirmed_at: null,
                canceled_at: null,
                cancellation_reason: null,
                eligibility_snapshot: JSON.parse(params[24]),
                created_at: new Date("2026-07-12T00:00:00.000Z"),
                updated_at: new Date("2026-07-12T00:00:00.000Z")
              }
            ]
          };
        }
      }
    }
  });

  const campaign = await repository.createCampaign({
    publicToken: "campaign-token",
    tenantId: 1,
    locationId: 2,
    serviceId: 3,
    locationServiceId: 4,
    organizerUserId: 5,
    organizerDisplayName: "Carlo A.",
    serviceNameSnapshot: "Consultation",
    serviceSlugSnapshot: "consultation",
    locationNameSnapshot: "Main",
    locationSlugSnapshot: "main",
    scheduledStartAt: "2026-07-20T02:00:00.000Z",
    scheduledEndAt: "2026-07-20T03:00:00.000Z",
    fundingDeadlineAt: "2026-07-18T02:00:00.000Z",
    targetAmountCents: 150000,
    requiredContributionAmountCents: 50000,
    requiredContributors: 3,
    eligibilitySnapshot: { groupFundedEnabled: true }
  });

  assert.equal(calls.length, 1);
  assert.equal(campaign._id, "100");
  assert.equal(campaign.linkedBookingId, null);
  assert.equal(campaign.campaignStatus, repository.CAMPAIGN_STATUSES.FUNDING);
  assert.deepEqual(campaign.eligibilitySnapshot, { groupFundedEnabled: true });
});

test("group-funded repository prefers organizer profile display name over campaign snapshot", async () => {
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          assert.match(sql, /LEFT JOIN users organizer/);
          assert.match(sql, /COALESCE\(NULLIF\(organizer\.display_name/);
          assert.equal(params[0], 100);
          return {
            rows: [
              campaignRow({
                organizer_display_name: "John S.",
                organizer_profile_display_name: "John S."
              })
            ]
          };
        }
      }
    }
  });

  const campaign = await repository.findCampaignById(100);

  assert.equal(campaign.organizerDisplayName, "John S.");
  assert.equal(campaign.organizerProfileDisplayName, "John S.");
});

test("group-funded repository creates and lists campaign bundle items", async () => {
  const calls = [];
  const itemRow = {
    id: 700,
    campaign_id: 100,
    tenant_id: 1,
    location_id: 2,
    service_id: 3,
    location_service_id: 4,
    service_name_snapshot: "VIP Court",
    service_slug_snapshot: "vip-court",
    booking_quantity: 1,
    price_amount_cents: 120000,
    currency: "PHP",
    execution_mode: "parallel",
    scheduled_start_at: new Date("2026-07-20T02:00:00.000Z"),
    scheduled_end_at: new Date("2026-07-20T03:00:00.000Z"),
    sort_order: 0,
    created_at: new Date("2026-07-12T00:00:00.000Z"),
    updated_at: new Date("2026-07-12T00:00:00.000Z")
  };
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          calls.push({ query: sql, params });

          if (sql.includes("INSERT INTO group_funded_booking_items")) {
            return {
              rows: [{
                ...itemRow,
                campaign_id: params[0],
                tenant_id: params[1],
                location_id: params[2],
                service_id: params[3],
                location_service_id: params[4],
                service_name_snapshot: params[5],
                service_slug_snapshot: params[6],
                booking_quantity: params[7],
                price_amount_cents: params[8],
                currency: params[9],
                execution_mode: params[10],
                scheduled_start_at: params[11],
                scheduled_end_at: params[12],
                sort_order: params[13]
              }]
            };
          }

          if (sql.includes("WHERE campaign_id = ANY")) {
            assert.deepEqual(params, [[100]]);
            return { rows: [itemRow] };
          }

          throw new Error(`Unexpected query: ${sql}`);
        }
      }
    }
  });

  const item = await repository.createCampaignItem({
    campaignId: 100,
    tenantId: 1,
    locationId: 2,
    serviceId: 3,
    locationServiceId: 4,
    serviceNameSnapshot: "VIP Court",
    serviceSlugSnapshot: "vip-court",
    bookingQuantity: 1,
    priceAmountCents: 120000,
    currency: "PHP",
    executionMode: "parallel",
    scheduledStartAt: "2026-07-20T02:00:00.000Z",
    scheduledEndAt: "2026-07-20T03:00:00.000Z",
    sortOrder: 0
  });
  const items = await repository.listCampaignItemsByCampaignIds([100]);

  assert.equal(item.serviceSlugSnapshot, "vip-court");
  assert.equal(item.priceAmountCents, 120000);
  assert.equal(items.length, 1);
  assert.equal(items[0].serviceNameSnapshot, "VIP Court");
  assert.equal(calls.length, 2);
});

test("group-funded repository stores contribution proof metadata outside booking payment fields", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query: String(query), params });
          assert.match(String(query), /INSERT INTO group_funded_booking_contributions/);
          assert.doesNotMatch(String(query), /bookings\.payment_proof|bookings\.payment_reference|INSERT INTO bookings/);
          return {
            rows: [
              {
                id: 200,
                campaign_id: params[0],
                participant_id: params[1],
                user_id: params[2],
                amount_cents: params[3],
                currency: params[4],
                contribution_status: params[5],
                payment_reference: params[6],
                payment_proof_object_key: params[7],
                payment_proof_file_name: params[8],
                payment_proof_content_type: params[9],
                payment_proof_size_bytes: params[10],
                payment_proof_uploaded_at: params[11],
                submitted_at: params[12],
                verified_at: null,
                verified_by_user_id: null,
                rejected_at: null,
                rejected_by_user_id: null,
                rejection_reason: null,
                refund_status: null,
                created_at: new Date("2026-07-12T00:00:00.000Z"),
                updated_at: new Date("2026-07-12T00:00:00.000Z")
              }
            ]
          };
        }
      }
    }
  });

  const contribution = await repository.createContribution({
    campaignId: 100,
    participantId: 101,
    userId: 102,
    amountCents: 50000,
    contributionStatus: repository.CONTRIBUTION_STATUSES.SUBMITTED,
    paymentReference: "REF-123",
    paymentProofObjectKey: "group-funded/100/102.png",
    paymentProofFileName: "proof.png",
    paymentProofContentType: "image/png",
    paymentProofSizeBytes: 12345,
    paymentProofUploadedAt: "2026-07-12T00:00:00.000Z",
    submittedAt: "2026-07-12T00:00:00.000Z"
  });

  assert.equal(calls.length, 1);
  assert.equal(contribution.paymentReference, "REF-123");
  assert.equal(contribution.paymentProofObjectKey, "group-funded/100/102.png");
  assert.equal(contribution.paymentProofSizeBytes, 12345);
});

test("group-funded repository can clear rejected contribution metadata on resubmission", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          calls.push({ query: sql, params });
          assert.match(sql, /rejected_at = CASE WHEN \$16::boolean THEN NULL/);
          assert.match(sql, /rejected_by_user_id = CASE WHEN \$16::boolean THEN NULL/);
          assert.match(sql, /rejection_reason = CASE WHEN \$16::boolean THEN NULL/);
          assert.equal(params[15], true);
          return {
            rows: [
              {
                id: params[0],
                campaign_id: 100,
                participant_id: 101,
                user_id: 102,
                amount_cents: 50000,
                currency: "PHP",
                contribution_status: params[1],
                payment_reference: params[2],
                payment_proof_object_key: params[3],
                payment_proof_file_name: params[4],
                payment_proof_content_type: params[5],
                payment_proof_size_bytes: params[6],
                payment_proof_uploaded_at: params[7],
                submitted_at: params[8],
                verified_at: null,
                verified_by_user_id: null,
                rejected_at: null,
                rejected_by_user_id: null,
                rejection_reason: null,
                refund_status: null,
                created_at: new Date("2026-07-12T00:00:00.000Z"),
                updated_at: new Date("2026-07-13T00:00:00.000Z")
              }
            ]
          };
        }
      }
    }
  });

  const contribution = await repository.updateContribution({
    contributionId: 200,
    contributionStatus: repository.CONTRIBUTION_STATUSES.SUBMITTED,
    paymentReference: "REF-RETRY",
    paymentProofObjectKey: "group-funded/100/102-retry.png",
    paymentProofFileName: "proof-retry.png",
    paymentProofContentType: "image/png",
    paymentProofSizeBytes: 23456,
    paymentProofUploadedAt: "2026-07-13T00:00:00.000Z",
    submittedAt: "2026-07-13T00:00:00.000Z",
    clearRejection: true
  });

  assert.equal(calls.length, 1);
  assert.equal(contribution.contributionStatus, repository.CONTRIBUTION_STATUSES.SUBMITTED);
  assert.equal(contribution.paymentReference, "REF-RETRY");
  assert.equal(contribution.rejectedAt, null);
  assert.equal(contribution.rejectionReason, "");
});

test("group-funded repository creates participants, refunds, events, and capacity holds", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          calls.push({ query: sql, params });

          if (sql.includes("INSERT INTO group_funded_booking_participants")) {
            return {
              rows: [
                {
                  id: 300,
                  campaign_id: params[0],
                  user_id: params[1],
                  participant_role: params[2],
                  display_name: params[3],
                  joined_at: params[4] || new Date("2026-07-12T00:00:00.000Z"),
                  created_at: new Date("2026-07-12T00:00:00.000Z"),
                  updated_at: new Date("2026-07-12T00:00:00.000Z")
                }
              ]
            };
          }

          if (sql.includes("INSERT INTO group_funded_booking_refunds")) {
            return {
              rows: [
                {
                  id: 400,
                  campaign_id: params[0],
                  contribution_id: params[1],
                  user_id: params[2],
                  amount_cents: params[3],
                  currency: params[4],
                  refund_reason: params[5],
                  refund_status: params[6],
                  vendor_actor_user_id: params[7],
                  notes: params[8],
                  evidence_object_key: params[9],
                  evidence_file_name: params[10],
                  evidence_content_type: params[11],
                  evidence_size_bytes: params[12],
                  completed_at: params[13],
                  created_at: new Date("2026-07-12T00:00:00.000Z"),
                  updated_at: new Date("2026-07-12T00:00:00.000Z")
                }
              ]
            };
          }

          if (sql.includes("INSERT INTO group_funded_booking_events")) {
            return {
              rows: [
                {
                  id: 500,
                  campaign_id: params[0],
                  tenant_id: params[1],
                  location_id: params[2],
                  event_type: params[3],
                  actor_user_id: params[4],
                  actor_role: params[5],
                  source: params[6],
                  metadata: JSON.parse(params[7]),
                  created_at: new Date("2026-07-12T00:00:00.000Z")
                }
              ]
            };
          }

          if (sql.includes("INSERT INTO group_funded_capacity_holds")) {
            return {
              rows: [
                {
                  id: 600,
                  campaign_id: params[0],
                  group_funded_booking_item_id: params[1],
                  tenant_id: params[2],
                  location_id: params[3],
                  service_id: params[4],
                  scheduled_start_at: params[5],
                  scheduled_end_at: params[6],
                  booking_quantity: params[7],
                  hold_status: params[8],
                  expires_at: params[9],
                  released_at: null,
                  converted_booking_id: null,
                  created_at: new Date("2026-07-12T00:00:00.000Z"),
                  updated_at: new Date("2026-07-12T00:00:00.000Z")
                }
              ]
            };
          }

          throw new Error(`Unexpected query: ${sql}`);
        }
      }
    }
  });

  const participant = await repository.createParticipant({
    campaignId: 100,
    userId: 7,
    participantRole: repository.PARTICIPANT_ROLES.ORGANIZER,
    displayName: "Carlo A."
  });
  assert.equal(participant.participantRole, "organizer");

  const refund = await repository.createRefund({
    campaignId: 100,
    contributionId: 200,
    userId: 7,
    amountCents: 50000,
    refundReason: "funding_failed",
    vendorActorUserId: 9,
    notes: "Manual refund pending"
  });
  assert.equal(refund.refundStatus, repository.REFUND_STATUSES.PENDING);
  assert.equal(refund.vendorActorUserId, "9");

  const event = await repository.recordEvent({
    campaignId: 100,
    tenantId: 1,
    locationId: 2,
    eventType: repository.EVENT_TYPES.REFUND_OBLIGATION_CREATED,
    actorUserId: 9,
    actorRole: "vendor_admin",
    source: "vendor",
    metadata: { contributionId: 200 }
  });
  assert.deepEqual(event.metadata, { contributionId: 200 });

  const hold = await repository.createCapacityHold({
    campaignId: 100,
    campaignItemId: 700,
    tenantId: 1,
    locationId: 2,
    serviceId: 3,
    scheduledStartAt: "2026-07-20T02:00:00.000Z",
    scheduledEndAt: "2026-07-20T03:00:00.000Z",
    expiresAt: "2026-07-13T00:00:00.000Z"
  });
  assert.equal(hold.holdStatus, repository.CAPACITY_HOLD_STATUSES.ACTIVE);
  assert.equal(hold.campaignItemId, "700");
  assert.equal(calls.length, 4);
});

test("group-funded repository lists vendor campaigns by tenant, location, and status", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query: String(query), params });
          assert.match(String(query), /FROM group_funded_bookings/);
          assert.match(String(query), /LEFT JOIN users organizer/);
          assert.match(String(query), /LEFT JOIN LATERAL/);
          assert.match(String(query), /completed_refund_count/);
          assert.match(String(query), /refund_eligible_contribution_count/);
          assert.match(String(query), /gfb\.tenant_id = \$1/);
          assert.match(String(query), /gfb\.location_id = \$2/);
          assert.match(String(query), /gfb\.campaign_status = ANY\(\$3\)/);
          assert.match(String(query), /ORDER BY gfb\.created_at DESC/);
          assert.match(String(query), /LIMIT \$4/);
          return {
            rows: [
              campaignRow({
                tenant_id: params[0],
                location_id: params[1],
                campaign_status: params[2][0],
                refund_count: 4,
                completed_refund_count: 4,
                refund_eligible_contribution_count: 4
              })
            ]
          };
        }
      }
    }
  });

  const campaigns = await repository.listCampaignsForVendor(1, {
    locationId: 2,
    status: repository.CAMPAIGN_STATUSES.VENDOR_REVIEW,
    limit: 25
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [1, 2, ["vendor_review"], 25]);
  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].tenantId, "1");
  assert.equal(campaigns[0].campaignStatus, "vendor_review");
  assert.equal(campaigns[0].bookingQuantity, 2);
  assert.deepEqual(campaigns[0].refundSummary, { totalCount: 4, completedCount: 4, eligibleContributionCount: 4 });
});

test("group-funded repository lists vendor alert events with campaign snapshots", async () => {
  const calls = [];
  const eventRow = {
    id: 900,
    campaign_id: 100,
    tenant_id: 1,
    location_id: 2,
    event_type: "contribution_submitted",
    actor_user_id: 102,
    actor_role: "customer",
    source: "account",
    metadata: { contributionId: "700" },
    created_at: new Date("2026-07-18T02:00:00.000Z")
  };
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          calls.push({ query: sql, params });
          assert.match(sql, /FROM group_funded_booking_events event/);
          assert.match(sql, /INNER JOIN group_funded_bookings campaign/);
          assert.match(sql, /event\.tenant_id = \$1/);
          assert.match(sql, /event\.location_id = \$2/);
          assert.match(sql, /event\.event_type = ANY\(\$3\)/);
          assert.match(sql, /ORDER BY event\.created_at DESC/);
          assert.match(sql, /LIMIT \$4/);
          return {
            rows: [
              {
                event_row: eventRow,
                campaign_row: campaignRow({ campaign_status: "funding" })
              }
            ]
          };
        }
      }
    }
  });

  const events = await repository.listVendorAlertEvents(1, {
    locationId: 2,
    eventTypes: ["campaign_created", "contribution_submitted"],
    limit: 10
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [1, 2, ["campaign_created", "contribution_submitted"], 10]);
  assert.equal(events.length, 1);
  assert.equal(events[0].event.eventType, "contribution_submitted");
  assert.equal(events[0].event.metadata.contributionId, "700");
  assert.equal(events[0].campaign.id, "100");
  assert.equal(events[0].campaign.serviceNameSnapshot, "Consultation");
});

test("group-funded repository lists only public discoverable campaigns for a vendor branch", async () => {
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          assert.match(sql, /gfb\.visibility = 'public'/);
          assert.match(sql, /group_funded_allow_public_campaigns/);
          assert.match(sql, /LEFT JOIN location_services location_service/);
          assert.match(sql, /gfb\.location_service_id IS NULL/);
          assert.match(sql, /gfb\.campaign_status IN/);
          assert.match(sql, /gfb\.service_slug_snapshot = \$3/);
          assert.equal(params[0], 1);
          assert.equal(params[1], 2);
          assert.equal(params[2], "consultation");
          assert.equal(params[3], 10);
          return {
            rows: [
              campaignRow({
                visibility: "public",
                campaign_status: "funding",
                service_slug_snapshot: "consultation"
              })
            ]
          };
        }
      }
    }
  });

  const campaigns = await repository.listPublicCampaignsForVendorLocation(1, 2, {
    serviceSlug: "consultation",
    limit: 10
  });

  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].visibility, "public");
  assert.equal(campaigns[0].campaignStatus, "funding");
});

test("group-funded repository updates vendor review fields on campaigns", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query: String(query), params });
          assert.match(String(query), /UPDATE group_funded_bookings/);
          assert.match(String(query), /vendor_review_started_at = COALESCE\(\$3, vendor_review_started_at\)/);
          assert.match(String(query), /vendor_review_expires_at = COALESCE\(\$4, vendor_review_expires_at\)/);
          assert.match(String(query), /linked_booking_id = COALESCE\(\$5, linked_booking_id\)/);
          assert.match(String(query), /confirmed_at = COALESCE\(\$6, confirmed_at\)/);
          assert.match(String(query), /canceled_at = COALESCE\(\$7, canceled_at\)/);
          assert.match(String(query), /RETURNING/);
          return {
            rows: [
              campaignRow({
                id: params[0],
                campaign_status: params[1],
                vendor_review_started_at: params[2],
                vendor_review_expires_at: params[3],
                linked_booking_id: params[4],
                confirmed_at: params[5]
              })
            ]
          };
        }
      }
    }
  });

  const campaign = await repository.updateCampaignReviewFields({
    campaignId: 100,
    campaignStatus: repository.CAMPAIGN_STATUSES.CONFIRMED,
    vendorReviewStartedAt: "2026-07-18T01:05:00.000Z",
    vendorReviewExpiresAt: "2026-07-19T01:05:00.000Z",
    linkedBookingId: 900,
    confirmedAt: "2026-07-18T02:00:00.000Z"
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params.slice(0, 6), [
    100,
    "confirmed",
    "2026-07-18T01:05:00.000Z",
    "2026-07-19T01:05:00.000Z",
    900,
    "2026-07-18T02:00:00.000Z"
  ]);
  assert.equal(campaign.campaignStatus, "confirmed");
  assert.equal(campaign.linkedBookingId, "900");
  assert.equal(campaign.confirmedAt, "2026-07-18T02:00:00.000Z");
});

test("group-funded repository finds and updates capacity holds separately from bookings", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          calls.push({ query: sql, params });
          assert.doesNotMatch(sql, /UPDATE bookings\b|INSERT INTO bookings\b/);

          if (sql.includes("SELECT") && sql.includes("FROM group_funded_capacity_holds")) {
            assert.match(sql, /hold_status = 'active'/);
            assert.match(sql, /FOR UPDATE/);
            return { rows: [capacityHoldRow({ campaign_id: params[0] })] };
          }

          if (sql.includes("UPDATE group_funded_capacity_holds")) {
            assert.match(sql, /hold_status = COALESCE\(\$2, hold_status\)/);
            assert.match(sql, /released_at = COALESCE\(\$4, released_at\)/);
            assert.match(sql, /converted_booking_id = COALESCE\(\$5, converted_booking_id\)/);
            return {
              rows: [
                capacityHoldRow({
                  id: params[0],
                  hold_status: params[1],
                  released_at: params[3],
                  converted_booking_id: params[4]
                })
              ]
            };
          }

          throw new Error(`Unexpected query: ${sql}`);
        }
      }
    }
  });

  const activeHold = await repository.findActiveCapacityHoldByCampaign(100, { forUpdate: true });
  const convertedHold = await repository.updateCapacityHold({
    capacityHoldId: activeHold._id,
    holdStatus: repository.CAPACITY_HOLD_STATUSES.CONVERTED,
    releasedAt: "2026-07-18T02:00:00.000Z",
    convertedBookingId: 900
  });

  assert.equal(calls.length, 2);
  assert.equal(activeHold.campaignId, "100");
  assert.equal(convertedHold.holdStatus, "converted");
  assert.equal(convertedHold.convertedBookingId, "900");
});

test("group-funded repository counts overlapping active capacity holds", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query: String(query), params });
          assert.match(String(query), /FROM group_funded_capacity_holds/);
          assert.match(String(query), /\(\$3::bigint IS NULL OR service_id = \$3::bigint\)/);
          assert.match(String(query), /hold_status = 'active'/);
          assert.match(String(query), /expires_at > NOW\(\)/);
          assert.match(String(query), /campaign_id <> \$6::bigint/);
          return { rows: [{ count: 2 }] };
        }
      }
    }
  });

  const count = await repository.countOverlappingActiveCapacityHolds(1, {
    locationId: 2,
    serviceId: 3,
    startsAt: "2026-07-20T02:00:00.000Z",
    endsAt: "2026-07-20T03:00:00.000Z",
    excludeCampaignId: 100
  });

  assert.equal(count, 2);
  assert.deepEqual(calls[0].params, [
    1,
    2,
    3,
    "2026-07-20T02:00:00.000Z",
    "2026-07-20T03:00:00.000Z",
    100
  ]);
});

test("group-funded repository lists campaign holds and updates manual refund tracking", async () => {
  const calls = [];
  const repository = requireWithMocks("../src/repositories/groupFundedBookings.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          const sql = String(query);
          calls.push({ query: sql, params });

          if (sql.includes("SELECT") && sql.includes("FROM group_funded_capacity_holds")) {
            assert.match(sql, /WHERE campaign_id = \$1/);
            assert.match(sql, /ORDER BY created_at ASC/);
            return {
              rows: [
                capacityHoldRow({ id: 600, campaign_id: params[0], hold_status: "released" }),
                capacityHoldRow({ id: 601, campaign_id: params[0], hold_status: "active" })
              ]
            };
          }

          if (sql.includes("UPDATE group_funded_booking_refunds")) {
            assert.match(sql, /refund_status = COALESCE\(\$2, refund_status\)/);
            assert.match(sql, /vendor_actor_user_id = COALESCE\(\$3, vendor_actor_user_id\)/);
            assert.match(sql, /evidence_object_key = COALESCE\(\$5, evidence_object_key\)/);
            assert.match(sql, /completed_at = COALESCE\(\$9, completed_at\)/);
            return {
              rows: [
                refundRow({
                  id: params[0],
                  refund_status: params[1],
                  vendor_actor_user_id: params[2],
                  notes: params[3],
                  evidence_object_key: params[4],
                  evidence_file_name: params[5],
                  evidence_content_type: params[6],
                  evidence_size_bytes: params[7],
                  completed_at: params[8]
                })
              ]
            };
          }

          throw new Error(`Unexpected query: ${sql}`);
        }
      }
    }
  });

  const holds = await repository.listCapacityHoldsByCampaign(100);
  const refund = await repository.updateRefund({
    refundId: 700,
    refundStatus: repository.REFUND_STATUSES.COMPLETED,
    vendorActorUserId: 9,
    notes: "GCash manual refund sent",
    evidenceObjectKey: "refunds/700.png",
    evidenceFileName: "refund.png",
    evidenceContentType: "image/png",
    evidenceSizeBytes: 4567,
    completedAt: "2026-07-18T03:00:00.000Z"
  });

  assert.equal(calls.length, 2);
  assert.equal(holds.length, 2);
  assert.equal(holds[1].holdStatus, "active");
  assert.equal(refund.refundStatus, "completed");
  assert.equal(refund.vendorActorUserId, "9");
  assert.equal(refund.evidenceSizeBytes, 4567);
  assert.equal(refund.completedAt, "2026-07-18T03:00:00.000Z");
});

test("location service repository maps and upserts group-funded settings", async () => {
  const calls = [];
  const locationServices = requireWithMocks("../src/repositories/locationServices.js", {
    "../config/db": {
      pool: {
        query: async (query, params) => {
          calls.push({ query: String(query), params });
          return {
            rows: [
              {
                id: 7,
                tenant_id: params[0],
                location_id: params[1],
                service_id: params[2],
                capacity: params[3],
                is_active: params[4],
                sort_order: params[5],
                price_amount_cents: params[6],
                price_display: params[7],
                group_funded_enabled: params[8],
                group_funded_min_required_contributors: params[9],
                group_funded_max_required_contributors: params[10],
                group_funded_default_required_contributors: params[11],
                group_funded_min_contribution_amount_cents: params[12],
                group_funded_max_contribution_amount_cents: params[13],
                group_funded_min_deadline_hours: params[14],
                group_funded_max_deadline_days: params[15],
                group_funded_allow_public_campaigns: params[16],
                created_at: new Date("2026-07-12T00:00:00.000Z"),
                updated_at: new Date("2026-07-12T00:00:00.000Z")
              }
            ]
          };
        }
      }
    }
  });

  const row = await locationServices.upsertLocationService({
    tenantId: 1,
    locationId: 2,
    serviceId: 3,
    capacity: 4,
    isActive: true,
    sortOrder: 5,
    priceAmountCents: 150000,
    priceDisplay: "₱1,500",
    groupFunded: {
      enabled: true,
      minRequiredContributors: 2,
      maxRequiredContributors: 10,
      defaultRequiredContributors: 4,
      minContributionAmountCents: 10000,
      maxContributionAmountCents: 100000,
      minDeadlineHours: 24,
      maxDeadlineDays: 7,
      allowPublicCampaigns: true
    }
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /group_funded_enabled/);
  assert.equal(row.groupFunded.enabled, true);
  assert.equal(row.groupFunded.defaultRequiredContributors, 4);
  assert.equal(row.groupFunded.allowPublicCampaigns, true);
  assert.equal(row.priceAmountCents, 150000);
});
