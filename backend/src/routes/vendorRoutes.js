const express = require("express");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const serviceCounterRepository = require("../repositories/serviceCounters");
const vendorServiceRepository = require("../repositories/vendorServices");
const vendorAvailabilityRepository = require("../repositories/vendorAvailability");
const bookingRepository = require("../repositories/bookings");
const userRepository = require("../repositories/users");
const asyncHandler = require("../middleware/asyncHandler");
const {
  authenticate,
  userHasTenantAccess,
  assertTenantPermission
} = require("../middleware/auth");
const billingService = require("../services/billingService");
const publicBoardThemeUploadService = require("../services/publicBoardThemeUploadService");
const locationPaymentQrUploadService = require("../services/locationPaymentQrUploadService");
const bookingService = require("../services/bookingService");
const PDFDocument = require("pdfkit");
const {
  createTicket,
  getQueueSnapshot,
  callNextTicket,
  updateCurrentTicketStatus,
  closeQueueDay,
  reopenQueueDay,
  pauseQueueDay,
  resumeQueueDay,
  restoreSkippedTicket,
  publishSnapshot
} = require("../services/queueService");
const { parsePaginationParams, formatPaginationMetadata } = require("../utils/pagination");
const {
  formatLocation,
  getAuthorizedTenant: getAuthorizedTenantHelper,
  getLocationForTenant,
  normalizeCounterSlug,
  normalizeLocationPayload,
  normalizeRequestText
} = require("./vendorRouteHelpers");
const { handleCreateTicket } = require("./vendorQueueHandlers");
const { handleCreateLocation, handleUpdateLocation } = require("./vendorLocationHandlers");
const {
  handleListServices,
  handleCreateService,
  handleUpdateService,
  handleDeleteService
} = require("./vendorServiceHandlers");
const {
  handleListBookings,
  handleBookingMutation,
  handleCheckInBooking,
  handleMarkNoShow,
  handleListAvailability,
  handleCreateAvailabilityBlock,
  handleUpdateAvailabilityBlock,
  handleDeleteAvailabilityBlock,
  handleCreateAvailabilityException,
  handleUpdateAvailabilityException,
  handleDeleteAvailabilityException
} = require("./vendorBookingAvailabilityHandlers");
const {
  handleUpdateSettings,
  handleGetNotificationSettings,
  handleUpdateNotificationSettings,
  handleListHistory,
  handleListClients,
  handleListCounters,
  handleUpdateCounter,
  handleDeleteCounter,
  handleListStaff,
  handleInviteStaff
} = require("./vendorManagementHandlers");

const router = express.Router();

function formatVendorBooking(booking) {
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
    customerUserId: booking.customerUserId,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
    scheduledStartAt: booking.scheduledStartAt,
    scheduledEndAt: booking.scheduledEndAt,
    status: booking.status,
    notes: booking.notes,
    paymentReference: booking.paymentReference,
    paymentStatus: booking.paymentStatus,
    paymentProof: booking.paymentProofObjectKey
      ? {
          fileName: booking.paymentProofFileName,
          contentType: booking.paymentProofContentType,
          sizeBytes: booking.paymentProofSizeBytes,
          uploadedAt: booking.paymentProofUploadedAt
        }
      : null,
    paymentVerifiedAt: booking.paymentVerifiedAt,
    paymentVerifiedByUserId: booking.paymentVerifiedByUserId,
    paymentRejectedAt: booking.paymentRejectedAt,
    paymentRejectedByUserId: booking.paymentRejectedByUserId,
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
    checkedInByUserId: booking.checkedInByUserId,
    noShowAt: booking.noShowAt,
    noShowByUserId: booking.noShowByUserId,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt
  };
}

async function getAuthorizedTenant(user, tenantSlug) {
  return getAuthorizedTenantHelper(user, tenantSlug, tenantRepository, userHasTenantAccess);
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    const theme = await publicBoardThemeRepository.getResolvedTheme(tenant._id, location?._id);

    res.json(theme);
  })
);

router.patch(
  "/tenant/:tenantSlug/public-board-theme",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.theme.manage");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));

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
    const requestedLocationSlug = normalizeRequestText(req.body.locationSlug || req.query.location);
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
  "/tenant/:tenantSlug/public-board-theme/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.theme.manage");
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("Image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const requestedLocationSlug = normalizeRequestText(req.query.location);
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    const upload = await publicBoardThemeUploadService.uploadBinary({
      tenant,
      location,
      user: req.user,
      body: {
        assetType: normalizeRequestText(req.query.assetType),
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: req.body.length
      },
      fileBuffer: req.body
    });

    res.status(201).json(upload);
  })
);

router.post(
  "/tenant/:tenantSlug/locations",
  asyncHandler((req, res) =>
    handleCreateLocation({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      billingService,
      storeLocationRepository,
      normalizeLocationPayload,
      formatLocation,
      getLocationForTenant
    })
  )
);

router.patch(
  "/tenant/:tenantSlug/locations/:locationSlug",
  asyncHandler((req, res) =>
    handleUpdateLocation({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      billingService,
      storeLocationRepository,
      normalizeLocationPayload,
      formatLocation,
      getLocationForTenant
    })
  )
);

router.post(
  "/tenant/:tenantSlug/location-payment-qrs/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const locationSlug = normalizeRequestText(req.query.locationSlug)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!locationSlug) {
      const error = new Error("locationSlug is required before uploading a payment QR.");
      error.statusCode = 400;
      throw error;
    }
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("QR image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const upload = await locationPaymentQrUploadService.uploadBinary({
      tenant,
      location: { slug: locationSlug },
      body: {
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: req.body.length
      },
      fileBuffer: req.body
    });

    res.status(201).json(upload);
  })
);

router.post(
  "/tenant/:tenantSlug/locations/:locationSlug/payment-qr/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const location = await getLocationForTenant(tenant, req.params.locationSlug);
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.length) {
      const error = new Error("QR image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const upload = await locationPaymentQrUploadService.uploadBinary({
      tenant,
      location,
      body: {
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: req.body.length
      },
      fileBuffer: req.body
    });

    res.status(201).json(upload);
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

router.get("/tenant/:tenantSlug/services", asyncHandler((req, res) => handleListServices({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository })));

router.post("/tenant/:tenantSlug/services", asyncHandler((req, res) => handleCreateService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository })));

router.patch("/tenant/:tenantSlug/services/:serviceSlug", asyncHandler((req, res) => handleUpdateService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository })));

router.delete("/tenant/:tenantSlug/services/:serviceSlug", asyncHandler((req, res) => handleDeleteService({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository })));

router.get(
  "/tenant/:tenantSlug/bookings",
  asyncHandler((req, res) =>
    handleListBookings({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      bookingService,
      bookingRepository,
      formatPaginationMetadata,
      parsePaginationParams
    })
  )
);

router.get(
  "/tenant/:tenantSlug/bookings/:bookingId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    const booking = await bookingRepository.findBookingById(req.params.bookingId);

    if (!booking || String(booking.tenantId) !== String(tenant._id)) {
      const error = new Error("Booking not found.");
      error.statusCode = 404;
      throw error;
    }

    if (normalizeRequestText(req.query.location)) {
      const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
      if (String(booking.locationId) !== String(location._id)) {
        const error = new Error("Booking not found for this location.");
        error.statusCode = 404;
        throw error;
      }
    }

    res.json({ booking: formatVendorBooking(booking) });
  })
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/status",
  asyncHandler((req, res) =>
    handleBookingMutation({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      bookingService,
      publishSnapshot,
      permission: "tenant.booking.manage",
      action: async ({ tenant }) =>
        bookingService.updateVendorBookingStatus({
          tenant,
          bookingId: req.params.bookingId,
          status: String(req.body.status || "").trim()
        })
    })
  )
);

router.get(
  "/tenant/:tenantSlug/bookings/:bookingId/payment-proof",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    res.json(
      await bookingService.createVendorPaymentProofAccess({
        tenant,
        bookingId: req.params.bookingId
      })
    );
  })
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/verify-payment",
  asyncHandler((req, res) =>
    handleBookingMutation({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      bookingService,
      publishSnapshot,
      permission: "tenant.booking.manage",
      action: async ({ tenant }) =>
        bookingService.verifyVendorBookingPayment({
          tenant,
          bookingId: req.params.bookingId,
          user: req.user
        })
    })
  )
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/reject-payment",
  asyncHandler((req, res) =>
    handleBookingMutation({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      bookingService,
      publishSnapshot,
      permission: "tenant.booking.manage",
      action: async ({ tenant }) =>
        bookingService.rejectVendorBookingPayment({
          tenant,
          bookingId: req.params.bookingId,
          user: req.user,
          reason: normalizeRequestText(req.body?.reason)
        })
    })
  )
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/reschedule",
  asyncHandler((req, res) =>
    handleBookingMutation({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      bookingService,
      publishSnapshot,
      permission: "tenant.booking.manage",
      action: async ({ tenant }) =>
        bookingService.rescheduleVendorBooking({
          tenant,
          bookingId: req.params.bookingId,
          scheduledStartAt: req.body.scheduledStartAt
        })
    })
  )
);

router.post(
  "/tenant/:tenantSlug/bookings/:bookingId/check-in",
  asyncHandler((req, res) =>
    handleCheckInBooking({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      bookingService
    })
  )
);

router.post(
  "/tenant/:tenantSlug/bookings/:bookingId/no-show",
  asyncHandler((req, res) =>
    handleMarkNoShow({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      bookingService,
      publishSnapshot
    })
  )
);

router.get(
  "/tenant/:tenantSlug/availability",
  asyncHandler((req, res) =>
    handleListAvailability({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      vendorAvailabilityRepository
    })
  )
);

router.post(
  "/tenant/:tenantSlug/availability/blocks",
  asyncHandler((req, res) =>
    handleCreateAvailabilityBlock({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      vendorAvailabilityRepository,
      vendorServiceRepository
    })
  )
);

router.patch(
  "/tenant/:tenantSlug/availability/blocks/:blockId",
  asyncHandler((req, res) =>
    handleUpdateAvailabilityBlock({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      vendorAvailabilityRepository,
      vendorServiceRepository
    })
  )
);

router.delete(
  "/tenant/:tenantSlug/availability/blocks/:blockId",
  asyncHandler((req, res) =>
    handleDeleteAvailabilityBlock({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      vendorAvailabilityRepository
    })
  )
);

router.post(
  "/tenant/:tenantSlug/availability/exceptions",
  asyncHandler((req, res) =>
    handleCreateAvailabilityException({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      vendorAvailabilityRepository,
      vendorServiceRepository
    })
  )
);

router.patch(
  "/tenant/:tenantSlug/availability/exceptions/:exceptionId",
  asyncHandler((req, res) =>
    handleUpdateAvailabilityException({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      vendorAvailabilityRepository,
      vendorServiceRepository
    })
  )
);

router.delete(
  "/tenant/:tenantSlug/availability/exceptions/:exceptionId",
  asyncHandler((req, res) =>
    handleDeleteAvailabilityException({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      vendorAvailabilityRepository
    })
  )
);

router.post(
  "/tenant/:tenantSlug/tickets",
  asyncHandler((req, res) =>
    handleCreateTicket({
      req,
      res,
      getAuthorizedTenant,
      assertTenantPermission,
      getLocationForTenant,
      createTicket
    })
  )
);

router.post(
  "/tenant/:tenantSlug/queue/pause",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    const snapshot = await pauseQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      reason: normalizeRequestText(req.body?.reason, "Paused from vendor dashboard"),
      pauseMode: "manual"
    });

    res.json({ snapshot });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/resume",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    const snapshot = await resumeQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

    res.json({ snapshot });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/close",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    const snapshot = await closeQueueDay(tenant, {
      location,
      reason: normalizeRequestText(req.body?.reason),
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    const serviceCounter = await getCounterForLocation(location, normalizeRequestText(req.body.counterSlug));
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
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

router.patch("/tenant/:tenantSlug/settings", asyncHandler((req, res) => handleUpdateSettings({
  req,
  res,
  getAuthorizedTenant,
  assertTenantPermission,
  getLocationForTenant,
  tenantRepository,
  getQueueSnapshot
})));

router.get("/tenant/:tenantSlug/notification-settings", asyncHandler((req, res) => handleGetNotificationSettings({ req, res, getAuthorizedTenant, assertTenantPermission })));

router.patch("/tenant/:tenantSlug/notification-settings", asyncHandler((req, res) => handleUpdateNotificationSettings({ req, res, getAuthorizedTenant, assertTenantPermission, tenantRepository })));

router.get("/tenant/:tenantSlug/history", asyncHandler((req, res) => handleListHistory({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, ticketRepository })));

router.get("/tenant/:tenantSlug/clients", asyncHandler((req, res) => handleListClients({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, ticketRepository })));

router.get("/tenant/:tenantSlug/counters", asyncHandler((req, res) => handleListCounters({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, serviceCounterRepository })));

router.patch("/tenant/:tenantSlug/counters/:counterSlug", asyncHandler((req, res) => handleUpdateCounter({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, serviceCounterRepository, getCounterForLocation })));

router.delete("/tenant/:tenantSlug/counters/:counterSlug", asyncHandler((req, res) => handleDeleteCounter({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, serviceCounterRepository, getCounterForLocation })));

router.get("/tenant/:tenantSlug/staff", asyncHandler((req, res) => handleListStaff({ req, res, getAuthorizedTenant, assertTenantPermission, billingService, userRepository, serviceCounterRepository })));

router.post("/tenant/:tenantSlug/staff", asyncHandler((req, res) => handleInviteStaff({ req, res, getAuthorizedTenant, assertTenantPermission, billingService, userRepository })));

router.patch(
  "/tenant/:tenantSlug/staff/:userId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.staff.manage");
    if (String(req.user._id) === String(req.params.userId)) {
      const error = new Error("You cannot edit your own tenant staff account.");
      error.statusCode = 400;
      throw error;
    }
    const user = await userRepository.findUserById(req.params.userId);
    if (!user || !user.tenantMemberships.some((item) => String(item.tenantId) === String(tenant._id))) {
      const error = new Error("Staff member not found.");
      error.statusCode = 404;
      throw error;
    }
    const membership = user.tenantMemberships.find(
      (item) => String(item.tenantId) === String(tenant._id)
    );
    const requesterMembership = req.user.tenantMemberships?.find(
      (item) => String(item.tenantId) === String(tenant._id) && item.isActive !== false
    );
    const requesterRole = requesterMembership?.role || null;
    const hasRoleChange = Object.prototype.hasOwnProperty.call(req.body, "role");
    const hasStatusChange = Object.prototype.hasOwnProperty.call(req.body, "isActive");

    if (!hasRoleChange && !hasStatusChange) {
      const error = new Error("No staff updates were provided.");
      error.statusCode = 400;
      throw error;
    }

    if (hasRoleChange && requesterRole !== "owner") {
      const error = new Error("Only tenant owners can change staff roles.");
      error.statusCode = 403;
      throw error;
    }

    if (membership.role === "owner" && hasRoleChange && req.body.role !== "owner") {
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

    if (membership.role === "owner" && hasStatusChange && req.body.isActive === false) {
      const error = new Error("Tenant owners cannot be disabled from staff management.");
      error.statusCode = 400;
      throw error;
    }

    if (hasRoleChange) {
      const nextRole = req.body.role === "owner"
        ? "owner"
        : req.body.role === "admin"
          ? "admin"
          : "staff";

      if (nextRole === "owner" && membership.role !== "owner") {
        const error = new Error("Only one tenant owner is allowed per vendor.");
        error.statusCode = 400;
        throw error;
      }

      await userRepository.updateTenantMembershipRole(user._id, tenant._id, nextRole);
    }

    if (hasStatusChange) {
      await userRepository.updateTenantMembershipStatus(user._id, tenant._id, req.body.isActive !== false);
    }

    res.json({ userId: user._id });
  })
);

router.delete(
  "/tenant/:tenantSlug/staff/:userId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.staff.manage");
    const requesterMembership = req.user.tenantMemberships?.find(
      (item) => String(item.tenantId) === String(tenant._id) && item.isActive !== false
    );
    if (requesterMembership?.role !== "owner") {
      const error = new Error("Only tenant owners can remove staff members.");
      error.statusCode = 403;
      throw error;
    }
    if (String(req.user._id) === String(req.params.userId)) {
      const error = new Error("You cannot remove your own tenant staff account.");
      error.statusCode = 400;
      throw error;
    }
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
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
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
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
