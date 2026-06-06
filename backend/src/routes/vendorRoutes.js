const express = require("express");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const serviceCounterRepository = require("../repositories/serviceCounters");
const userRepository = require("../repositories/users");
const asyncHandler = require("../middleware/asyncHandler");
const {
  authenticate,
  userHasTenantAccess,
  assertTenantPermission
} = require("../middleware/auth");
const billingService = require("../services/billingService");
const publicBoardThemeUploadService = require("../services/publicBoardThemeUploadService");
const storeHoursService = require("../services/storeHoursService");
const PDFDocument = require("pdfkit");
const {
  createTicket,
  getQueueSnapshot,
  callNextTicket,
  updateCurrentTicketStatus,
  closeQueueDay,
  reopenQueueDay,
  restoreSkippedTicket
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

async function getLocationForTenant(tenant, locationSlug) {
  if (locationSlug) {
    const location = await storeLocationRepository.findLocationByTenantAndSlug(
      tenant._id,
      locationSlug
    );
    if (!location) {
      const error = new Error("Location not found.");
      error.statusCode = 404;
      throw error;
    }
    return location;
  }

  return storeLocationRepository.findPrimaryLocationByTenantId(tenant._id);
}

async function formatLocation(location, tenant) {
  const hours = await storeLocationRepository.listHoursByLocationId(location._id);
  const openStatus = await storeHoursService.getOpenStatus(location, { hours });

  return {
    id: String(location._id),
    tenantId: String(location.tenantId),
    name: location.name,
    slug: location.slug,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    province: location.province,
    postalCode: location.postalCode,
    country: location.country,
    contactEmail: location.contactEmail,
    contactPhone: location.contactPhone,
    timezone: location.timezone,
    isPrimary: location.isPrimary,
    isActive: location.isActive,
    joinUrl: `${process.env.APP_BASE_URL || "http://localhost:5173"}/join/${tenant.slug}/${location.slug}`,
    monitorUrl: `${process.env.APP_BASE_URL || "http://localhost:5173"}/monitor/${tenant.slug}/${location.slug}`,
    openStatus,
    hours: hours.map((hour) => ({
      weekday: hour.weekday,
      opensAt: hour.opensAt,
      closesAt: hour.closesAt,
      isClosed: hour.isClosed
    }))
  };
}

function normalizeCounterSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getCounterForLocation(location, counterSlug) {
  if (!counterSlug) {
    return null;
  }

  const counter = await serviceCounterRepository.findCounterByLocationAndSlug(
    location._id,
    normalizeCounterSlug(counterSlug)
  );
  if (!counter) {
    const error = new Error("Counter not found.");
    error.statusCode = 404;
    throw error;
  }
  return counter;
}

router.use(authenticate);

router.get(
  "/tenant/:tenantSlug/dashboard",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const location = await getLocationForTenant(tenant, req.query.location);
    const snapshot = await getQueueSnapshot(tenant, { location });

    res.json(snapshot);
  })
);

router.get(
  "/tenant/:tenantSlug/locations",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const billing = await billingService.getBillingOverview(tenant._id);
    const locations = await storeLocationRepository.listLocationsByTenantId(tenant._id);
    const activeLocationLimit =
      billing.subscription?.entitlements?.locations ||
      billing.plans.find((plan) => plan.slug === billing.subscription?.planSlug)?.entitlements.locations ||
      1;

    res.json({
      activeLocationLimit,
      locations: await Promise.all(locations.map((location) => formatLocation(location, tenant)))
    });
  })
);

router.get(
  "/tenant/:tenantSlug/public-board-theme",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const location = await getLocationForTenant(tenant, req.query.location);
    const theme = await publicBoardThemeRepository.getResolvedTheme(tenant._id, location?._id);

    res.json(theme);
  })
);

router.patch(
  "/tenant/:tenantSlug/public-board-theme",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.theme.manage");
    const location = await getLocationForTenant(tenant, req.query.location);

    if (!location && !req.body.applyToAllLocations) {
      const error = new Error("A location is required when saving a location theme.");
      error.statusCode = 400;
      throw error;
    }

    const theme = await publicBoardThemeRepository.saveTheme({
      tenantId: tenant._id,
      locationId: location?._id,
      theme: req.body.theme || {},
      applyToAllLocations: Boolean(req.body.applyToAllLocations),
      userId: req.user?._id
    });

    res.json(theme);
  })
);

router.post(
  "/tenant/:tenantSlug/public-board-theme/uploads",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.theme.manage");
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    if (!entitlements.brandedQueuePages) {
      const error = new Error("Public board rebranding is not available for this plan.");
      error.statusCode = 403;
      throw error;
    }
    const requestedLocationSlug = req.body.locationSlug || req.query.location;
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    const upload = await publicBoardThemeUploadService.createUpload({
      tenant,
      location,
      user: req.user,
      body: req.body
    });

    res.status(201).json(upload);
  })
);

router.post(
  "/tenant/:tenantSlug/locations",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const billing = await billingService.getBillingOverview(tenant._id);
    const activeLocationLimit = billing.subscription?.entitlements?.locations || 1;
    const existingLocations = await storeLocationRepository.listLocationsByTenantId(tenant._id);
    const activeCount = existingLocations.filter((location) => location.isActive).length;

    if (req.body.isActive !== false && activeCount >= activeLocationLimit) {
      const error = new Error("Active location limit exceeded for this subscription plan.");
      error.statusCode = 403;
      throw error;
    }

    const location = await storeLocationRepository.createLocation({
      tenantId: tenant._id,
      ...req.body,
      timezone: req.body.timezone || "Asia/Manila"
    });
    await storeLocationRepository.createDefaultHours(location._id);

    res.status(201).json({ location: await formatLocation(location, tenant) });
  })
);

router.patch(
  "/tenant/:tenantSlug/locations/:locationSlug",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const location = await getLocationForTenant(tenant, req.params.locationSlug);
    if (req.body.isActive === true && !location.isActive) {
      const billing = await billingService.getBillingOverview(tenant._id);
      const activeLocationLimit = billing.subscription?.entitlements?.locations || 1;
      const existingLocations = await storeLocationRepository.listLocationsByTenantId(tenant._id);
      const activeCount = existingLocations.filter((locationItem) => locationItem.isActive).length;

      if (activeCount >= activeLocationLimit) {
        const error = new Error("Active location limit exceeded for this subscription plan.");
        error.statusCode = 403;
        throw error;
      }
    }

    const updatedLocation = await storeLocationRepository.updateLocation(location._id, req.body);

    res.json({ location: await formatLocation(updatedLocation, tenant) });
  })
);

router.patch(
  "/tenant/:tenantSlug/locations/:locationSlug/hours",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const location = await getLocationForTenant(tenant, req.params.locationSlug);
    const hours = Array.isArray(req.body.hours) ? req.body.hours : [];
    await storeLocationRepository.replaceHours(location._id, hours);
    const updatedLocation = await storeLocationRepository.findLocationById(location._id);

    res.json({ location: await formatLocation(updatedLocation, tenant) });
  })
);

router.post(
  "/tenant/:tenantSlug/tickets",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, req.query.location);
    const { customerName, customerEmail, customerPhone, notifyByEmail, notifyBySms, notes } = req.body;

    if (!customerName) {
      const error = new Error("customerName is required.");
      error.statusCode = 400;
      throw error;
    }

    const result = await createTicket({
      tenant,
      location,
      customerName,
      customerEmail,
      customerPhone,
      notifyByEmail,
      notifyBySms,
      joinChannel: "vendor",
      notes,
      actorUserId: req.user?._id,
      actorRole: "vendor"
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
  "/tenant/:tenantSlug/queue/close",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, req.query.location);
    const snapshot = await closeQueueDay(tenant, {
      location,
      reason: typeof req.body.reason === "string" ? req.body.reason.trim() : "",
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

    res.json({
      message: "Queue day closed.",
      snapshot
    });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/reopen",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, req.query.location);
    const snapshot = await reopenQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

    res.json({
      message: "Queue day reopened.",
      snapshot
    });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/call-next",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, req.query.location);
    const serviceCounter = await getCounterForLocation(location, req.body.counterSlug);
    const result = await callNextTicket(tenant, {
      location,
      serviceCounter,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

    if (!result) {
      res.json({
        message: "No waiting tickets in the queue.",
        snapshot: await getQueueSnapshot(tenant, { location })
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
  "/tenant/:tenantSlug/queue/tickets/:ticketId/restore",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.ticket.update_state");
    const location = await getLocationForTenant(tenant, req.query.location);
    const lookupCode = String(req.body.lookupCode || "").trim().toUpperCase();

    if (!lookupCode) {
      const error = new Error("lookupCode is required.");
      error.statusCode = 400;
      throw error;
    }

    const result = await restoreSkippedTicket(tenant, req.params.ticketId, {
      location,
      lookupCode,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

    if (!result) {
      const error = new Error("Skipped ticket not found.");
      error.statusCode = 404;
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
  "/tenant/:tenantSlug/queue/current/serve",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.ticket.update_state");
    const location = await getLocationForTenant(tenant, req.query.location);
    const result = await updateCurrentTicketStatus(tenant, "served", {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

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
    assertTenantPermission(req.user, tenant._id, "tenant.ticket.update_state");
    const location = await getLocationForTenant(tenant, req.query.location);
    const result = await updateCurrentTicketStatus(tenant, "skipped", {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

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
    assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");
    await getLocationForTenant(tenant, req.query.location);
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
    assertTenantPermission(req.user, tenant._id, "tenant.reports.read");
    const location = await getLocationForTenant(tenant, req.query.location);
    const limit = Math.min(Number(req.query.limit || 20), 50);
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const tickets = await ticketRepository.listHistoryTickets(tenant._id, {
      limit,
      historyDays: entitlements.historyDays,
      locationId: location?._id
    });

    res.json({
      historyDays: entitlements.historyDays,
      historyLabel: entitlements.historyLabel,
      tickets: tickets.map((ticket) => ({
        id: String(ticket._id),
        lookupCode: ticket.lookupCode,
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        status: ticket.status,
        updatedAt: ticket.updatedAt,
        rejoinDeadlineAt: ticket.rejoinDeadlineAt || null,
        servicePriorityBand: ticket.servicePriorityBand || "normal"
      }))
    });
  })
);

router.get(
  "/tenant/:tenantSlug/clients",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.reports.read");
    const location = await getLocationForTenant(tenant, req.query.location);
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const tickets = await ticketRepository.listClientTickets(tenant._id, {
      limit: 500,
      historyDays: entitlements.historyDays,
      locationId: location?._id
    });
    const clientsByKey = new Map();

    tickets.forEach((ticket) => {
      const email = ticket.customerEmail || "";
      const phone = ticket.customerPhone || "";
      const name = ticket.customerName || "Unknown customer";
      const key = (email || phone || name).trim().toLowerCase();

      if (!key) {
        return;
      }

      const existing = clientsByKey.get(key);
      if (existing) {
        existing.visitCount += 1;
        existing.notifyByEmail = existing.notifyByEmail || Boolean(ticket.notifyByEmail);
        existing.notifyBySms = existing.notifyBySms || Boolean(ticket.notifyBySms);
        return;
      }

      clientsByKey.set(key, {
        id: key,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        visitCount: 1,
        latestTicketNumber: ticket.ticketNumber,
        latestStatus: ticket.status,
        latestVisitAt: ticket.updatedAt,
        notifyByEmail: Boolean(ticket.notifyByEmail),
        notifyBySms: Boolean(ticket.notifyBySms)
      });
    });

    res.json({
      historyDays: entitlements.historyDays,
      historyLabel: entitlements.historyLabel,
      clients: Array.from(clientsByKey.values())
    });
  })
);

router.get(
  "/tenant/:tenantSlug/counters",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const location = await getLocationForTenant(tenant, req.query.location);
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const counters = await serviceCounterRepository.listCountersByLocationId(location._id);

    res.json({
      counterLimit: entitlements.counters || 0,
      counters: counters.map((counter) => ({
        id: counter._id,
        tenantId: counter.tenantId,
        locationId: counter.locationId,
        name: counter.name,
        slug: counter.slug,
        isActive: counter.isActive,
        assignedUserIds: counter.assignedUserIds
      }))
    });
  })
);

router.patch(
  "/tenant/:tenantSlug/counters/:counterSlug",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.counter.manage");
    const location = await getLocationForTenant(tenant, req.query.location);
    const counter = await getCounterForLocation(location, req.params.counterSlug);
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const counters = await serviceCounterRepository.listCountersByLocationId(location._id);
    if (req.body.isActive === true && !counter.isActive) {
      if (counters.filter((item) => item.isActive).length >= Number(entitlements.counters || 0)) {
        const error = new Error("Counter limit exceeded for this subscription plan.");
        error.statusCode = 403;
        throw error;
      }
    }

    const slug = normalizeCounterSlug(req.body.slug || req.body.name);
    const updatedCounter = await serviceCounterRepository.updateCounter(counter._id, {
      name: req.body.name,
      slug,
      isActive: req.body.isActive !== false
    });
    await serviceCounterRepository.replaceAssignments(
      updatedCounter._id,
      req.body.assignedUserIds || []
    );

    res.json({ counter: updatedCounter });
  })
);

router.delete(
  "/tenant/:tenantSlug/counters/:counterSlug",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.counter.manage");
    const location = await getLocationForTenant(tenant, req.query.location);
    const counter = await getCounterForLocation(location, req.params.counterSlug);
    await serviceCounterRepository.deleteCounter(counter._id);
    res.status(204).send();
  })
);

router.get(
  "/tenant/:tenantSlug/staff",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.staff.read");
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const staff = await userRepository.listUsersByTenantId(tenant._id);
    const assignedCountersByUserId = await serviceCounterRepository.listAssignedCounterIdsByUserIds(
      staff.map((user) => user._id)
    );

    res.json({
      staffSeatLimit: entitlements.staffSeats || 0,
      staff: staff.map((user) => {
        const membership = user.tenantMemberships.find(
          (item) => String(item.tenantId) === String(tenant._id)
        );
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: membership?.role || "staff",
          assignedCounterIds: assignedCountersByUserId.get(String(user._id)) || []
        };
      })
    });
  })
);

router.post(
  "/tenant/:tenantSlug/staff",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.staff.invite");
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const staff = await userRepository.listUsersByTenantId(tenant._id);
    if (staff.length >= Number(entitlements.staffSeats || 0)) {
      const error = new Error("Staff seat limit exceeded for this subscription plan.");
      error.statusCode = 403;
      throw error;
    }

    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) {
      const error = new Error("email is required.");
      error.statusCode = 400;
      throw error;
    }

    const user = await userRepository.findUserByEmail(email);
    if (!user) {
      const error = new Error("Staff must already have a GetPrio account before being added.");
      error.statusCode = 404;
      throw error;
    }

    await userRepository.addTenantMembership(user._id, tenant._id, req.body.role || "staff");
    res.status(201).json({ userId: user._id });
  })
);

router.patch(
  "/tenant/:tenantSlug/staff/:userId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.staff.manage");
    const user = await userRepository.findUserById(req.params.userId);
    if (!user || !user.tenantMemberships.some((item) => String(item.tenantId) === String(tenant._id))) {
      const error = new Error("Staff member not found.");
      error.statusCode = 404;
      throw error;
    }
    const membership = user.tenantMemberships.find(
      (item) => String(item.tenantId) === String(tenant._id)
    );

    if (membership.role === "owner" && req.body.role !== "owner") {
      const staff = await userRepository.listUsersByTenantId(tenant._id);
      const ownerCount = staff.filter((member) =>
        member.tenantMemberships.some(
          (item) => String(item.tenantId) === String(tenant._id) && item.role === "owner"
        )
      ).length;
      if (ownerCount <= 1) {
        const error = new Error("At least one tenant owner is required.");
        error.statusCode = 400;
        throw error;
      }
    }

    await userRepository.updateTenantMembershipRole(
      user._id,
      tenant._id,
      req.body.role === "owner" ? "owner" : "staff"
    );
    res.json({ userId: user._id });
  })
);

router.delete(
  "/tenant/:tenantSlug/staff/:userId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.staff.manage");
    const user = await userRepository.findUserById(req.params.userId);
    const membership = user?.tenantMemberships.find(
      (item) => String(item.tenantId) === String(tenant._id)
    );
    if (!membership) {
      const error = new Error("Staff member not found.");
      error.statusCode = 404;
      throw error;
    }
    if (membership.role === "owner") {
      const error = new Error("Tenant owners cannot be removed from staff management.");
      error.statusCode = 400;
      throw error;
    }

    await userRepository.removeTenantMembership(user._id, tenant._id);
    res.status(204).send();
  })
);

router.post(
  "/tenant/:tenantSlug/counters",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.counter.manage");
    const location = await getLocationForTenant(tenant, req.query.location);
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const counters = await serviceCounterRepository.listCountersByLocationId(location._id);
    if (counters.filter((counter) => counter.isActive).length >= Number(entitlements.counters || 0)) {
      const error = new Error("Counter limit exceeded for this subscription plan.");
      error.statusCode = 403;
      throw error;
    }

    const counter = await serviceCounterRepository.createCounter({
      tenantId: tenant._id,
      locationId: location._id,
      name: req.body.name,
      slug: String(req.body.slug || req.body.name).trim().toLowerCase().replace(/\s+/g, "-"),
      isActive: req.body.isActive !== false
    });

    await serviceCounterRepository.replaceAssignments(counter._id, req.body.assignedUserIds || []);
    res.status(201).json({ counter });
  })
);

const HISTORY_RANGE_DAYS = {
  today: 0,
  week: 7,
  month: 30,
  quarter: 90,
  year: 365
};

function toCsvValue(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

router.get(
  "/tenant/:tenantSlug/history/export",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.reports.read");
    const location = await getLocationForTenant(tenant, req.query.location);
    const entitlements = await billingService.getTenantEntitlements(tenant._id);
    const range = String(req.query.range || "today");
    const format = String(req.query.format || "csv");

    if (!entitlements.allowedHistoryExportRanges?.includes(range)) {
      const error = new Error("This history range is not available for your plan.");
      error.statusCode = 403;
      throw error;
    }

    if ((format === "csv" && !entitlements.csvExport) || (format === "pdf" && !entitlements.pdfExport)) {
      const error = new Error("This export format is not available for your plan.");
      error.statusCode = 403;
      throw error;
    }

    const historyDays = HISTORY_RANGE_DAYS[range];
    const tickets = await ticketRepository.listHistoryTickets(tenant._id, {
      limit: 500,
      historyDays: historyDays || undefined,
      dateKey: range === "today" ? new Date().toISOString().slice(0, 10).replace(/-/g, "") : undefined,
      locationId: location?._id
    });

    if (format === "pdf") {
      res.type("application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-${range}-history.pdf"`);
      const doc = new PDFDocument({ margin: 48 });
      doc.pipe(res);
      doc.fontSize(18).text(`${tenant.name} history export`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#555").text(`Range: ${range}`);
      doc.moveDown();
      tickets.forEach((ticket) => {
        doc
          .fillColor("#111")
          .fontSize(11)
          .text(`${ticket.ticketNumber} | ${ticket.customerName} | ${ticket.status} | ${new Date(ticket.updatedAt).toLocaleString()}`);
      });
      doc.end();
      return;
    }

    const rows = [
      ["Ticket", "Customer", "Status", "Updated"],
      ...tickets.map((ticket) => [
        ticket.ticketNumber,
        ticket.customerName,
        ticket.status,
        ticket.updatedAt
      ])
    ];
    res.type("text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-${range}-history.csv"`);
    res.send(rows.map((row) => row.map(toCsvValue).join(",")).join("\n"));
  })
);

module.exports = router;
