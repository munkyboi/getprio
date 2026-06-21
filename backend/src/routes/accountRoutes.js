const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const bookingRepository = require("../repositories/bookings");
const ticketRepository = require("../repositories/tickets");
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
    servicePriceDisplay: booking.servicePriceDisplay,
    scheduledStartAt: booking.scheduledStartAt,
    scheduledEndAt: booking.scheduledEndAt,
    status: booking.status,
    notes: booking.notes,
    paymentReference: booking.paymentReference,
    paymentStatus: booking.paymentStatus,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  };
}

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const tickets = await ticketRepository.listTicketsForCustomerAccount(req.user, { limit: 50 });

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        emailVerified: Boolean(req.user.emailVerified)
      },
      tickets: tickets.map(formatCustomerTicket)
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
    const bookings = await bookingRepository.listBookingsForCustomer(req.user._id, { limit });

    res.json({
      bookings: bookings.map(formatCustomerBooking)
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
