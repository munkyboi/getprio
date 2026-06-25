const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const bookingRepository = require("../repositories/bookings");
const ticketRepository = require("../repositories/tickets");
const userRepository = require("../repositories/users");
const bookingService = require("../services/bookingService");
const passwordResetService = require("../services/passwordResetService");

const router = express.Router();

router.use(authenticate);

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

  if (!booking.locationPaymentQrActive || !booking.locationPaymentQrImageUrl) {
    return null;
  }

  return {
    methodLabel: booking.locationPaymentMethodLabel,
    accountDisplayName: booking.locationPaymentAccountDisplayName,
    accountIdentifierDisplay: booking.locationPaymentAccountIdentifierDisplay,
    qrImageUrl: booking.locationPaymentQrImageUrl,
    amountCents: Number(booking.servicePriceAmountCents || 0) * Number(booking.bookingQuantity || 1),
    currency: booking.serviceCurrency || "PHP",
    unitPriceDisplay: booking.servicePriceDisplay
  };
}

function formatCustomerBooking(booking) {
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

function formatAccountUser(user) {
  return {
    id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    emailVerified: Boolean(user.emailVerified),
    mfaEnabled: Boolean(user.mfaEnabled),
    mfaRequired: Boolean(user.mfaRequired)
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
      tickets: tickets.map(formatCustomerTicket)
    });
  })
);

router.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || "").trim();

    if (!name) {
      const error = new Error("Name is required.");
      error.statusCode = 400;
      throw error;
    }

    const updatedUser = await userRepository.updateUser(req.user._id, {
      name
    });

    res.json({
      user: formatAccountUser(updatedUser),
      success: true,
      message: "Profile details updated."
    });
  })
);

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 50) || 50, 1), 100);
    const tickets = await ticketRepository.listTicketsForCustomerAccount(req.user, { limit });

    res.json({
      tickets: tickets.map(formatCustomerTicket)
    });
  })
);

router.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 50) || 50, 1), 100);
    await bookingService.expirePendingBookingsForCustomer(req.user._id);
    const bookings = await bookingRepository.listBookingsForCustomer(req.user._id, { limit });

    res.json({
      bookings: bookings.map(formatCustomerBooking)
    });
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
      bookingId: req.params.bookingId,
      body: {
        fileName: req.query.fileName,
        contentType: req.headers["content-type"],
        sizeBytes: req.body.length
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
