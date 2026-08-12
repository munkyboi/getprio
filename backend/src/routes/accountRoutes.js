const express = require("express");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { moderatePublicText } = require("../middleware/moderatePublicText");
const bookingRepository = require("../repositories/bookings");
const organizerCampaignRepository = require("../repositories/organizerCampaigns");
const ratingRepository = require("../repositories/ratings");
const ticketRepository = require("../repositories/tickets");
const tenantRepository = require("../repositories/tenants");
const userRepository = require("../repositories/users");
const bookingService = require("../services/bookingService");
const organizerCampaignService = require("../services/organizerCampaignService");
const ratingService = require("../services/ratingService");
const passwordResetService = require("../services/passwordResetService");
const emailChangeService = require("../services/emailChangeService");
const phoneChangeService = require("../services/phoneChangeService");
const authService = require("../services/authService");
const pushNotificationService = require("../services/pushNotificationService");
const userAvatarUploadService = require("../services/userAvatarUploadService");
const customerTicketAccess = require("../services/customerTicketAccess");
const { assertPublicTextFieldsAllowed } = require("../services/contentModeration");
const { assertTenantPermission } = require("../middleware/auth");
const { formatPaginationMetadata, parsePaginationParams } = require("../utils/pagination");

const router = express.Router();
const campaignJoinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?._id || "anonymous"}:${ipKeyGenerator(req.ip)}`,
  message: { message: "Too many campaign join attempts. Please try again later." }
});
const avatarUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?._id || "anonymous"}:${ipKeyGenerator(req.ip)}`,
  message: { message: "Too many avatar upload attempts. Please try again later." }
});

router.use(authenticate);
router.use(moderatePublicText);

const emailChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?._id || "anonymous"}:${ipKeyGenerator(req.ip)}`,
  message: { message: "Too many email change verification attempts. Please try again later." }
});

function normalizeRequestText(value, fallback = "") {
  if (Array.isArray(value)) {
    return normalizeRequestText(value[0], fallback);
  }

  if (typeof value === "string") {
    const text = value.trim();
    return text || fallback;
  }

  return fallback;
}

function requireRequestParam(value, label) {
  if (typeof value !== "string") {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }

  const text = value.trim();
  if (!text) {
    const error = new Error(`${label} is required.`);
    error.statusCode = 400;
    throw error;
  }

  return text;
}

function normalizeQueryText(value, fallback = "") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    const error = new Error("Query parameter must be a single value.");
    error.statusCode = 400;
    throw error;
  }

  return normalizeRequestText(value, fallback);
}

function formatCustomerTicket(ticket) {
  return {
    id: ticket._id,
    lookupCode: ticket.lookupCode,
    ticketNumber: ticket.ticketNumber,
    tenantName: ticket.tenantName,
    tenantSlug: ticket.tenantSlug,
    locationName: ticket.locationName,
    locationSlug: ticket.locationSlug,
    status: ticket.status,
    statusReason: ticket.statusReason,
    carryOverExpiresAt: ticket.carryOverExpiresAt,
    currentQueueDayId: ticket.currentQueueDayId,
    journeySegments: ticket.journeySegments || [],
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt
  };
}

function formatManualPaymentDestination(booking) {
  if (booking.bookingPaymentSource === "group_funded" || booking.groupFundedBookingId) {
    return null;
  }

  if (
    booking.paymentStatus !== "unpaid" ||
    booking.paymentProofObjectKey ||
    booking.paymentVerifiedAt ||
    booking.paymentRejectedAt ||
    booking.expiredAt ||
    booking.status === "canceled"
  ) {
    return null;
  }

  const bundleItems = Array.isArray(booking.bundleItems) && booking.bundleItems.length
    ? booking.bundleItems
    : [{
        priceAmountCents: Number(booking.servicePriceAmountCents || 0) * Number(booking.bookingQuantity || 1),
        manualPaymentRequired: booking.serviceManualPaymentRequired
      }];
  if (!booking.serviceManualPaymentRequired && !bundleItems.some((item) => item.manualPaymentRequired)) {
    return null;
  }

  const isBankTransfer = booking.locationPaymentMethodLabel === "Bank Transfer";
  if (!booking.locationPaymentQrActive || (!isBankTransfer && !booking.locationPaymentQrImageUrl)) {
    return null;
  }

  return {
    methodLabel: booking.locationPaymentMethodLabel,
    ...(isBankTransfer ? { bankName: booking.locationPaymentBankName || "" } : {}),
    accountDisplayName: booking.locationPaymentAccountDisplayName,
    accountIdentifierDisplay: booking.locationPaymentAccountIdentifierDisplay,
    qrImageUrl: isBankTransfer ? "" : booking.locationPaymentQrImageUrl,
    amountCents: bundleItems.reduce((total, item) => total + Number(item.priceAmountCents || 0), 0),
    currency: booking.serviceCurrency || "PHP",
    unitPriceDisplay: booking.servicePriceDisplay
  };
}

function formatCustomerBooking(booking) {
  const groupFundedCampaign = booking.groupFundedCampaign
    ? {
        ...booking.groupFundedCampaign,
        bundleItems: Array.isArray(booking.groupFundedBundleItems)
          ? booking.groupFundedBundleItems.map((item) => ({
              id: item._id,
              serviceId: item.serviceId,
              serviceName: item.serviceNameSnapshot,
              serviceSlug: item.serviceSlugSnapshot,
              bookingQuantity: item.bookingQuantity,
              priceAmountCents: item.priceAmountCents,
              currency: item.currency,
              executionMode: item.executionMode,
              scheduledStartAt: item.scheduledStartAt,
              scheduledEndAt: item.scheduledEndAt,
              sortOrder: item.sortOrder
            }))
          : [],
        contributions: Array.isArray(booking.groupFundedContributions)
          ? booking.groupFundedContributions.map((contribution) => ({
              id: contribution._id,
              contributorDisplayName: contribution.participantDisplayName || "Contributor",
              amountCents: contribution.amountCents,
              currency: contribution.currency,
              contributionStatus: contribution.contributionStatus,
              submittedAt: contribution.submittedAt,
              verifiedAt: contribution.verifiedAt,
              rejectedAt: contribution.rejectedAt,
              rejectionReason: contribution.rejectionReason,
              refundStatus: contribution.refundStatus
            }))
          : []
      }
    : null;

  return {
    id: booking._id,
    reference: booking.reference,
    tenantId: booking.tenantId,
    tenantName: booking.tenantName,
    tenantSlug: booking.tenantSlug,
    locationId: booking.locationId,
    locationName: booking.locationName,
    locationSlug: booking.locationSlug,
    serviceId: booking.serviceId,
    serviceName: booking.serviceName,
    serviceSlug: booking.serviceSlug,
    serviceManualPaymentRequired: booking.serviceManualPaymentRequired,
    servicePriceAmountCents: booking.servicePriceAmountCents,
    serviceCurrency: booking.serviceCurrency,
    servicePriceDisplay: booking.servicePriceDisplay,
    bundleItems: booking.bundleItems || [],
    executionMode: booking.executionMode || "parallel",
    bookingQuantity: booking.bookingQuantity,
    scheduledStartAt: booking.scheduledStartAt,
    scheduledEndAt: booking.scheduledEndAt,
    status: booking.status,
    notes: booking.notes,
    paymentReference: booking.paymentReference,
    paymentStatus: booking.paymentStatus,
    groupFundedBookingId: booking.groupFundedBookingId,
    bookingPaymentSource: booking.bookingPaymentSource,
    organizerCampaignOptIn: Boolean(booking.organizerCampaignOptIn),
    groupFundedCampaign,
    manualPaymentDestination: formatManualPaymentDestination(booking),
    paymentProof: booking.paymentProofObjectKey
      ? {
          fileName: booking.paymentProofFileName,
          contentType: booking.paymentProofContentType,
          sizeBytes: booking.paymentProofSizeBytes,
          uploadedAt: booking.paymentProofUploadedAt
        }
      : null,
    paymentVerifiedAt: booking.paymentVerifiedAt,
    paymentRejectedAt: booking.paymentRejectedAt,
    paymentRejectionReason: booking.paymentRejectionReason,
    pendingExpiresAt: booking.pendingExpiresAt,
    expiredAt: booking.expiredAt,
    expirationReason: booking.expirationReason,
    fulfillmentOutcomeReason: booking.fulfillmentOutcomeReason,
    refundEligible: booking.refundEligible,
    fulfillmentResolvedAt: booking.fulfillmentResolvedAt,
    notifyByEmail: booking.notifyByEmail,
    notifyBySms: booking.notifyBySms,
    smsAlertFeePaymentId: booking.smsAlertFeePaymentId,
    contactVerifiedAt: booking.contactVerifiedAt,
    contactVerificationChannel: booking.contactVerificationChannel,
    linkedTicket: booking.queueTicketId
      ? {
          id: booking.queueTicketId,
          ticketNumber: booking.queueTicketNumber,
          lookupCode: booking.queueTicketLookupCode,
          status: booking.queueTicketStatus
        }
      : null,
    checkedInAt: booking.checkedInAt,
    noShowAt: booking.noShowAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  };
}

function formatAccountUser(user) {
  return {
    id: user._id,
    name: user.name,
    displayName: user.displayName || "",
    avatarUrl: user.avatarUrl || "",
    username: user.username,
    email: user.email,
    phone: user.phone,
    emailVerified: Boolean(user.emailVerified),
    mfaEnabled: Boolean(user.mfaEnabled),
    mfaRequired: Boolean(user.mfaRequired)
  };
}

function normalizeCustomerNotificationSettings(settings = {}) {
  return {
    bookingAlerts: settings.bookingAlerts !== false,
    queueAlerts: settings.queueAlerts !== false,
    campaignAlerts: settings.campaignAlerts !== false,
    preferredContactMethod: ["in_app", "email", "sms"].includes(settings.preferredContactMethod)
      ? settings.preferredContactMethod
      : "in_app"
  };
}

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [tickets, trustRating] = await Promise.all([
      ticketRepository.listTicketsForCustomerAccount(req.user, { limit: 50 }),
      ratingRepository.getUserTrustAggregate(req.user._id)
    ]);

    res.json({
    user: {
      ...formatAccountUser(req.user)
    },
    trustRating,
    notificationSettings: normalizeCustomerNotificationSettings(req.user.notificationSettings),
    tickets: tickets.map(formatCustomerTicket)
  });
})
);

router.get(
  "/notification-settings",
  asyncHandler(async (req, res) => {
    res.json({
      notificationSettings: normalizeCustomerNotificationSettings(req.user.notificationSettings)
    });
  })
);

router.patch(
  "/notification-settings",
  asyncHandler(async (req, res) => {
    const notificationSettings = normalizeCustomerNotificationSettings(req.body || {});
    const updatedUser = await userRepository.updateUser(req.user._id, {
      notificationSettings
    });

    res.json({
      notificationSettings: normalizeCustomerNotificationSettings(updatedUser.notificationSettings)
    });
  })
);

router.post(
  "/campaigns/:campaignId/join",
  campaignJoinLimiter,
  asyncHandler(async (req, res) => {
    const contribution = await organizerCampaignService.joinCampaign({
      user: req.user,
      campaignId: req.params.campaignId,
      body: req.body || {}
    });
    res.status(201).json({ contribution });
  })
);

router.delete(
  "/campaigns/:campaignId/contributions/self",
  asyncHandler(async (req, res) => {
    res.json(await organizerCampaignService.leaveCampaign({
      user: req.user,
      campaignId: req.params.campaignId
    }));
  })
);

router.post(
  "/campaigns/:campaignId/contributions/proof",
  campaignJoinLimiter,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("Contribution proof file payload is required.");
      error.statusCode = 400;
      throw error;
    }
    const contribution = await organizerCampaignService.uploadContributionProofDirect({
      user: req.user,
      campaignId: req.params.campaignId,
      body: { paymentReference: normalizeQueryText(req.query.paymentReference), fileName: normalizeQueryText(req.query.fileName), contentType: normalizeQueryText(req.headers["content-type"]) },
      fileBuffer: req.body
    });
    res.status(201).json({ contribution });
  })
);

router.patch(
  "/campaigns/:campaignId/contributions/:contributionId/review",
  asyncHandler(async (req, res) => {
    const contribution = await organizerCampaignService.reviewContribution({
      user: req.user,
      campaignId: req.params.campaignId,
      contributionId: req.params.contributionId,
      body: req.body || {}
    });
    res.json({ contribution });
  })
);

router.get(
  "/campaigns/:campaignId/contributions/:contributionId/evidence",
  asyncHandler(async (req, res) => res.json(await organizerCampaignService.createEvidenceAccess({ user: req.user, campaignId: req.params.campaignId, contributionId: req.params.contributionId, kind: req.query.kind === "reimbursement" ? "reimbursement" : "contribution" })))
);

router.patch(
  "/campaigns/:campaignId/cancel",
  asyncHandler(async (req, res) => {
    const campaign = await organizerCampaignService.cancelCampaign({
      user: req.user,
      campaignId: req.params.campaignId,
      body: req.body || {}
    });
    res.json({ campaign });
  })
);

router.post(
  "/campaigns/:campaignId/contributions/:contributionId/reimbursement/evidence",
  campaignJoinLimiter,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("Reimbursement evidence file payload is required."); error.statusCode = 400; throw error;
    }
    const reimbursement = await organizerCampaignService.submitReimbursementEvidence({
      user: req.user, campaignId: req.params.campaignId, contributionId: req.params.contributionId,
      body: { fileName: normalizeQueryText(req.query.fileName), contentType: normalizeQueryText(req.headers["content-type"]) }, fileBuffer: req.body
    });
    res.status(201).json({ reimbursement });
  })
);

router.patch(
  "/campaigns/:campaignId/contributions/:contributionId/reimbursement/confirm",
  asyncHandler(async (req, res) => {
    const reimbursement = await organizerCampaignService.confirmReimbursement({ user: req.user, campaignId: req.params.campaignId, contributionId: req.params.contributionId });
    res.json({ reimbursement });
  })
);

router.patch(
  "/campaigns/:campaignId/contributions/:contributionId/reimbursement/dispute",
  asyncHandler(async (req, res) => {
    const reimbursement = await organizerCampaignService.disputeReimbursement({ user: req.user, campaignId: req.params.campaignId, contributionId: req.params.contributionId, body: req.body || {} });
    res.json({ reimbursement });
  })
);

router.post(
  "/campaigns/:campaignId/report",
  campaignJoinLimiter,
  asyncHandler(async (req, res) => {
    const report = await organizerCampaignService.reportCampaign({ user: req.user, campaignId: req.params.campaignId, body: req.body || {} });
    res.status(201).json({ report });
  })
);

router.post("/bookings/:bookingId/rating", asyncHandler(async (req, res) => res.status(201).json({ rating: await ratingService.rateVendor({ user: req.user, bookingId: req.params.bookingId, body: req.body || {} }) })));
router.get("/tickets/:lookupCode/rating", asyncHandler(async (req, res) => res.json(await ratingService.getQueueTicketRating({ user: req.user, lookupCode: req.params.lookupCode }))));
router.post("/tickets/:lookupCode/rating", asyncHandler(async (req, res) => res.status(201).json({ rating: await ratingService.rateQueueTicket({ user: req.user, lookupCode: req.params.lookupCode, body: req.body || {} }) })));
router.post("/campaigns/:campaignId/contributions/:contributionId/rating", asyncHandler(async (req, res) => res.status(201).json({ rating: await ratingService.rateCampaignUser({ user: req.user, campaignId: req.params.campaignId, contributionId: req.params.contributionId, body: req.body || {} }) })));
router.post("/ratings/dispute", asyncHandler(async (req, res) => res.status(201).json({ dispute: await ratingService.disputeRating({ user: req.user, body: req.body || {} }) })));
router.patch("/ratings/vendor-reviews/:reviewId", asyncHandler(async (req, res) => res.json({ rating: await ratingService.reviseVendorReview({ user: req.user, reviewId: req.params.reviewId, body: req.body || {} }) })));

router.post(
  "/push-subscriptions",
  asyncHandler(async (req, res) => {
    let tenant = null;
    const tenantSlug = String(req.body?.tenantSlug || "").trim();

    if (tenantSlug) {
      tenant = await tenantRepository.findTenantBySlug(tenantSlug, { activeOnly: true });
      if (!tenant) {
        const error = new Error("Tenant not found.");
        error.statusCode = 404;
        throw error;
      }

      assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    }

    const subscription = await pushNotificationService.saveSubscription({
      user: req.user,
      tenant,
      payload: req.body?.subscription || req.body,
      userAgent: req.headers["user-agent"] || ""
    });

    res.status(201).json({ subscription });
  })
);

router.delete(
  "/push-subscriptions/:subscriptionId",
  asyncHandler(async (req, res) => {
    const subscription = await pushNotificationService.deleteSubscription({
      user: req.user,
      subscriptionId: req.params.subscriptionId
    });

    if (!subscription) {
      const error = new Error("Push subscription not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({ subscription });
  })
);

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();
    const displayName = normalizeRequestText(req.body.displayName).slice(0, 60);

    if (!name) {
      const error = new Error("Name is required.");
      error.statusCode = 400;
      throw error;
    }
    assertPublicTextFieldsAllowed({ Name: name, "Display name": displayName });

    const updatedUser = await userRepository.updateUser(req.user._id, {
      name,
      displayName: displayName || null
    });

    res.json({
      user: formatAccountUser(updatedUser),
      success: true,
      message: "Profile details updated."
    });
  })
);

router.post(
  "/email-change/start",
  emailChangeLimiter,
  asyncHandler(async (req, res) => {
    const result = await emailChangeService.start({
      user: req.user,
      newEmail: req.body?.newEmail,
      method: req.body?.method === "mfa" ? "mfa" : "current_email",
      password: req.body?.password,
      totpCode: req.body?.totpCode
    });
    res.json(result);
  })
);

router.post(
  "/email-change/verify-current",
  emailChangeLimiter,
  asyncHandler(async (req, res) => {
    res.json(await emailChangeService.verifyCurrent({
      user: req.user,
      challengeId: req.body?.challengeId,
      code: req.body?.code
    }));
  })
);

router.post(
  "/email-change/verify-new",
  emailChangeLimiter,
  asyncHandler(async (req, res) => {
    const updatedUser = await emailChangeService.verifyNew({
      user: req.user,
      challengeId: req.body?.challengeId,
      code: req.body?.code,
      sessionId: req.auth.sessionId,
      ipAddress: authService.getRequestIp(req),
      userAgent: authService.getUserAgent(req)
    });
    res.json({ user: formatAccountUser(updatedUser), success: true, message: "Your email address has been changed." });
  })
);

router.post(
  "/phone-change/start",
  emailChangeLimiter,
  asyncHandler(async (req, res) => {
    const result = await phoneChangeService.start({
      user: req.user,
      newPhone: req.body?.newPhone,
      method: req.body?.method === "totp" ? "totp" : "email",
      totpCode: req.body?.totpCode
    });
    res.json({ ...result, user: result.user ? formatAccountUser(result.user) : undefined });
  })
);

router.post(
  "/phone-change/verify-email",
  emailChangeLimiter,
  asyncHandler(async (req, res) => {
    const result = await phoneChangeService.verifyEmail({
      user: req.user,
      challengeId: req.body?.challengeId,
      code: req.body?.code,
      password: req.body?.password
    });
    res.json({ ...result, user: formatAccountUser(result.user) });
  })
);

router.post(
  "/profile/avatar",
  avatarUploadLimiter,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("Avatar image payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const result = await userAvatarUploadService.uploadAvatar({
      user: req.user,
      fileName: normalizeQueryText(req.query.fileName, "avatar"),
      contentType: normalizeQueryText(req.headers["content-type"]),
      fileBuffer: req.body
    });

    res.status(201).json({
      user: formatAccountUser(result.user),
      avatarUrl: result.avatarUrl,
      success: true,
      message: "Profile photo updated."
    });
  })
);

router.post(
  "/tickets/:lookupCode/claim",
  asyncHandler(async (req, res) => {
    const lookupCode = requireRequestParam(req.params.lookupCode, "Ticket lookup code").toUpperCase();

    if (!lookupCode) {
      const error = new Error("Ticket lookup code is required.");
      error.statusCode = 400;
      throw error;
    }

    const ticket = await ticketRepository.findTicketByLookupCode(lookupCode);
    if (!ticket) {
      const error = new Error("Ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    if (ticket.userId && String(ticket.userId) === String(req.user._id)) {
      res.json({
        success: true,
        ticket: formatCustomerTicket({
          ...ticket,
          tenantName: null,
          tenantSlug: null,
          locationName: null,
          locationSlug: null
        })
      });
      return;
    }

    if (ticket.userId) {
      const error = new Error("We could not verify that this ticket belongs to you.");
      error.statusCode = 403;
      throw error;
    }

    if (!customerTicketAccess.userOwnsTicket(req.user, ticket)) {
      const error = new Error("We could not verify that this ticket belongs to you.");
      error.statusCode = 403;
      throw error;
    }

    const claimedTicket = await ticketRepository.claimTicketForUser(ticket._id, req.user._id);
    if (!claimedTicket) {
      const error = new Error("This ticket has already been claimed by another account.");
      error.statusCode = 409;
      throw error;
    }

    res.json({
      success: true,
      ticket: formatCustomerTicket({
        ...claimedTicket,
        tenantName: null,
        tenantSlug: null,
        locationName: null,
        locationSlug: null
      })
    });
  })
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePaginationParams(req.query);
    const result = await ticketRepository.listTicketsForCustomerAccount(req.user, { page, pageSize, offset });
    const tickets = Array.isArray(result) ? result : result.tickets;
    const totalItems = Array.isArray(result) ? result.length : result.totalItems;

    res.json({
      tickets: tickets.map(formatCustomerTicket),
      pagination: formatPaginationMetadata(totalItems, page, pageSize)
    });
  })
);

router.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePaginationParams(req.query);
    const search = normalizeRequestText(req.query.search);
    const status = normalizeRequestText(req.query.status, "all");
    const scheduledDateFrom = normalizeRequestText(req.query.scheduledDateFrom);
    const scheduledDateTo = normalizeRequestText(req.query.scheduledDateTo);
    await bookingService.expirePendingBookingsForCustomer(req.user._id);
    const result = await bookingRepository.listBookingsForCustomer(req.user._id, {
      page,
      pageSize,
      offset,
      search,
      status,
      scheduledDateFrom,
      scheduledDateTo
    });
    const bookings = Array.isArray(result) ? result : result.bookings;
    const totalItems = Array.isArray(result) ? result.length : result.totalItems;

    res.json({
      bookings: bookings.map(formatCustomerBooking),
      pagination: formatPaginationMetadata(totalItems, page, pageSize)
    });
  })
);

router.get(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const campaigns = await organizerCampaignService.listCampaignsForCustomer({ user: req.user });
    res.json({ campaigns });
  })
);

router.get(
  "/campaign-discovery",
  asyncHandler(async (req, res) => res.json({ campaigns: await organizerCampaignService.listPublicCampaigns({
    search: normalizeQueryText(req.query.search), date: normalizeQueryText(req.query.date)
  }) }))
);

router.post(
  "/campaigns",
  campaignJoinLimiter,
  asyncHandler(async (req, res) => {
    const campaign = await organizerCampaignService.createCampaign({ user: req.user, body: req.body || {} });
    res.status(201).json({ campaign });
  })
);

router.get(
  "/campaigns/:campaignId",
  asyncHandler(async (req, res) => {
    const campaign = await organizerCampaignService.getCampaignForCustomer({
      user: req.user,
      campaignId: req.params.campaignId
    });
    res.json({ campaign });
  })
);

router.all(/^\/group-funded-campaigns(?:\/|$)/, (_req, res) => {
  res.status(410).json({ message: "This legacy campaign API has been retired. Use /api/account/campaigns." });
});

router.patch(
  "/campaigns/:campaignId/publish",
  campaignJoinLimiter,
  asyncHandler(async (req, res) => {
    const campaign = await organizerCampaignService.publishCampaign({
      user: req.user,
      campaignId: req.params.campaignId,
      visibility: req.body?.visibility,
      website: req.body?.website
    });
    res.json({ campaign });
  })
);

router.patch(
  "/campaigns/:campaignId",
  campaignJoinLimiter,
  asyncHandler(async (req, res) => res.json({ campaign: await organizerCampaignService.updateCampaign({ user: req.user, campaignId: req.params.campaignId, body: req.body || {} }) }))
);

router.patch(
  "/campaigns/:campaignId/unpublish",
  asyncHandler(async (req, res) => res.json({ campaign: await organizerCampaignService.unpublishCampaign({ user: req.user, campaignId: req.params.campaignId }) }))
);

router.get(
  "/bookings/:bookingId",
  asyncHandler(async (req, res) => {
    await bookingService.expirePendingBookingsForCustomer(req.user._id);
    const booking = await bookingRepository.findBookingById(req.params.bookingId);
    if (!booking || String(booking.customerUserId) !== String(req.user._id)) {
      const error = new Error("Booking not found.");
      error.statusCode = 404;
      throw error;
    }
    const organizerCampaign = /^\d+$/.test(String(booking._id)) ? await organizerCampaignRepository.findCampaignByBookingId(booking._id) : null;
    res.json({ booking: { ...formatCustomerBooking(booking), organizerCampaign: organizerCampaign ? { id: organizerCampaign.id, status: organizerCampaign.status } : null } });
  })
);

router.post(
  "/bookings",
  asyncHandler(async (req, res) => {
    const booking = await bookingService.createCustomerBooking({
      user: req.user,
      body: req.body || {}
    });

    res.status(201).json({
      booking: formatCustomerBooking(booking)
    });
  })
);

router.post(
  "/bookings/:bookingId/payment-proof/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("Payment proof image payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const upload = await bookingService.uploadCustomerPaymentProofDirect({
      user: req.user,
      bookingId: requireRequestParam(req.params.bookingId, "Booking"),
      body: {
        fileName: normalizeQueryText(req.query.fileName),
        contentType: normalizeQueryText(req.headers["content-type"])
      },
      fileBuffer: req.body
    });

    res.status(201).json(upload);
  })
);

router.post(
  "/bookings/:bookingId/payment-proof/uploads",
  asyncHandler(async (req, res) => {
    const upload = await bookingService.createCustomerPaymentProofUpload({
      user: req.user,
      bookingId: req.params.bookingId,
      body: req.body || {}
    });

    res.status(201).json(upload);
  })
);

router.post(
  "/bookings/:bookingId/payment-proof",
  asyncHandler(async (req, res) => {
    const booking = await bookingService.submitCustomerPaymentProof({
      user: req.user,
      bookingId: req.params.bookingId,
      body: req.body || {}
    });

    res.json({
      booking: formatCustomerBooking(booking)
    });
  })
);

router.get(
  "/bookings/:bookingId/payment-proof",
  asyncHandler(async (req, res) => {
    const proofAccess = await bookingService.createCustomerPaymentProofAccess({
      user: req.user,
      bookingId: req.params.bookingId
    });

    res.json(proofAccess);
  })
);

router.delete(
  "/bookings/:bookingId",
  asyncHandler(async (req, res) => {
    const booking = await bookingService.cancelCustomerBooking({
      user: req.user,
      bookingId: req.params.bookingId,
      reason: req.body?.reason
    });

    res.json({
      booking: formatCustomerBooking(booking)
    });
  })
);

router.post(
  "/password",
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || !newPassword) {
      const error = new Error("currentPassword and newPassword are required.");
      error.statusCode = 400;
      throw error;
    }

    await passwordResetService.changePassword({
      user: req.user,
      currentPassword,
      newPassword,
      req
    });

    res.json({
      success: true,
      message: "Your password has been changed. Please sign in again."
    });
  })
);

module.exports = router;
