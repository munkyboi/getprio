const express = require("express");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate } = require("../middleware/auth");
const ticketRepository = require("../repositories/tickets");

const router = express.Router();

router.use(authenticate);

router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const tickets = await ticketRepository.listTicketsByUserId(req.user._id, { limit: 50 });

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        emailVerified: Boolean(req.user.emailVerified)
      },
      tickets: tickets.map((ticket) => ({
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
      }))
    });
  })
);

module.exports = router;
