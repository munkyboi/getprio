const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const bookingRepository = require("../repositories/bookings");
const groupFundedRepository = require("../repositories/groupFundedBookings");
const ticketRepository = require("../repositories/tickets");
const tenantRepository = require("../repositories/tenants");
const userRepository = require("../repositories/users");
const bookingService = require("../services/bookingService");
const groupFundedBookingService = require("../services/groupFundedBookingService");
const locationPaymentQrUploadService = require("../services/locationPaymentQrUploadService");
const passwordResetService = require("../services/passwordResetService");
const pushNotificationService = require("../services/pushNotificationService");
const customerTicketAccess = require("../services/customerTicketAccess");
const { assertTenantPermission } = require("../middleware/auth");
const { formatPaginationMetadata, parsePaginationParams } = require("../utils/pagination");

const router = express.Router();

router.use(authenticate);

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

  if (!booking.serviceManualPaymentRequired) {
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
    amountCents: Number(booking.servicePriceAmountCents || 0) * Number(booking.bookingQuantity || 1),
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
    bookingQuantity: booking.bookingQuantity,
    scheduledStartAt: booking.scheduledStartAt,
    scheduledEndAt: booking.scheduledEndAt,
    status: booking.status,
    notes: booking.notes,
    paymentReference: booking.paymentReference,
    paymentStatus: booking.paymentStatus,
    groupFundedBookingId: booking.groupFundedBookingId,
    bookingPaymentSource: booking.bookingPaymentSource,
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

function formatGroupFundedCampaign(campaign, contribution = null, refunds = [], tenant = null, options = {}) {
  return {
    id: campaign._id,
    publicToken: campaign.publicToken,
    tenantId: campaign.tenantId,
    tenantSlug: tenant?.slug || null,
    vendorName: tenant?.name || "",
    vendorCategory: tenant?.publicProfileCategory || "",
    locationId: campaign.locationId,
    serviceId: campaign.serviceId,
    isOrganizer: Boolean(
      options.actorUserId && String(campaign.organizerUserId) === String(options.actorUserId)
    ),
    campaignStatus: campaign.campaignStatus,
    visibility: campaign.visibility,
    organizerDisplayName: campaign.organizerDisplayName,
    campaignTitle: campaign.campaignTitle || campaign.serviceNameSnapshot,
    description: campaign.description,
    serviceName: campaign.serviceNameSnapshot,
    serviceSlug: campaign.serviceSlugSnapshot,
    bundleItems: campaign.bundleItems || [],
    locationName: campaign.locationNameSnapshot,
    locationSlug: campaign.locationSlugSnapshot,
    bookingQuantity: campaign.bookingQuantity,
    scheduledStartAt: campaign.scheduledStartAt,
    scheduledEndAt: campaign.scheduledEndAt,
    fundingDeadlineAt: campaign.fundingDeadlineAt,
    currency: campaign.currency,
    targetAmountCents: campaign.targetAmountCents,
    requiredContributionAmountCents: campaign.requiredContributionAmountCents,
    roundingAdjustmentCents: campaign.roundingAdjustmentCents,
    requiredContributors: campaign.requiredContributors,
    paidParticipantCount: campaign.paidParticipantCount,
    fundedAmountCents: campaign.fundedAmountCents,
    fundedAt: campaign.fundedAt,
    contributorReservationSummary: campaign.contributorReservationSummary || null,
    paymentDestination: campaign.paymentDestination || null,
    replacementSlot: campaign.replacementScheduledStartAt
      ? {
          scheduledStartAt: campaign.replacementScheduledStartAt,
          scheduledEndAt: campaign.replacementScheduledEndAt,
          proposedAt: campaign.replacementProposedAt,
          note: campaign.replacementNote
        }
      : null,
    linkedBookingId: campaign.linkedBookingId,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    contribution: contribution
      ? {
          id: contribution._id,
          amountCents: contribution.amountCents,
          currency: contribution.currency,
          contributionStatus: contribution.contributionStatus,
          paymentReference: contribution.paymentReference,
          paymentProof: contribution.paymentProofObjectKey
            ? {
                fileName: contribution.paymentProofFileName,
                contentType: contribution.paymentProofContentType,
                sizeBytes: contribution.paymentProofSizeBytes,
                uploadedAt: contribution.paymentProofUploadedAt
              }
            : null,
          submittedAt: contribution.submittedAt,
          verifiedAt: contribution.verifiedAt,
          rejectedAt: contribution.rejectedAt,
          rejectionReason: contribution.rejectionReason,
          refundStatus: contribution.refundStatus
        }
      : null,
    refunds: refunds.map((refund) => ({
      id: refund._id,
      contributionId: refund.contributionId,
      amountCents: refund.amountCents,
      currency: refund.currency,
      refundReason: refund.refundReason,
      refundStatus: refund.refundStatus,
      completedAt: refund.completedAt,
      createdAt: refund.createdAt
    }))
  };
}

function formatAccountUser(user) {
  return {
    id: user._id,
    name: user.name,
    displayName: user.displayName || "",
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
    queueAlerts: settings.queueAlerts !== false
  };
}

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const tickets = await ticketRepository.listTicketsForCustomerAccount(req.user, { limit: 50 });

    res.json({
    user: {
      ...formatAccountUser(req.user)
    },
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

    if (!customerTicketAccess.userOwnsTicket(req.user, ticket)) {
      const error = new Error("We could not verify that this ticket belongs to you.");
      error.statusCode = 403;
      throw error;
    }

    const claimedTicket = await ticketRepository.claimTicketForUser(ticket._id, req.user._id);

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
  "/group-funded-campaigns",
  asyncHandler(async (req, res) => {
    const campaignRecords = await groupFundedBookingService.listCustomerCampaigns({ user: req.user });
    res.json({
      campaigns: campaignRecords.map(({ campaign, contribution }) => formatGroupFundedCampaign(campaign, contribution, [], null, {
        actorUserId: req.user._id
      }))
    });
  })
);

router.post(
  "/group-funded-campaigns",
  asyncHandler(async (req, res) => {
    const campaign = await groupFundedBookingService.createCampaign({
      user: req.user,
      body: req.body || {}
    });
    res.status(201).json({
      campaign: formatGroupFundedCampaign(campaign, null, [], null, { actorUserId: req.user._id })
    });
  })
);

router.get(
  "/group-funded-campaigns/:campaignIdOrToken/self",
  asyncHandler(async (req, res) => {
    const { campaign, contribution, refunds, tenant } = await groupFundedBookingService.getCampaignForCustomer({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken
    });
    res.json({
      campaign: formatGroupFundedCampaign(campaign, contribution, refunds, tenant, {
        actorUserId: req.user._id
      })
    });
  })
);

router.get(
  "/group-funded-campaigns/:campaignIdOrToken/payment-qr",
  asyncHandler(async (req, res) => {
    const { campaign } = await groupFundedBookingService.getCampaignForCustomer({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken
    });
    if (!campaign.paymentDestination?.qrImageUrl) {
      const error = new Error("Payment QR image is unavailable.");
      error.statusCode = 404;
      throw error;
    }

    const qrImage = await locationPaymentQrUploadService.downloadBinary({
      publicUrl: campaign.paymentDestination.qrImageUrl
    });
    res.setHeader("Content-Type", qrImage.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${qrImage.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(qrImage.body);
  })
);

router.patch(
  "/group-funded-campaigns/:campaignIdOrToken/details",
  asyncHandler(async (req, res) => {
    const result = await groupFundedBookingService.updateOrganizerCampaignDetails({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken,
      body: req.body || {}
    });
    res.json({
      campaign: formatGroupFundedCampaign(result.campaign, null, [], result.tenant, { actorUserId: req.user._id })
    });
  })
);

router.patch(
  "/group-funded-campaigns/:campaignIdOrToken/cancel",
  asyncHandler(async (req, res) => {
    const result = await groupFundedBookingService.cancelOrganizerCampaign({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken,
      reason: req.body?.reason
    });
    res.json({
      campaign: formatGroupFundedCampaign(result.campaign, null, [], null, { actorUserId: req.user._id }),
      refunds: result.refunds.map((refund) => ({
        id: refund._id,
        contributionId: refund.contributionId,
        amountCents: refund.amountCents,
        currency: refund.currency,
        refundReason: refund.refundReason,
        refundStatus: refund.refundStatus,
        completedAt: refund.completedAt,
        createdAt: refund.createdAt
      }))
    });
  })
);

router.patch(
  "/group-funded-campaigns/:campaignIdOrToken/replacement-slot/accept",
  asyncHandler(async (req, res) => {
    const result = await groupFundedBookingService.acceptReplacementSlot({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken
    });
    res.json({
      campaign: formatGroupFundedCampaign(result.campaign, null, [], null, { actorUserId: req.user._id })
    });
  })
);

router.patch(
  "/group-funded-campaigns/:campaignIdOrToken/replacement-slot/decline",
  asyncHandler(async (req, res) => {
    const result = await groupFundedBookingService.declineReplacementSlot({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken,
      reason: req.body?.reason
    });
    res.json({
      campaign: formatGroupFundedCampaign(result.campaign, null, [], null, { actorUserId: req.user._id }),
      refunds: result.refunds.map((refund) => ({
        id: refund._id,
        contributionId: refund.contributionId,
        amountCents: refund.amountCents,
        currency: refund.currency,
        refundReason: refund.refundReason,
        refundStatus: refund.refundStatus,
        completedAt: refund.completedAt,
        createdAt: refund.createdAt
      }))
    });
  })
);

router.post(
  "/group-funded-campaigns/:campaignIdOrToken/contributions/payment-proof/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("Contribution proof file payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const upload = await groupFundedBookingService.uploadContributionProofDirect({
      user: req.user,
      campaignIdOrToken: requireRequestParam(req.params.campaignIdOrToken, "Campaign"),
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
  "/group-funded-campaigns/:campaignIdOrToken/contributions/payment-proof",
  asyncHandler(async (req, res) => {
    const { campaign, contribution } = await groupFundedBookingService.submitContributionProof({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken,
      body: req.body || {}
    });
    res.status(201).json({
      campaign: formatGroupFundedCampaign(campaign, contribution, [], null, { actorUserId: req.user._id })
    });
  })
);

router.get(
  "/group-funded-campaigns/:campaignIdOrToken/contributions/payment-proof",
  asyncHandler(async (req, res) => {
    const proofAccess = await groupFundedBookingService.createCustomerContributionProofAccess({
      user: req.user,
      campaignIdOrToken: req.params.campaignIdOrToken
    });
    res.json(proofAccess);
  })
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
    if (booking.groupFundedBookingId) {
      booking.groupFundedBundleItems = await groupFundedRepository.listCampaignItemsByCampaign(
        booking.groupFundedBookingId
      );
      booking.groupFundedContributions = await groupFundedRepository.listContributionsByCampaign(
        booking.groupFundedBookingId,
        {
          statuses: [
            groupFundedRepository.CONTRIBUTION_STATUSES.VERIFIED
          ]
        }
      );
    }

    res.json({
      booking: formatCustomerBooking(booking)
    });
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
