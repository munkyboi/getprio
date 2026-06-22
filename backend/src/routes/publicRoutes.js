const express = require("express");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const vendorServiceRepository = require("../repositories/vendorServices");
const ticketRepository = require("../repositories/tickets");
const asyncHandler = require("../middleware/asyncHandler");
const { maybeAuthenticate } = require("../middleware/auth");
const queueEvents = require("../services/queueEvents");
const turnstileService = require("../services/turnstileService");
const queueJoinOtpService = require("../services/queueJoinOtpService");
const queueJoinPaymentService = require("../services/queueJoinPaymentService");
const queueFeeService = require("../services/queueFeeService");
const storeHoursService = require("../services/storeHoursService");
const notificationService = require("../services/notificationService");
const platformRepository = require("../repositories/platform");
const customerTicketAccess = require("../services/customerTicketAccess");
const {
  getQueueSnapshot,
  cancelTicket
} = require("../services/queueService");

const router = express.Router();

function formatPublicVendorService(service) {
  return {
    name: service.name,
    slug: service.slug,
    description: service.description,
    durationMinutes: service.durationMinutes,
    priceAmountCents: service.priceAmountCents,
    currency: service.currency,
    priceDisplay: service.priceDisplay
  };
}

async function attachPublicVendorDetails(vendor) {
  const tenant = await tenantRepository.findTenantBySlug(vendor.slug, { activeOnly: true });
  const primaryLocation = vendor.location.slug && tenant
    ? await storeLocationRepository.findLocationByTenantAndSlug(tenant._id, vendor.location.slug)
    : null;
  const publicBoardTheme = tenant
    ? await publicBoardThemeRepository.getResolvedTheme(tenant._id, primaryLocation?._id)
    : null;
  const services = tenant
    ? (await vendorServiceRepository.listServicesByTenantId(tenant._id))
        .filter((service) => service.isActive)
        .map(formatPublicVendorService)
    : [];

  return {
    ...vendor,
    services,
    publicBoardTheme
  };
}

router.get(
  "/vendors",
  asyncHandler(async (req, res) => {
    const vendors = await tenantRepository.listPublicVendorProfiles({
      search: req.query.search,
      limit: req.query.limit
    });
    const vendorsWithDetails = await Promise.all(
      vendors.map((vendor) => attachPublicVendorDetails(vendor))
    );

    res.json({ vendors: vendorsWithDetails });
  })
);

router.get(
  "/vendors/:tenantSlug",
  asyncHandler(async (req, res) => {
    const vendor = await tenantRepository.findPublicVendorProfileBySlug(
      String(req.params.tenantSlug).toLowerCase()
    );

    if (!vendor) {
      const error = new Error("Vendor not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({
      vendor: await attachPublicVendorDetails(vendor)
    });
  })
);

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

async function getLocationOrPrimary(tenant, locationSlug) {
  if (locationSlug) {
    const location = await storeLocationRepository.findLocationByTenantAndSlug(
      tenant._id,
      locationSlug
    );
    if (!location || !location.isActive) {
      const error = new Error("Location not found.");
      error.statusCode = 404;
      throw error;
    }
    return location;
  }

  const location = await storeLocationRepository.findPrimaryLocationByTenantId(tenant._id);
  if (!location) {
    const error = new Error("Location not found.");
    error.statusCode = 404;
    throw error;
  }
  return location;
}

function getRequestIp(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.ip
  );
}

async function verifyQrTurnstileIfNeeded(req, joinChannel) {
  if (joinChannel !== "qr") {
    return;
  }

  const verification = await turnstileService.verifyTurnstileToken({
    token: req.body.turnstileToken,
    remoteIp: getRequestIp(req)
  });

  if (!verification.success) {
    const error = new Error("Verification failed. Please retry the security check.");
    error.statusCode = 400;
    throw error;
  }
}

router.get(
  ["/tenant/:tenantSlug/queue", "/tenant/:tenantSlug/location/:locationSlug/queue"],
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const location = await getLocationOrPrimary(tenant, req.params.locationSlug);
    const snapshot = await getQueueSnapshot(tenant, {
      location,
      lookupCode: req.query.lookupCode
    });

    res.json(snapshot);
  })
);

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildJoinPayload(req, tenant, location) {
  const {
    customerName,
    customerEmail,
    customerPhone,
    notifyByEmail,
    notifyBySms,
    notes,
    joinChannel
  } = req.body;
  const normalizedJoinChannel = joinChannel || (req.user ? "online" : "qr");
  const payload = {
    userId: req.user?._id,
    customerName: customerName || req.user?.name,
    customerEmail: customerEmail || req.user?.email,
    customerPhone: customerPhone || req.user?.phone,
    notifyByEmail: Boolean(notifyByEmail),
    notifyBySms: Boolean(notifyBySms),
    joinChannel: normalizedJoinChannel,
    locationSlug: location.slug,
    notes
  };

  if (!payload.customerName) {
    const error = new Error("customerName is required.");
    error.statusCode = 400;
    throw error;
  }

  if (payload.notifyByEmail && !payload.customerEmail) {
    const error = new Error("Enter an email address to receive email queue updates.");
    error.statusCode = 400;
    throw error;
  }

  if (payload.notifyBySms && !payload.customerPhone) {
    const error = new Error("Enter a phone number to receive SMS queue updates.");
    error.statusCode = 400;
    throw error;
  }

  return payload;
}

router.post(
  "/enterprise-inquiries",
  asyncHandler(async (req, res) => {
    const businessName = normalizeText(req.body.businessName, 140);
    const contactName = normalizeText(req.body.contactName, 140);
    const email = normalizeEmail(req.body.email);
    const phone = normalizeText(req.body.phone, 80);
    const message = normalizeText(req.body.message, 1200);

    if (!businessName || !contactName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const error = new Error("Business name, contact name, and a valid email are required.");
      error.statusCode = 400;
      throw error;
    }

    const settings = await platformRepository.getPlatformSettings();
    const inquiryText = [
      "New GetPrio Enterprise setup inquiry",
      "",
      `Business: ${businessName}`,
      `Contact: ${contactName}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      "",
      "Message:",
      message || "No message provided."
    ].join("\n");

    await notificationService.sendEmail({
      to: settings.enterpriseInquiryEmail,
      subject: `Enterprise setup inquiry: ${businessName}`,
      text: inquiryText,
      purpose: "enterprise_inquiry",
      metadata: {
        businessName,
        contactName,
        email,
        phone
      }
    });

    res.status(201).json({ sent: true });
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
    const location = ticket.locationId
      ? await storeLocationRepository.findLocationById(ticket.locationId)
      : null;
    const snapshot = await getQueueSnapshot(tenant, {
      lookupCode: ticket.lookupCode,
      location: location || undefined
    });
    res.json(snapshot.focusTicket);
  })
);

router.post(
  ["/tenant/:tenantSlug/join", "/tenant/:tenantSlug/location/:locationSlug/join"],
  maybeAuthenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const location = await getLocationOrPrimary(tenant, req.params.locationSlug);
    const payload = buildJoinPayload(req, tenant, location);

    await queueFeeService.assertTenantCanAcceptCustomerJoins(tenant._id);
    await storeHoursService.assertLocationOpenForCustomerJoin(location);
    await verifyQrTurnstileIfNeeded(req, payload.joinChannel);

    const result = await queueJoinPaymentService.handleDirectJoin({
      tenant,
      payload
    });

    res.status(201).json(result);
  })
);

router.post(
  ["/tenant/:tenantSlug/join-otp", "/tenant/:tenantSlug/location/:locationSlug/join-otp"],
  maybeAuthenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const location = await getLocationOrPrimary(tenant, req.params.locationSlug);
    const payload = buildJoinPayload(req, tenant, location);

    await queueFeeService.assertTenantCanAcceptCustomerJoins(tenant._id);
    await storeHoursService.assertLocationOpenForCustomerJoin(location);
    await verifyQrTurnstileIfNeeded(req, payload.joinChannel);

    const otp = await queueJoinOtpService.requestJoinOtp({
      tenant,
      payload
    });

    res.status(201).json(otp);
  })
);

router.post(
  ["/tenant/:tenantSlug/join-otp/verify", "/tenant/:tenantSlug/location/:locationSlug/join-otp/verify"],
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const location = await getLocationOrPrimary(tenant, req.params.locationSlug);
    await queueFeeService.assertTenantCanAcceptCustomerJoins(tenant._id);
    await storeHoursService.assertLocationOpenForCustomerJoin(location);
    const payload = await queueJoinOtpService.verifyJoinOtp({
      tenant,
      otpId: req.body.otpId,
      code: req.body.code
    });
    const result = await queueJoinPaymentService.handleVerifiedJoin({
      tenant,
      otpId: req.body.otpId,
      payload
    });

    if (result.requiresPayment) {
      res.status(201).json(result);
      return;
    }

    res.status(201).json(result);
  })
);

router.post(
  [
    "/tenant/:tenantSlug/join-payments/:paymentId/sync",
    "/tenant/:tenantSlug/location/:locationSlug/join-payments/:paymentId/sync"
  ],
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const result = await queueJoinPaymentService.syncQueueJoinPayment({
      tenant,
      paymentId: req.params.paymentId
    });

    res.json(result);
  })
);

router.post(
  [
    "/tenant/:tenantSlug/join-otp/:otpId/resend",
    "/tenant/:tenantSlug/location/:locationSlug/join-otp/:otpId/resend"
  ],
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const otp = await queueJoinOtpService.resendJoinOtp({
      tenant,
      otpId: req.params.otpId
    });

    res.status(201).json(otp);
  })
);

router.post(
  "/tenant/:tenantSlug/tickets",
  maybeAuthenticate,
  asyncHandler(async (req, _res) => {
    await getTenantOrThrow(req.params.tenantSlug);
    const error = new Error("OTP verification is required before joining the queue.");
    error.statusCode = 400;
    throw error;
  })
);

router.delete(
  [
    "/tenant/:tenantSlug/tickets/:lookupCode",
    "/tenant/:tenantSlug/location/:locationSlug/tickets/:lookupCode"
  ],
  maybeAuthenticate,
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const requestedLocation = req.params.locationSlug
      ? await getLocationOrPrimary(tenant, req.params.locationSlug)
      : null;
    const existingTicket = await ticketRepository.findTicketByTenantAndLookupCode(
      tenant._id,
      String(req.params.lookupCode).toUpperCase()
    );

    if (!existingTicket) {
      const error = new Error("Waiting ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    const authenticatedOwner = customerTicketAccess.userOwnsTicket(req.user, existingTicket);
    const requestOwner = customerTicketAccess.requestMatchesTicket(req.body, existingTicket);

    if (!authenticatedOwner && !requestOwner) {
      const error = new Error("We could not verify that this ticket belongs to you.");
      error.statusCode = 403;
      throw error;
    }

    if (
      requestedLocation &&
      String(existingTicket.locationId || "") !== String(requestedLocation._id)
    ) {
      const error = new Error("Waiting ticket not found.");
      error.statusCode = 404;
      throw error;
    }

    const ticketLocation = existingTicket.locationId
      ? await storeLocationRepository.findLocationById(existingTicket.locationId)
      : requestedLocation;

    if (existingTicket.status !== "waiting") {
      const error = new Error("Only waiting tickets can be cancelled.");
      error.statusCode = 409;
      throw error;
    }

    const result = await cancelTicket(tenant, req.params.lookupCode, {
      actorUserId: req.user?._id,
      actorRole: req.user ? "customer" : null,
      source: "public",
      location: ticketLocation || undefined
    });

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
  ["/tenant/:tenantSlug/stream", "/tenant/:tenantSlug/location/:locationSlug/stream"],
  asyncHandler(async (req, res) => {
    const tenant = await getTenantOrThrow(req.params.tenantSlug);
    const location = await getLocationOrPrimary(tenant, req.params.locationSlug);
    const lookupCode = req.query.lookupCode ? String(req.query.lookupCode) : "";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const writeSnapshot = async (snapshot) => {
      const payload = lookupCode
        ? await getQueueSnapshot(tenant, { lookupCode, location })
        : snapshot || (await getQueueSnapshot(tenant, { location }));
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
