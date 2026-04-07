const express = require("express");
const tenantRepository = require("../repositories/tenants");
const ticketRepository = require("../repositories/tickets");
const asyncHandler = require("../middleware/asyncHandler");
const { authenticate, userHasTenantAccess } = require("../middleware/auth");
const {
  createTicket,
  getQueueSnapshot,
  callNextTicket,
  updateCurrentTicketStatus
} = require("../services/queueService");

const router = express.Router();

async function getAuthorizedTenant(user, tenantSlug) {
  const tenant = await tenantRepository.findTenantBySlug(String(tenantSlug).toLowerCase());
  if (!tenant) {
    const error = new Error("Tenant not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!userHasTenantAccess(user, tenant._id)) {
    const error = new Error("You do not have access to that tenant.");
    error.statusCode = 403;
    throw error;
  }

  return tenant;
}

router.use(authenticate);

router.get(
  "/tenant/:tenantSlug/dashboard",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const snapshot = await getQueueSnapshot(tenant);

    res.json(snapshot);
  })
);

router.post(
  "/tenant/:tenantSlug/tickets",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const { customerName, customerEmail, customerPhone, notifyByEmail, notifyBySms, notes } = req.body;

    if (!customerName) {
      const error = new Error("customerName is required.");
      error.statusCode = 400;
      throw error;
    }

    const result = await createTicket({
      tenant,
      customerName,
      customerEmail,
      customerPhone,
      notifyByEmail,
      notifyBySms,
      joinChannel: "vendor",
      notes
    });

    res.status(201).json({
      ticket: {
        id: String(result.ticket._id),
        ticketNumber: result.ticket.ticketNumber,
        lookupCode: result.ticket.lookupCode,
        status: result.ticket.status
      },
      snapshot: result.snapshot
    });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/call-next",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const result = await callNextTicket(tenant);

    if (!result) {
      res.json({
        message: "No waiting tickets in the queue.",
        snapshot: await getQueueSnapshot(tenant)
      });
      return;
    }

    res.json({
      ticket: {
        id: String(result.ticket._id),
        ticketNumber: result.ticket.ticketNumber,
        status: result.ticket.status
      },
      snapshot: result.snapshot
    });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/current/serve",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const result = await updateCurrentTicketStatus(tenant, "served");

    if (!result) {
      const error = new Error("There is no active ticket to serve.");
      error.statusCode = 400;
      throw error;
    }

    res.json({
      ticket: {
        id: String(result.ticket._id),
        ticketNumber: result.ticket.ticketNumber,
        status: result.ticket.status
      },
      snapshot: result.snapshot
    });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/current/skip",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const result = await updateCurrentTicketStatus(tenant, "skipped");

    if (!result) {
      const error = new Error("There is no active ticket to skip.");
      error.statusCode = 400;
      throw error;
    }

    res.json({
      ticket: {
        id: String(result.ticket._id),
        ticketNumber: result.ticket.ticketNumber,
        status: result.ticket.status
      },
      snapshot: result.snapshot
    });
  })
);

router.patch(
  "/tenant/:tenantSlug/settings",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const { queuePrefix, averageServiceMinutes, notificationThreshold, contactEmail, contactPhone } = req.body;

    const updatedTenant = await tenantRepository.updateTenant(tenant._id, {
      queuePrefix: queuePrefix ? String(queuePrefix).slice(0, 4).toUpperCase() : tenant.queuePrefix,
      averageServiceMinutes: averageServiceMinutes ? Number(averageServiceMinutes) : tenant.averageServiceMinutes,
      notificationThreshold: notificationThreshold ? Number(notificationThreshold) : tenant.notificationThreshold,
      contactEmail: typeof contactEmail === "string" ? contactEmail : tenant.contactEmail,
      contactPhone: typeof contactPhone === "string" ? contactPhone : tenant.contactPhone
    });

    res.json({
      tenant: {
        id: String(updatedTenant._id),
        name: updatedTenant.name,
        slug: updatedTenant.slug,
        queuePrefix: updatedTenant.queuePrefix,
        averageServiceMinutes: updatedTenant.averageServiceMinutes,
        notificationThreshold: updatedTenant.notificationThreshold,
        contactEmail: updatedTenant.contactEmail,
        contactPhone: updatedTenant.contactPhone
      },
      snapshot: await getQueueSnapshot(updatedTenant)
    });
  })
);

router.get(
  "/tenant/:tenantSlug/history",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const tickets = await ticketRepository.listHistoryTickets(tenant._id, { limit });

    res.json({
      tickets: tickets.map((ticket) => ({
        id: String(ticket._id),
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        status: ticket.status,
        updatedAt: ticket.updatedAt
      }))
    });
  })
);

module.exports = router;
