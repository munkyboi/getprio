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

const constants = {
  CAMPAIGN_STATUSES: {
    FUNDING: "funding",
    FUNDED: "funded",
    FUNDING_FAILED: "funding_failed",
    SLOT_RECOVERY: "slot_recovery",
    VENDOR_REVIEW: "vendor_review",
    REPLACEMENT_PROPOSED: "replacement_proposed",
    VENDOR_REJECTED: "vendor_rejected",
    VENDOR_REVIEW_EXPIRED: "vendor_review_expired",
    CONFIRMED: "confirmed"
  },
  PARTICIPANT_ROLES: {
    ORGANIZER: "organizer",
    CONTRIBUTOR: "contributor"
  },
  CONTRIBUTION_STATUSES: {
    SUBMITTED: "submitted",
    VERIFIED: "verified",
    REJECTED: "rejected",
    REFUND_PENDING: "refund_pending",
    REFUNDED: "refunded",
    POLICY_REVIEW_REQUIRED: "policy_review_required"
  },
  REFUND_STATUSES: {
    PENDING: "pending",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    POLICY_REVIEW_REQUIRED: "policy_review_required"
  },
  CAPACITY_HOLD_STATUSES: {
    ACTIVE: "active",
    RELEASED: "released",
    EXPIRED: "expired",
    CONVERTED: "converted"
  },
  EVENT_TYPES: {
    CAMPAIGN_CREATED: "campaign_created",
    CAMPAIGN_VISIBILITY_CHANGED: "campaign_visibility_changed",
    CONTRIBUTION_SUBMITTED: "contribution_submitted",
    CONTRIBUTION_VERIFIED: "contribution_verified",
    CONTRIBUTION_REJECTED: "contribution_rejected",
    FUNDING_COMPLETED: "funding_completed",
    FUNDING_DEADLINE_EXPIRED: "funding_deadline_expired",
    CAPACITY_HOLD_CREATED: "capacity_hold_created",
    CAPACITY_HOLD_EXPIRED: "capacity_hold_expired",
    REPLACEMENT_SLOT_PROPOSED: "replacement_slot_proposed",
    REPLACEMENT_SLOT_ACCEPTED: "replacement_slot_accepted",
    REPLACEMENT_SLOT_DECLINED: "replacement_slot_declined",
    VENDOR_APPROVED: "vendor_approved",
    VENDOR_REJECTED: "vendor_rejected",
    LINKED_BOOKING_CREATED: "linked_booking_created",
    REFUND_OBLIGATION_CREATED: "refund_obligation_created",
    REFUND_MARKED_IN_PROGRESS: "refund_marked_in_progress",
    REFUND_MARKED_COMPLETED: "refund_marked_completed",
    ABUSE_REPORTED: "abuse_reported"
  }
};

function buildCampaign(overrides = {}) {
  return {
    _id: "campaign-1",
    publicToken: "share-token",
    tenantId: "tenant-1",
    locationId: "location-1",
    serviceId: "service-1",
    organizerUserId: "user-1",
    campaignStatus: "funding",
    visibility: "private_link",
    campaignTitle: "Team consultation",
    serviceNameSnapshot: "Consultation",
    serviceSlugSnapshot: "consultation",
    locationNameSnapshot: "Main",
    locationSlugSnapshot: "main",
    bookingQuantity: 1,
    scheduledStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
    scheduledEndAt: new Date(Date.now() + 97 * 60 * 60 * 1000).toISOString(),
    fundingDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    currency: "PHP",
    targetAmountCents: 100001,
    requiredContributionAmountCents: 33334,
    roundingAdjustmentCents: 1,
    requiredContributors: 3,
    paidParticipantCount: 0,
    fundedAmountCents: 0,
    fundedAt: null,
    linkedBookingId: null,
    replacementScheduledStartAt: null,
    replacementScheduledEndAt: null,
    replacementProposedAt: null,
    replacementProposedByUserId: null,
    replacementNote: "",
    ...overrides
  };
}

function baseMocks(repositoryOverrides = {}) {
  const events = [];
  const pushCalls = [];
  const streamPublishes = [];
  const repository = {
    ...constants,
    withTransaction: async (callback) => callback({ tx: true }),
    createCampaign: async (data) => buildCampaign({
      _id: "campaign-1",
      ...data,
      publicToken: "share-token",
      campaignStatus: "funding",
      paidParticipantCount: 0,
      fundedAmountCents: 0,
      fundedAt: null
    }),
    recordEvent: async (event) => {
      events.push(event);
      return event;
    },
    updateCampaignReviewFields: async (data) => buildCampaign({
      campaignStatus: data.campaignStatus,
      vendorReviewStartedAt: data.vendorReviewStartedAt || null,
      vendorReviewExpiresAt: data.vendorReviewExpiresAt || null,
      linkedBookingId: data.linkedBookingId ? String(data.linkedBookingId) : null,
      confirmedAt: data.confirmedAt || null,
      canceledAt: data.canceledAt || null,
      cancellationReason: data.cancellationReason || "",
      scheduledStartAt: data.scheduledStartAt || undefined,
      scheduledEndAt: data.scheduledEndAt || undefined,
      replacementScheduledStartAt: data.replacementScheduledStartAt || null,
      replacementScheduledEndAt: data.replacementScheduledEndAt || null,
      replacementProposedAt: data.replacementProposedAt || null,
      replacementProposedByUserId: data.replacementProposedByUserId ? String(data.replacementProposedByUserId) : null,
      replacementNote: data.replacementNote || ""
    }),
    createCapacityHold: async (data) => ({
      _id: "hold-1",
      ...data,
      holdStatus: "active"
    }),
    countOverlappingActiveCapacityHolds: async () => 0,
    updateCampaignDetails: async (data) => buildCampaign({
      campaignTitle: data.campaignTitle,
      description: data.description,
      visibility: data.visibility
    }),
    getContributionReservationSummary: async () => ({
      verifiedContributorCount: 0,
      pendingVerificationContributorCount: 0
    }),
    findRefundByContributionId: async () => null,
    ...repositoryOverrides
  };
  repository.events = events;
  const mocks = {
      "../repositories/tenants": {
        findTenantBySlug: async () => ({
          _id: "tenant-1",
          slug: "vendor",
          publicProfileEnabled: true,
          vendorApprovalStatus: "approved",
          notificationSettings: {}
        }),
        findTenantById: async () => ({
          _id: "tenant-1",
          slug: "vendor",
          notificationSettings: {}
        })
      },
      "../repositories/storeLocations": {
        findLocationById: async () => ({
          _id: "location-1",
          tenantId: "tenant-1",
          name: "Main",
          slug: "main",
          isActive: true,
          paymentQrActive: true,
          paymentQrImageUrl: "/qr.png",
          paymentMethodLabel: "GCash",
          paymentAccountDisplayName: "GetPrio Vendor",
          paymentAccountIdentifierDisplay: "09170000000"
        }),
        findLocationByTenantAndSlug: async () => ({
          _id: "location-1",
          name: "Main",
          slug: "main",
          isActive: true,
          paymentQrActive: true,
          paymentQrImageUrl: "/qr.png",
          paymentMethodLabel: "GCash",
          paymentAccountDisplayName: "GetPrio Vendor"
        })
      },
      "../repositories/vendorServices": {
        normalizeServiceSlug: (value) => String(value || "").trim().toLowerCase(),
        findServiceByTenantAndSlug: async () => ({
          _id: "service-1",
          name: "Consultation",
          slug: "consultation",
          isActive: true,
          durationMinutes: 60,
          allowBookingQuantity: false,
          bookingCapacityScope: "service",
          priceAmountCents: 100001,
          currency: "PHP"
        })
      },
      "../repositories/locationServices": {
        findLocationServiceByLocationAndServiceId: async () => ({
          _id: "location-service-1",
          isActive: true,
          priceAmountCents: null,
          groupFunded: {
            enabled: true,
            minRequiredContributors: 2,
            maxRequiredContributors: 10,
            defaultRequiredContributors: 3,
            minContributionAmountCents: null,
            maxContributionAmountCents: null,
            minDeadlineHours: 1,
            maxDeadlineDays: 30,
            allowPublicCampaigns: false
          }
        })
      },
      "../repositories/groupFundedBookings": repository,
      "../repositories/bookings": {
        countOverlappingActiveBookings: async () => 0,
        createGroupFundedBooking: async (data) => ({
          _id: "booking-1",
          status: "confirmed",
          paymentStatus: "paid",
          groupFundedBookingId: data.groupFundedBookingId,
          bookingPaymentSource: "group_funded",
          ...data
        })
      },
      "../repositories/users": {
        findUserById: async () => ({
          _id: "user-1",
          name: "Organizer",
          email: "organizer@example.com",
          phone: "09170000000"
        })
      },
      "./pushNotificationService": {
        notifyVendorGroupFundedCampaignCreated: async (payload) => {
          pushCalls.push({ type: "created", ...payload });
        },
        notifyVendorGroupFundedProofReview: async (payload) => {
          pushCalls.push({ type: "proof", ...payload });
        },
        notifyVendorGroupFundedReviewReady: async (payload) => {
          pushCalls.push({ type: "reviewReady", ...payload });
        }
      },
      "./paymentProofStorageService": {
        uploadGroupFundedBinary: async ({ campaign, user, body, fileBuffer }) => ({
          proof: {
            objectKey: `group-funded/${campaign.publicToken}/${user._id}/${body.fileName}`,
            fileName: body.fileName,
            contentType: body.contentType,
            sizeBytes: fileBuffer.length
          }
        }),
        createViewAccess: async ({ booking }) => ({
          proof: {
            fileName: booking.paymentProofFileName,
            contentType: booking.paymentProofContentType,
            sizeBytes: booking.paymentProofSizeBytes,
            uploadedAt: booking.paymentProofUploadedAt
          },
          access: {
            method: "GET",
            url: `https://proofs.example/${booking.paymentProofObjectKey}`,
            expiresInSeconds: 300
          }
        })
      },
      "./queueEvents": {
        publish: (tenantSlug, payload) => {
          streamPublishes.push({ tenantSlug, payload });
        }
      },
      "./bookingService": {
        assertServiceScheduleAvailability: async () => ({ allowed: true })
      }
  };
  return { repository, mocks, pushCalls, streamPublishes };
}

test("group-funded service creates a campaign with computed contribution and rounding snapshot", async () => {
  let createdPayload = null;
  const { repository, mocks, pushCalls, streamPublishes } = baseMocks({
    createCampaign: async (data) => {
      createdPayload = data;
      return buildCampaign({
        ...data,
        publicToken: "share-token",
        campaignStatus: "funding"
      });
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const campaign = await service.createCampaign({
    user: { _id: "user-1", name: "Customer One", displayName: "John S." },
    body: {
      tenantSlug: "vendor",
      locationSlug: "main",
      serviceSlug: "consultation",
      scheduledStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
      fundingDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      requiredContributors: 3,
      description: "Team consult"
    }
  });

  assert.equal(campaign.requiredContributionAmountCents, 33334);
  assert.equal(createdPayload.organizerDisplayName, "John S.");
  assert.equal(campaign.roundingAdjustmentCents, 1);
  assert.equal(createdPayload.targetAmountCents, 100001);
  assert.equal(createdPayload.eligibilitySnapshot.paymentMethodLabel, "GCash");
  assert.equal(createdPayload.eligibilitySnapshot.paymentQrImageUrl, "/qr.png");
  assert.deepEqual(repository.events.map((event) => event.eventType), ["campaign_created"]);
  assert.equal(pushCalls.length, 1);
  assert.equal(pushCalls[0].type, "created");
  assert.equal(pushCalls[0].campaign._id, campaign._id);
  assert.deepEqual(streamPublishes, [{ tenantSlug: "vendor", payload: undefined }]);
});

test("group-funded service creates one campaign for a parallel multi-court bundle", async () => {
  const createdItems = [];
  const { mocks } = baseMocks({
    createCampaignItem: async (data) => {
      const item = {
        _id: `item-${createdItems.length + 1}`,
        ...data
      };
      createdItems.push(item);
      return item;
    }
  });
  mocks["../repositories/vendorServices"].findServiceByTenantAndSlug = async (_tenantId, slug) => {
    const services = {
      "vip-court": {
        _id: "service-vip",
        name: "VIP Court",
        slug: "vip-court",
        isActive: true,
        durationMinutes: 60,
        allowBookingQuantity: true,
        bookingCapacityScope: "service",
        priceAmountCents: 120000,
        currency: "PHP"
      },
      "court-1": {
        _id: "service-court-1",
        name: "Court 1",
        slug: "court-1",
        isActive: true,
        durationMinutes: 60,
        allowBookingQuantity: false,
        bookingCapacityScope: "service",
        priceAmountCents: 80000,
        currency: "PHP"
      }
    };
    return services[slug] || null;
  };
  mocks["../repositories/locationServices"].findLocationServiceByLocationAndServiceId = async (_tenantId, _locationId, serviceId) => ({
    _id: `location-service-${serviceId}`,
    isActive: true,
    priceAmountCents: null,
    groupFunded: {
      enabled: true,
      minRequiredContributors: 2,
      maxRequiredContributors: 12,
      defaultRequiredContributors: 8,
      minContributionAmountCents: null,
      maxContributionAmountCents: null,
      minDeadlineHours: 1,
      maxDeadlineDays: 30,
      allowPublicCampaigns: true
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const campaign = await service.createCampaign({
    user: { _id: "user-1", name: "Customer One", displayName: "John S." },
    body: {
      tenantSlug: "vendor",
      locationSlug: "main",
      serviceSlug: "vip-court",
      bundleItems: [
        { serviceSlug: "vip-court" },
        { serviceSlug: "court-1" }
      ],
      bookingQuantity: 4,
      scheduledStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
      fundingDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      requiredContributors: 8,
      description: "VIP Court and Court 1 rental"
    }
  });

  assert.equal(campaign.targetAmountCents, 800000);
  assert.equal(campaign.requiredContributionAmountCents, 100000);
  assert.equal(campaign.requiredContributors, 8);
  assert.equal(campaign.bundleItems.length, 2);
  assert.deepEqual(createdItems.map((item) => item.serviceSlugSnapshot), ["vip-court", "court-1"]);
  assert.deepEqual(createdItems.map((item) => item.bookingQuantity), [4, 4]);
  assert.deepEqual(createdItems.map((item) => item.priceAmountCents), [480000, 320000]);
  assert.equal(createdItems[0].scheduledStartAt, createdItems[1].scheduledStartAt);
  assert.equal(
    new Date(createdItems[0].scheduledEndAt).getTime() - new Date(createdItems[0].scheduledStartAt).getTime(),
    4 * 60 * 60 * 1000
  );
  assert.equal(
    new Date(createdItems[1].scheduledEndAt).getTime() - new Date(createdItems[1].scheduledStartAt).getTime(),
    4 * 60 * 60 * 1000
  );
});

test("group-funded service rejects public campaign descriptions that fail moderation", async () => {
  const { mocks } = baseMocks();
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await assert.rejects(
    () => service.createCampaign({
      user: { _id: "user-1", name: "Organizer" },
      body: {
        tenantSlug: "vendor",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
        fundingDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        requiredContributors: 3,
        visibility: "private_link",
        description: "gago"
      }
    }),
    /Campaign description contains language/
  );
});

test("group-funded service stores only safe rich campaign description markup", async () => {
  let createdPayload = null;
  const { mocks } = baseMocks({
    createCampaign: async (data) => {
      createdPayload = data;
      return buildCampaign({ ...data, campaignStatus: "funding", publicToken: "share-token" });
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await service.createCampaign({
    user: { _id: "user-1", name: "Organizer" },
    body: {
      tenantSlug: "vendor",
      locationSlug: "main",
      serviceSlug: "consultation",
      scheduledStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
      fundingDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      requiredContributors: 3,
      visibility: "private_link",
      description: "<p><strong>Bring a paddle</strong></p><script>alert('xss')</script><img src=x onerror=alert(1)>"
    }
  });

  assert.equal(createdPayload.description, "<p><strong>Bring a paddle</strong></p>");
});

test("group-funded service limits rich campaign descriptions to 1000 plain-text characters", async () => {
  const { mocks } = baseMocks();
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await assert.rejects(
    () => service.createCampaign({
      user: { _id: "user-1", name: "Organizer" },
      body: {
        tenantSlug: "vendor",
        locationSlug: "main",
        serviceSlug: "consultation",
        scheduledStartAt: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
        fundingDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        requiredContributors: 3,
        visibility: "private_link",
        description: `<p>${"a".repeat(1001)}</p>`
      }
    }),
    /description must be 1000 characters or fewer/
  );
});

test("group-funded service rejects organizer detail edits after funding is complete", async () => {
  const campaign = buildCampaign({
    fundedAmountCents: 100001,
    paidParticipantCount: 3
  });
  let updateCalled = false;
  const { mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    updateCampaignDetails: async () => {
      updateCalled = true;
      return campaign;
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await assert.rejects(
    () =>
      service.updateOrganizerCampaignDetails({
        user: { _id: "user-1" },
        campaignIdOrToken: "share-token",
        body: {
          campaignTitle: "Updated title",
          description: "Updated description",
          visibility: "private_link"
        }
      }),
    (error) => error.statusCode === 409 && /fully funded/i.test(error.message)
  );
  assert.equal(updateCalled, false);
});

test("group-funded service rejects organizer detail edits after a contribution is submitted", async () => {
  const campaign = buildCampaign();
  const { mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    getContributionReservationSummary: async () => ({
      verifiedContributorCount: 0,
      pendingVerificationContributorCount: 1
    })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await assert.rejects(
    () => service.updateOrganizerCampaignDetails({
      user: { _id: "user-1" },
      campaignIdOrToken: "share-token",
      body: {
        campaignTitle: "Updated title",
        description: "Updated description",
        visibility: "private_link"
      }
    }),
    (error) => error.statusCode === 409 && /submitted contributions/i.test(error.message)
  );
});

test("group-funded service formats public campaigns without private payment or contributor fields", () => {
  const { mocks } = baseMocks();
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const publicCampaign = service.formatPublicCampaign(buildCampaign({
    organizerDisplayName: "Carlo Abella",
    organizerProfileDisplayName: "John S.",
    paymentReference: "internal-reference",
    paymentProofObjectKey: "proofs/private.png",
    eligibilitySnapshot: {
      paymentQrImageUrl: "/payment-qr.png",
      paymentAccountDisplayName: "GetPrio Vendor"
    }
  }));

  assert.equal(publicCampaign.organizerDisplayName, "John S.");
  assert.equal(publicCampaign.organizerUserId, undefined);
  assert.equal(publicCampaign.linkedBookingId, null);
  assert.equal(publicCampaign.paymentReference, undefined);
  assert.equal(publicCampaign.paymentProofObjectKey, undefined);
  assert.equal(publicCampaign.paymentDestination, undefined);
  assert.equal(publicCampaign.refunds, undefined);
  assert.equal(publicCampaign.events, undefined);
});

test("group-funded service masks public organizer name when no display name is set", () => {
  const { mocks } = baseMocks();
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const publicCampaign = service.formatPublicCampaign(buildCampaign({
    organizerDisplayName: "Carlo Abella",
    organizerProfileDisplayName: ""
  }));

  assert.equal(publicCampaign.organizerDisplayName, "Organizer C.");
});

test("group-funded service lists public vendor-location campaigns through privacy formatter", async () => {
  const campaign = buildCampaign({
    visibility: "public",
    organizerDisplayName: "Carlo Abella",
    organizerProfileDisplayName: "John S."
  });
  const { mocks } = baseMocks({
    listPublicCampaignsForVendorLocation: async (tenantId, locationId, options) => {
      assert.equal(tenantId, "tenant-1");
      assert.equal(locationId, "location-1");
      assert.equal(options.serviceSlug, "consultation");
      return [campaign];
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const campaigns = await service.listPublicCampaignsForVendorLocation({
    tenantSlug: "vendor",
    locationSlug: "main",
    serviceSlug: "Consultation",
    limit: 10
  });

  assert.equal(campaigns.length, 1);
  assert.equal(campaigns[0].visibility, "public");
  assert.equal(campaigns[0].organizerDisplayName, "John S.");
});

test("group-funded public access waits for the organizer contribution to be vendor verified", async () => {
  const campaign = buildCampaign({ visibility: "public" });
  const { mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => ({ contributionStatus: "submitted" })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await assert.rejects(
    () => service.getPublicCampaign({ publicToken: "share-token" }),
    (error) => error.statusCode === 404 && error.message === "Campaign not found."
  );
});

test("group-funded public access opens after the organizer contribution is vendor verified", async () => {
  const campaign = buildCampaign({ visibility: "private_link" });
  const { mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => ({ contributionStatus: "verified" })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.getPublicCampaign({ publicToken: "share-token" });
  assert.equal(result.campaign.publicToken, "share-token");
});

test("group-funded service records rate-limited abuse report events without exposing reporter details", async () => {
  const campaign = buildCampaign({ visibility: "public" });
  let participantPayload = null;
  const { repository, mocks, pushCalls, streamPublishes } = baseMocks({
    findCampaignByPublicToken: async () => campaign
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.reportPublicCampaignAbuse({
    publicToken: "share-token",
    body: { reason: "Misleading details" },
    actor: { _id: "user-2" },
    ipAddress: "127.0.0.1"
  });

  assert.equal(result.ok, true);
  assert.equal(repository.events.at(-1).eventType, "abuse_reported");
  assert.equal(repository.events.at(-1).actorUserId, "user-2");
  assert.equal(repository.events.at(-1).metadata.reason, "Misleading details");
  assert.match(repository.events.at(-1).metadata.reporterIpHash, /^[a-f0-9]{64}$/);
});

test("group-funded report emails render an uploaded Backblaze screenshot inline", async () => {
  const campaign = buildCampaign({ visibility: "public" });
  let emailPayload = null;
  const { repository, mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign
  });
  mocks["./campaignReportAttachmentService"] = {
    getAttachmentForCampaign: ({ objectKey, fileName }) => ({
      objectKey,
      fileName,
      publicUrl: "https://files.example/file/public-board/campaign-reports/report.png"
    })
  };
  mocks["./notificationService"] = {
    sendEmail: async (payload) => {
      emailPayload = payload;
      return true;
    }
  };
  mocks["../repositories/tenants"].findTenantById = async () => ({
    _id: "tenant-1",
    slug: "vendor",
    contactEmail: "vendor@example.com",
    notificationSettings: {}
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await service.reportPublicCampaignAbuse({
    publicToken: "share-token",
    body: {
      reason: "Misleading details",
      attachmentFileName: "report.png",
      attachmentObjectKey: "campaign-reports/tenants/tenant-1/campaigns/campaign-1/report.png"
    }
  });

  assert.equal(repository.events.at(-1).metadata.attachmentFileName, "report.png");
  assert.match(repository.events.at(-1).metadata.attachmentObjectKey, /campaign-reports/);
  assert.match(emailPayload.text, /https:\/\/files\.example/);
  assert.match(emailPayload.html, /<img src="https:\/\/files\.example/);
});

test("group-funded service stores submitted contribution proof without advancing funding", async () => {
  let contributionPayload = null;
  const campaign = buildCampaign();
  const { repository, mocks, pushCalls, streamPublishes } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => null,
    findParticipantByCampaignAndUser: async () => null,
    createParticipant: async (data) => {
      participantPayload = data;
      return { _id: "participant-1", ...data };
    },
    createContribution: async (data) => {
      contributionPayload = data;
      return {
        _id: "contribution-1",
        campaignId: campaign._id,
        userId: "user-2",
        amountCents: data.amountCents,
        currency: data.currency,
        contributionStatus: data.contributionStatus,
        paymentReference: data.paymentReference,
        paymentProofObjectKey: data.paymentProofObjectKey
      };
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.submitContributionProof({
    user: { _id: "user-2", name: "Contributor", displayName: "John S." },
    campaignIdOrToken: "share-token",
    body: {
      paymentReference: "REF-1",
      paymentProofObjectKey: "group-funded/campaign-1/user-2/proof.png",
      paymentProofFileName: "proof.png",
      paymentProofContentType: "image/png",
      paymentProofSizeBytes: 12345
    }
  });

  assert.equal(result.contribution.contributionStatus, "submitted");
  assert.equal(participantPayload.displayName, "John S.");
  assert.equal(contributionPayload.amountCents, campaign.requiredContributionAmountCents);
  assert.equal(result.campaign.fundedAmountCents, 0);
  assert.deepEqual(repository.events.map((event) => event.eventType), ["contribution_submitted"]);
  assert.equal(pushCalls.length, 1);
  assert.equal(pushCalls[0].type, "proof");
  assert.equal(pushCalls[0].contribution._id, "contribution-1");
  assert.deepEqual(streamPublishes, [{ tenantSlug: "vendor", payload: undefined }]);
});

test("group-funded service treats a repeated proof submission as idempotent", async () => {
  const campaign = buildCampaign();
  const submittedContribution = {
    _id: "contribution-1",
    campaignId: campaign._id,
    userId: "user-2",
    contributionStatus: "submitted",
    paymentReference: "REF-1",
    paymentProofObjectKey: "group-funded/campaign-1/user-2/proof.png"
  };
  const { repository, mocks, pushCalls, streamPublishes } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => submittedContribution,
    createParticipant: async () => {
      throw new Error("A duplicate submission must not create a participant.");
    },
    createContribution: async () => {
      throw new Error("A duplicate submission must not create a contribution.");
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.submitContributionProof({
    user: { _id: "user-2", name: "Contributor" },
    campaignIdOrToken: "share-token",
    body: {
      paymentReference: "REF-1",
      paymentProofObjectKey: "group-funded/campaign-1/user-2/proof.png",
      paymentProofFileName: "proof.png",
      paymentProofContentType: "image/png",
      paymentProofSizeBytes: 12345
    }
  });

  assert.equal(result.idempotent, true);
  assert.equal(result.contribution, submittedContribution);
  assert.equal(repository.events.length, 0);
  assert.equal(pushCalls.length, 0);
  assert.deepEqual(streamPublishes, []);
});

test("group-funded service lets a rejected contributor resubmit proof in the same campaign", async () => {
  let updatePayload = null;
  let createContributionCalled = false;
  const campaign = buildCampaign();
  const rejectedContribution = {
    _id: "contribution-1",
    campaignId: campaign._id,
    userId: "user-2",
    amountCents: campaign.requiredContributionAmountCents,
    currency: campaign.currency,
    contributionStatus: "rejected",
    paymentReference: "OLD-REF",
    paymentProofObjectKey: "group-funded/campaign-1/user-2/old-proof.png",
    rejectedAt: "2026-07-13T08:00:00.000Z",
    rejectedByUserId: "vendor-user-1",
    rejectionReason: "Unreadable proof"
  };
  const { repository, mocks, pushCalls, streamPublishes } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => rejectedContribution,
    findParticipantByCampaignAndUser: async () => ({
      _id: "participant-1",
      campaignId: campaign._id,
      userId: "user-2"
    }),
    createContribution: async () => {
      createContributionCalled = true;
      return { _id: "unexpected-contribution" };
    },
    updateContribution: async (data) => {
      updatePayload = data;
      return {
        ...rejectedContribution,
        contributionStatus: data.contributionStatus,
        paymentReference: data.paymentReference,
        paymentProofObjectKey: data.paymentProofObjectKey,
        rejectedAt: data.clearRejection ? null : rejectedContribution.rejectedAt,
        rejectedByUserId: data.clearRejection ? null : rejectedContribution.rejectedByUserId,
        rejectionReason: data.clearRejection ? null : rejectedContribution.rejectionReason
      };
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.submitContributionProof({
    user: { _id: "user-2", name: "Contributor", displayName: "John S." },
    campaignIdOrToken: "share-token",
    body: {
      paymentReference: "REF-RETRY",
      paymentProofObjectKey: "group-funded/campaign-1/user-2/new-proof.png",
      paymentProofFileName: "new-proof.png",
      paymentProofContentType: "image/png",
      paymentProofSizeBytes: 23456
    }
  });

  assert.equal(createContributionCalled, false);
  assert.equal(updatePayload.contributionId, "contribution-1");
  assert.equal(updatePayload.contributionStatus, "submitted");
  assert.equal(updatePayload.paymentReference, "REF-RETRY");
  assert.equal(updatePayload.clearRejection, true);
  assert.equal(result.contribution.contributionStatus, "submitted");
  assert.equal(result.contribution.rejectedAt, null);
  assert.equal(result.contribution.rejectionReason, null);
  assert.deepEqual(repository.events.map((event) => event.eventType), ["contribution_submitted"]);
  assert.equal(repository.events[0].metadata.retry, true);
  assert.equal(pushCalls.length, 1);
  assert.equal(pushCalls[0].contribution._id, "contribution-1");
  assert.deepEqual(streamPublishes, [{ tenantSlug: "vendor", payload: undefined }]);
});

test("group-funded service rejects proof submission when verified and pending reservations fill every contributor position", async () => {
  let createParticipantCalled = false;
  let createContributionCalled = false;
  const campaign = buildCampaign({ requiredContributors: 4, paidParticipantCount: 1 });
  const { repository, mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => null,
    getContributionReservationSummary: async () => ({
      verifiedContributorCount: 1,
      pendingVerificationContributorCount: 3,
      vacantContributorCount: 0,
      filledContributorCount: 4
    }),
    findParticipantByCampaignAndUser: async () => null,
    createParticipant: async () => {
      createParticipantCalled = true;
      return { _id: "participant-2" };
    },
    createContribution: async () => {
      createContributionCalled = true;
      return { _id: "contribution-2" };
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await assert.rejects(
    () => service.submitContributionProof({
      user: { _id: "user-3", name: "Another contributor" },
      campaignIdOrToken: "share-token",
      body: {
        paymentReference: "REF-FULL",
        paymentProofObjectKey: "group-funded/campaign-1/user-3/proof.png",
        paymentProofFileName: "proof.png",
        paymentProofContentType: "image/png",
        paymentProofSizeBytes: 12345
      }
    }),
    { message: "All contributor positions are temporarily reserved. Please try again if a pending proof is rejected." }
  );

  assert.equal(createParticipantCalled, false);
  assert.equal(createContributionCalled, false);
  assert.equal(repository.events.length, 0);
});

test("group-funded customer campaign exposes only contributor reservation aggregates", async () => {
  const campaign = buildCampaign({ organizerUserId: "user-1", requiredContributors: 4 });
  const { mocks } = baseMocks({
    findCampaignById: async () => campaign,
    findContributionByCampaignAndUser: async () => null,
    getContributionReservationSummary: async () => ({
      verifiedContributorCount: 1,
      pendingVerificationContributorCount: 2
    })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.getCampaignForCustomer({ user: { _id: "user-1" }, campaignIdOrToken: "1" });

  assert.deepEqual(result.campaign.contributorReservationSummary, {
    verifiedContributorCount: 1,
    pendingVerificationContributorCount: 2,
    vacantContributorCount: 1,
    filledContributorCount: 3
  });
  assert.equal(Object.hasOwn(result.campaign.contributorReservationSummary, "contributorIds"), false);
});

test("group-funded service uploads contribution proof before metadata submission", async () => {
  const campaign = buildCampaign({ publicToken: "share-token" });
  const { mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => null
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const upload = await service.uploadContributionProofDirect({
    user: { _id: "user-2" },
    campaignIdOrToken: "share-token",
    body: {
      fileName: "sample_receipt.png",
      contentType: "image/png"
    },
    fileBuffer: Buffer.from("fake image")
  });

  assert.equal(upload.proof.objectKey, "group-funded/share-token/user-2/sample_receipt.png");
  assert.equal(upload.proof.contentType, "image/png");
  assert.equal(upload.proof.sizeBytes, 10);
});

test("group-funded service lets rejected contributors upload replacement proof", async () => {
  const campaign = buildCampaign({ publicToken: "share-token" });
  const { mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async () => ({
      _id: "contribution-1",
      campaignId: campaign._id,
      userId: "user-2",
      contributionStatus: "rejected"
    })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const upload = await service.uploadContributionProofDirect({
    user: { _id: "user-2" },
    campaignIdOrToken: "share-token",
    body: {
      fileName: "replacement_receipt.png",
      contentType: "image/png"
    },
    fileBuffer: Buffer.from("retry image")
  });

  assert.equal(upload.proof.objectKey, "group-funded/share-token/user-2/replacement_receipt.png");
  assert.equal(upload.proof.sizeBytes, 11);
});

test("group-funded service gives vendors scoped access to contribution proof preview", async () => {
  const { mocks } = baseMocks({
    findContributionById: async () => ({
      _id: "contribution-1",
      campaignId: "campaign-1",
      userId: "user-2",
      paymentProofObjectKey: "group-funded/share-token/proof.png",
      paymentProofFileName: "proof.png",
      paymentProofContentType: "image/png",
      paymentProofSizeBytes: 12345,
      paymentProofUploadedAt: "2026-07-13T08:00:00.000Z"
    }),
    findCampaignById: async () => buildCampaign({
      _id: "campaign-1",
      tenantId: "tenant-1"
    })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const access = await service.createVendorContributionProofAccess({
    tenant: { _id: "tenant-1" },
    contributionId: "contribution-1"
  });
  assert.equal(access.proof.fileName, "proof.png");
  assert.equal(access.access.url, "https://proofs.example/group-funded/share-token/proof.png");

  await assert.rejects(
    () =>
      service.createVendorContributionProofAccess({
        tenant: { _id: "tenant-2" },
        contributionId: "contribution-1"
      }),
    (error) => error.statusCode === 404 && /campaign not found/i.test(error.message)
  );
});

test("group-funded service verifies submitted contribution and records funding completion", async () => {
  const campaign = buildCampaign({ targetAmountCents: 50000 });
  const contribution = {
    _id: "contribution-1",
    campaignId: campaign._id,
    userId: "user-2",
    amountCents: 50000,
    currency: "PHP",
    contributionStatus: "submitted"
  };
  const { repository, mocks, pushCalls, streamPublishes } = baseMocks({
    findContributionById: async () => contribution,
    findCampaignById: async () => campaign,
    updateContribution: async (data) => ({ ...contribution, contributionStatus: data.contributionStatus }),
    recomputeCampaignFunding: async () => buildCampaign({
      ...campaign,
      campaignStatus: "funded",
      fundedAmountCents: 50000,
      paidParticipantCount: 1,
      fundedAt: new Date().toISOString()
    })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.verifyContribution({
    tenant: { _id: "tenant-1", notificationSettings: {} },
    user: { _id: "vendor-1" },
    contributionId: "contribution-1"
  });

  assert.equal(result.campaign.campaignStatus, "vendor_review");
  assert.deepEqual(repository.events.map((event) => event.eventType), [
    "contribution_verified",
    "funding_completed",
    "capacity_hold_created"
  ]);
  assert.equal(pushCalls.length, 1);
  assert.equal(pushCalls[0].type, "reviewReady");
  assert.equal(pushCalls[0].campaign.campaignStatus, "vendor_review");
  assert.deepEqual(streamPublishes, [{ tenantSlug: "vendor", payload: undefined }]);
});

test("group-funded service blocks verifying excess submitted contributions after funding is reached", async () => {
  const campaign = buildCampaign({
    campaignStatus: "vendor_review",
    targetAmountCents: 50000,
    fundedAmountCents: 50000,
    paidParticipantCount: 1,
    requiredContributors: 1
  });
  const contribution = {
    _id: "contribution-2",
    campaignId: campaign._id,
    userId: "user-3",
    amountCents: 50000,
    currency: "PHP",
    contributionStatus: "submitted"
  };
  let updateCalled = false;
  const { mocks } = baseMocks({
    findContributionById: async () => contribution,
    findCampaignById: async () => campaign,
    updateContribution: async () => {
      updateCalled = true;
      return contribution;
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  await assert.rejects(
    () =>
      service.verifyContribution({
        tenant: { _id: "tenant-1", notificationSettings: {} },
        user: { _id: "vendor-1" },
        contributionId: "contribution-2"
      }),
    (error) => error.statusCode === 409 && /already fully funded/i.test(error.message)
  );
  assert.equal(updateCalled, false);
});

test("group-funded service rejects invalid proof without creating a refund", async () => {
  const campaign = buildCampaign();
  const contribution = {
    _id: "contribution-1",
    campaignId: campaign._id,
    userId: "user-2",
    amountCents: 33334,
    currency: "PHP",
    contributionStatus: "submitted"
  };
  let createdRefund = null;
  const { repository, mocks } = baseMocks({
    findContributionById: async () => contribution,
    findCampaignById: async () => campaign,
    updateContribution: async (data) => ({ ...contribution, ...data }),
    createRefund: async (data) => {
      createdRefund = data;
      return { _id: "refund-1", ...data };
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.rejectContribution({
    tenant: { _id: "tenant-1" },
    user: { _id: "vendor-1" },
    contributionId: contribution._id,
    reason: "Reference could not be matched.",
    refundDisposition: "not_required"
  });

  assert.equal(result.contribution.contributionStatus, "rejected");
  assert.equal(result.refund, null);
  assert.equal(createdRefund, null);
  assert.deepEqual(repository.events.map((event) => event.eventType), ["contribution_rejected"]);
});

test("group-funded service moves paid rejected proof into refund tracking", async () => {
  const campaign = buildCampaign({ fundedAmountCents: 100001, targetAmountCents: 100001 });
  const contribution = {
    _id: "contribution-2",
    campaignId: campaign._id,
    userId: "user-3",
    amountCents: 33334,
    currency: "PHP",
    contributionStatus: "submitted"
  };
  const refunds = [];
  const { repository, mocks } = baseMocks({
    findContributionById: async () => contribution,
    findCampaignById: async () => campaign,
    updateContribution: async (data) => ({ ...contribution, ...data }),
    createRefund: async (data) => {
      const refund = { _id: `refund-${refunds.length + 1}`, ...data };
      refunds.push(refund);
      return refund;
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.rejectContribution({
    tenant: { _id: "tenant-1" },
    user: { _id: "vendor-1" },
    contributionId: contribution._id,
    reason: "Payment received after the campaign reached its target.",
    refundDisposition: "required"
  });

  assert.equal(result.contribution.contributionStatus, "refund_pending");
  assert.equal(result.contribution.refundStatus, "pending");
  assert.equal(result.refund.refundReason, "excess_contribution");
  assert.equal(refunds.length, 1);
  assert.deepEqual(repository.events.map((event) => event.eventType), [
    "refund_obligation_created",
    "contribution_rejected"
  ]);
});

test("group-funded service does not duplicate an existing rejected-contribution refund", async () => {
  const campaign = buildCampaign({ fundedAmountCents: 100001, targetAmountCents: 100001 });
  const contribution = {
    _id: "contribution-3",
    campaignId: campaign._id,
    userId: "user-3",
    amountCents: 33334,
    currency: "PHP",
    contributionStatus: "refund_pending"
  };
  const existingRefund = { _id: "refund-1", contributionId: contribution._id, refundStatus: "pending" };
  let createRefundCalled = false;
  const { repository, mocks } = baseMocks({
    findContributionById: async () => contribution,
    findCampaignById: async () => campaign,
    findRefundByContributionId: async () => existingRefund,
    createRefund: async () => {
      createRefundCalled = true;
      return null;
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.rejectContribution({
    tenant: { _id: "tenant-1" },
    user: { _id: "vendor-1" },
    contributionId: contribution._id,
    reason: "Payment received after the campaign reached its target.",
    refundDisposition: "required"
  });

  assert.equal(result.refund, existingRefund);
  assert.equal(createRefundCalled, false);
  assert.equal(repository.events.length, 0);
});

test("group-funded service approves vendor-review campaign into one linked paid booking", async () => {
  const campaign = buildCampaign({
    campaignStatus: "vendor_review",
    targetAmountCents: 50000,
    fundedAmountCents: 50000,
    paidParticipantCount: 1,
    vendorReviewExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  let bookingPayload = null;
  let capacityHoldCountOptions = null;
  const { repository, mocks, streamPublishes } = baseMocks({
    findCampaignById: async () => campaign,
    findActiveCapacityHoldByCampaign: async () => ({
      _id: "hold-1",
      campaignId: campaign._id,
      holdStatus: "active",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    }),
    updateCapacityHold: async (data) => ({ _id: data.capacityHoldId, ...data }),
    updateCampaignReviewFields: async (data) => buildCampaign({
      ...campaign,
      campaignStatus: data.campaignStatus,
      linkedBookingId: data.linkedBookingId ? String(data.linkedBookingId) : null,
      confirmedAt: data.confirmedAt || null
    }),
    countOverlappingActiveCapacityHolds: async (_tenantId, options) => {
      capacityHoldCountOptions = options;
      return String(options.excludeCampaignId) === String(campaign._id) ? 0 : 1;
    }
  });
  mocks["../repositories/bookings"].createGroupFundedBooking = async (data) => {
    bookingPayload = data;
    return {
      _id: "booking-1",
      status: "confirmed",
      paymentStatus: "paid",
      groupFundedBookingId: data.groupFundedBookingId,
      bookingPaymentSource: "group_funded",
      ...data
    };
  };
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.approveVendorCampaign({
    tenant: { _id: "tenant-1" },
    user: { _id: "vendor-1" },
    campaignId: "campaign-1"
  });

  assert.equal(result.campaign.campaignStatus, "confirmed");
  assert.equal(result.campaign.linkedBookingId, "booking-1");
  assert.equal(result.booking.status, "confirmed");
  assert.equal(result.booking.paymentStatus, "paid");
  assert.equal(capacityHoldCountOptions.excludeCampaignId, campaign._id);
  assert.equal(bookingPayload.customerUserId, campaign.organizerUserId);
  assert.equal(bookingPayload.groupFundedBookingId, campaign._id);
  assert.deepEqual(repository.events.map((event) => event.eventType), [
    "vendor_approved",
    "linked_booking_created"
  ]);
  assert.deepEqual(streamPublishes, [{ tenantSlug: "vendor", payload: undefined }]);
});

test("group-funded service rejects funded campaign and creates refund obligations", async () => {
  const campaign = buildCampaign({
    campaignStatus: "vendor_review",
    targetAmountCents: 50000,
    fundedAmountCents: 50000
  });
  const verifiedContribution = {
    _id: "contribution-1",
    campaignId: campaign._id,
    userId: "user-2",
    amountCents: 50000,
    currency: "PHP",
    contributionStatus: "verified"
  };
  const refunds = [];
  const { repository, mocks, streamPublishes } = baseMocks({
    findCampaignById: async () => campaign,
    findActiveCapacityHoldByCampaign: async () => ({
      _id: "hold-1",
      campaignId: campaign._id,
      holdStatus: "active"
    }),
    updateCapacityHold: async (data) => ({ _id: data.capacityHoldId, ...data }),
    updateCampaignReviewFields: async (data) => buildCampaign({
      ...campaign,
      campaignStatus: data.campaignStatus,
      canceledAt: data.canceledAt,
      cancellationReason: data.cancellationReason
    }),
    listContributionsByCampaign: async () => [verifiedContribution],
    listRefundsByCampaign: async () => [],
    createRefund: async (data) => {
      const refund = { _id: `refund-${refunds.length + 1}`, ...data };
      refunds.push(refund);
      return refund;
    },
    updateContribution: async (data) => ({ ...verifiedContribution, ...data })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.rejectVendorCampaign({
    tenant: { _id: "tenant-1" },
    user: { _id: "vendor-1" },
    campaignId: "campaign-1",
    reason: "Slot no longer works"
  });

  assert.equal(result.campaign.campaignStatus, "vendor_rejected");
  assert.equal(result.refunds.length, 1);
  assert.equal(refunds[0].refundReason, "vendor_rejected");
  assert.deepEqual(repository.events.map((event) => event.eventType), [
    "refund_obligation_created",
    "vendor_rejected"
  ]);
  assert.deepEqual(streamPublishes, [{ tenantSlug: "vendor", payload: undefined }]);
});

test("group-funded service expires missed deadline campaigns and creates refund obligations", async () => {
  const expiredCampaign = buildCampaign({
    fundingDeadlineAt: new Date(Date.now() - 60 * 1000).toISOString()
  });
  const verifiedContribution = {
    _id: "contribution-1",
    campaignId: expiredCampaign._id,
    userId: "user-2",
    amountCents: 50000,
    currency: "PHP",
    contributionStatus: "verified"
  };
  const refunds = [];
  const { repository, mocks } = baseMocks({
    findCampaignById: async () => expiredCampaign,
    updateCampaignStatus: async (data) => buildCampaign({
      ...expiredCampaign,
      campaignStatus: data.campaignStatus,
      canceledAt: data.canceledAt
    }),
    listContributionsByCampaign: async () => [verifiedContribution],
    listRefundsByCampaign: async () => [],
    createRefund: async (data) => {
      const refund = { _id: `refund-${refunds.length + 1}`, ...data };
      refunds.push(refund);
      return refund;
    },
    updateContribution: async (data) => ({ ...verifiedContribution, ...data })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.expireFundingCampaign({ campaignId: "campaign-1" });

  assert.equal(result.campaign.campaignStatus, "funding_failed");
  assert.equal(result.refunds.length, 1);
  assert.equal(refunds[0].refundReason, "funding_failed");
  assert.deepEqual(repository.events.map((event) => event.eventType), [
    "refund_obligation_created",
    "funding_deadline_expired"
  ]);
});

test("group-funded service returns only the authenticated contributor refund state", async () => {
  const campaign = buildCampaign({ organizerUserId: "organizer-1" });
  const contribution = {
    _id: "contribution-1",
    campaignId: campaign._id,
    userId: "user-2",
    amountCents: 50000,
    currency: "PHP",
    contributionStatus: "refund_pending"
  };
  const { mocks } = baseMocks({
    findCampaignById: async () => campaign,
    findContributionByCampaignAndUser: async () => contribution,
    listRefundsByCampaign: async () => [
      {
        _id: "refund-1",
        campaignId: campaign._id,
        contributionId: contribution._id,
        userId: "user-2",
        refundStatus: "pending"
      },
      {
        _id: "refund-2",
        campaignId: campaign._id,
        contributionId: "contribution-2",
        userId: "other-user",
        refundStatus: "pending"
      }
    ]
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.getCampaignForCustomer({
    user: { _id: "user-2" },
    campaignIdOrToken: "1"
  });

  assert.equal(result.refunds.length, 1);
  assert.equal(result.refunds[0]._id, "refund-1");
});

test("group-funded customer campaign includes its snapshotted QR payment destination", async () => {
  const campaign = buildCampaign({
    organizerUserId: "user-1",
    eligibilitySnapshot: {
      paymentMethodLabel: "GCash",
      paymentAccountDisplayName: "GetPrio Vendor",
      paymentAccountIdentifierDisplay: "09171234567",
      paymentQrImageUrl: "/payment-qr.png"
    }
  });
  const { mocks } = baseMocks({
    findCampaignById: async () => campaign,
    findContributionByCampaignAndUser: async () => null
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.getCampaignForCustomer({ user: { _id: "user-1" }, campaignIdOrToken: "1" });

  assert.deepEqual(result.campaign.paymentDestination, {
    methodLabel: "GCash",
    accountDisplayName: "GetPrio Vendor",
    accountIdentifierDisplay: "09171234567",
    qrImageUrl: "/payment-qr.png"
  });
});

test("group-funded campaign link lets a new authenticated contributor view active payment instructions", async () => {
  const campaign = buildCampaign({
    eligibilitySnapshot: {
      paymentMethodLabel: "GCash",
      paymentAccountDisplayName: "GetPrio Vendor",
      paymentAccountIdentifierDisplay: "09171234567",
      paymentQrImageUrl: "/payment-qr.png"
    }
  });
  const { mocks } = baseMocks({
    findCampaignByPublicToken: async () => campaign,
    findContributionByCampaignAndUser: async (_campaignId, userId) => (
      userId === campaign.organizerUserId ? { contributionStatus: "verified" } : null
    )
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.getCampaignForCustomer({ user: { _id: "user-2" }, campaignIdOrToken: campaign.publicToken });

  assert.equal(result.campaign.paymentDestination.qrImageUrl, "/payment-qr.png");
});

test("group-funded campaign hides payment instructions when the branch QR is disabled", async () => {
  const campaign = buildCampaign({
    organizerUserId: "user-1",
    eligibilitySnapshot: { paymentQrImageUrl: "/payment-qr.png" }
  });
  const { mocks } = baseMocks({
    findCampaignById: async () => campaign,
    findContributionByCampaignAndUser: async () => null
  });
  mocks["../repositories/storeLocations"].findLocationById = async () => ({
    _id: "location-1",
    tenantId: "tenant-1",
    paymentQrActive: false,
    paymentQrImageUrl: "/disabled-qr.png"
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.getCampaignForCustomer({ user: { _id: "user-1" }, campaignIdOrToken: "1" });

  assert.equal(result.campaign.paymentDestination, null);
});

test("group-funded vendor campaign detail includes a complete refund summary", async () => {
  const campaign = buildCampaign({ campaignStatus: "vendor_rejected" });
  const { mocks } = baseMocks({
    findCampaignById: async () => campaign,
    listContributionsByCampaign: async () => [
      { _id: "contribution-1", contributionStatus: "refunded" },
      { _id: "contribution-2", contributionStatus: "refunded" }
    ],
    listRefundsByCampaign: async () => [
      { _id: "refund-1", refundStatus: "completed" },
      { _id: "refund-2", refundStatus: "completed" }
    ],
    listCapacityHoldsByCampaign: async () => []
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.getVendorCampaign({ tenant: { _id: "tenant-1" }, campaignId: campaign._id });

  assert.deepEqual(result.campaign.refundSummary, {
    totalCount: 2,
    completedCount: 2,
    eligibleContributionCount: 2
  });
});

test("group-funded service lets vendors propose replacement slots without creating a normal booking", async () => {
  const replacementStart = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString();
  const fundedCampaign = buildCampaign({
    campaignStatus: "slot_recovery",
    fundedAmountCents: 100001,
    fundedAt: new Date().toISOString()
  });
  let releasedHold = null;
  const { repository, mocks } = baseMocks({
    findCampaignById: async () => fundedCampaign,
    findActiveCapacityHoldByCampaign: async () => ({ _id: "hold-1", campaignId: fundedCampaign._id }),
    updateCapacityHold: async (data) => {
      releasedHold = data;
      return data;
    },
    updateCampaignReviewFields: async (data) => buildCampaign({
      ...fundedCampaign,
      campaignStatus: data.campaignStatus,
      replacementScheduledStartAt: data.replacementScheduledStartAt,
      replacementScheduledEndAt: data.replacementScheduledEndAt,
      replacementProposedByUserId: String(data.replacementProposedByUserId),
      replacementNote: data.replacementNote
    })
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.proposeReplacementSlot({
    tenant: { _id: "tenant-1" },
    user: { _id: "vendor-1" },
    campaignId: "campaign-1",
    body: { scheduledStartAt: replacementStart, note: "Original slot filled." }
  });

  assert.equal(result.campaign.campaignStatus, "replacement_proposed");
  assert.equal(result.campaign.replacementProposedByUserId, "vendor-1");
  assert.equal(releasedHold.holdStatus, "released");
  assert.equal(repository.events.at(-1).eventType, "replacement_slot_proposed");
});

test("group-funded service lets organizer accept replacement slot into vendor review hold", async () => {
  const replacementStart = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString();
  const replacementEnd = new Date(Date.now() + 121 * 60 * 60 * 1000).toISOString();
  const campaign = buildCampaign({
    campaignStatus: "replacement_proposed",
    fundedAmountCents: 100001,
    replacementScheduledStartAt: replacementStart,
    replacementScheduledEndAt: replacementEnd
  });
  let createdHold = null;
  const { repository, mocks } = baseMocks({
    findCampaignById: async () => campaign,
    updateCampaignReviewFields: async (data) => buildCampaign({
      ...campaign,
      campaignStatus: data.campaignStatus,
      scheduledStartAt: data.scheduledStartAt,
      scheduledEndAt: data.scheduledEndAt,
      vendorReviewStartedAt: data.vendorReviewStartedAt,
      vendorReviewExpiresAt: data.vendorReviewExpiresAt
    }),
    createCapacityHold: async (data) => {
      createdHold = { _id: "hold-accepted", ...data };
      return createdHold;
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.acceptReplacementSlot({
    user: { _id: "user-1" },
    campaignIdOrToken: "1"
  });

  assert.equal(result.campaign.campaignStatus, "vendor_review");
  assert.equal(result.campaign.scheduledStartAt, replacementStart);
  assert.equal(createdHold.scheduledStartAt, replacementStart);
  assert.deepEqual(repository.events.map((event) => event.eventType), [
    "replacement_slot_accepted",
    "capacity_hold_created"
  ]);
});

test("group-funded service marks manual refunds completed and closes the contribution", async () => {
  const campaign = buildCampaign({ campaignStatus: "vendor_rejected" });
  const refund = {
    _id: "refund-1",
    campaignId: campaign._id,
    contributionId: "contribution-1",
    userId: "user-2",
    refundStatus: "pending"
  };
  let contributionUpdate = null;
  const { repository, mocks } = baseMocks({
    findRefundById: async () => refund,
    findCampaignById: async () => campaign,
    updateRefund: async (data) => ({ ...refund, ...data }),
    updateContribution: async (data) => {
      contributionUpdate = data;
      return data;
    }
  });
  const service = requireWithMocks("../src/services/groupFundedBookingService.js", mocks);

  const result = await service.updateManualRefund({
    tenant: { _id: "tenant-1" },
    user: { _id: "vendor-1" },
    refundId: "refund-1",
    body: {
      refundStatus: "completed",
      notes: "Manual GCash refund sent.",
      evidenceObjectKey: "refunds/refund-1.png",
      evidenceFileName: "refund.png",
      evidenceContentType: "image/png",
      evidenceSizeBytes: 1234
    }
  });

  assert.equal(result.refund.refundStatus, "completed");
  assert.equal(contributionUpdate.contributionStatus, "refunded");
  assert.equal(contributionUpdate.refundStatus, "completed");
  assert.equal(repository.events.at(-1).eventType, "refund_marked_completed");
});
