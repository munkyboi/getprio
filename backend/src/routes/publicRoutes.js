const express = require("express");
const tenantRepository = require("../repositories/tenants");
const ticketRepository = require("../repositories/tickets");
const asyncHandler = require("../middleware/asyncHandler");
const { maybeAuthenticate } = require("../middleware/auth");
const queueEvents = require("../services/queueEvents");
const {
  createTicket,
  getQueueSnapshot,
  cancelTicket
} = require("../services/queueService");

const router = express.Router();

async function getTenantOrThrow(tenantSlug) {
  const tenant = await tenantRepository.findTenantBySlug(String(tenantSlug).toLowerCase(), {
    activeOnly: true
  });

  if (!tenant) {
    const error = new Error("Tenant not found.");
    error.statusCode = 404;
    throw error;
  }

  return tenant;
}

router.get(
  "/tenant/:tenantSlug/queue",
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const snapshot = await getQueueSnapshot(tenant, {
      lookupCode: req.query.lookupCode
    });

    res.json(snapshot);
  })
);

router.get(
  "/ticket/:lookupCode",
  asyncHandler(async (req, res) => {
    const ticket = await ticketRepository.findTicketByLookupCode(
      String(req.params.lookupCode).toUpperCase()
    );

    if (!ticket) {
      const error = new Error("Ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    const tenant = await tenantRepository.findTenantById(ticket.tenantId);
    const snapshot = await getQueueSnapshot(tenant, { lookupCode: ticket.lookupCode });
    res.json(snapshot.focusTicket);
  })
);

router.post(
  "/tenant/:tenantSlug/tickets",
  maybeAuthenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const { customerName, customerEmail, customerPhone, notifyByEmail, notifyBySms, notes, joinChannel } = req.body;

    const name = customerName || req.user?.name;
    const email = customerEmail || req.user?.email;
    const phone = customerPhone || req.user?.phone;

    if (!name) {
      const error = new Error("customerName is required.");
      error.statusCode = 400;
      throw error;
    }

    const result = await createTicket({
      tenant,
      userId: req.user?._id,
      customerName: name,
      customerEmail: email,
      customerPhone: phone,
      notifyByEmail,
      notifyBySms,
      joinChannel: joinChannel || (req.user ? "online" : "qr"),
      notes
    });

    res.status(201).json({
      ticket: {
        id: String(result.ticket._id),
        lookupCode: result.ticket.lookupCode,
        ticketNumber: result.ticket.ticketNumber,
        customerName: result.ticket.customerName,
        status: result.ticket.status
      },
      snapshot: result.snapshot
    });
  })
);

router.delete(
  "/tenant/:tenantSlug/tickets/:lookupCode",
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const result = await cancelTicket(tenant, req.params.lookupCode);

    if (!result) {
      const error = new Error("Waiting ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({
      ticket: {
        lookupCode: result.ticket.lookupCode,
        status: result.ticket.status
      },
      snapshot: result.snapshot
    });
  })
);

router.get(
  "/tenant/:tenantSlug/stream",
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const lookupCode = req.query.lookupCode ? String(req.query.lookupCode) : "";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const writeSnapshot = async (snapshot) => {
      const payload = lookupCode
        ? await getQueueSnapshot(tenant, { lookupCode })
        : snapshot || (await getQueueSnapshot(tenant));
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    await writeSnapshot();

    const unsubscribe = queueEvents.subscribe(tenant.slug, async (snapshot) => {
      try {
        await writeSnapshot(snapshot);
      } catch (error) {
        console.error(error);
      }
    });

    const heartbeat = setInterval(() => {
      res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  })
);

module.exports = router;
