const { createQueueTicketDetailsService } = require("../services/queueTicketDetailsService");
const queueTicketDetailsService = createQueueTicketDetailsService({ pool: require("../config/db").pool });
const serviceDeactivationService = require("../services/serviceDeactivationService");
const ticketServicePlanService = require("../services/ticketServicePlanService");
const { projectOperationalBooking } = require("./vendorBookingReadModel");
const permissions = require("../services/permissions");
const staffRemovalResourceService = require("../services/staffRemovalResourceService");
const staffAccessResourceService = require("../services/staffAccessResourceService");
const staffInvitationResourceService = require("../services/staffInvitationResourceService");
const express = require("express");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const ticketRepository = require("../repositories/tickets");
const publicBoardThemeRepository = require("../repositories/publicBoardThemes");
const serviceCounterRepository = require("../repositories/serviceCounters");
const vendorServiceRepository = require("../repositories/vendorServices");
const locationServiceRepository = require("../repositories/locationServices");
const vendorAvailabilityRepository = require("../repositories/vendorAvailability");
const bookingRepository = require("../repositories/bookings");

const platformRepository = require("../repositories/platform");
const ratingRepository = require("../repositories/ratings");
const userRepository = require("../repositories/users");
const tenantMembershipLocationRepository = require("../repositories/tenantMembershipLocations");
const asyncHandler = require("../middleware/asyncHandler");
const {
  authenticate,
  revalidateAuthenticatedUser,
  userHasTenantAccess,
  assertTenantPermission
} = require("../middleware/auth");
const { moderatePublicText } = require("../middleware/moderatePublicText");
const queueEvents = require("../services/queueEvents");
const billingService = require("../services/billingService");
const publicBoardThemeUploadService = require("../services/publicBoardThemeUploadService");
const vendorMediaUploadService = require("../services/vendorMediaUploadService");
const locationPaymentQrUploadService = require("../services/locationPaymentQrUploadService");
const bookingService = require("../services/bookingService");
const resourceConfigurationService = require("../services/resourceConfigurationService");
const locationCatalogService = require("../services/locationCatalogService");
const locationHoursService = require("../services/locationHoursService");
const availabilityCreationService = require("../services/availabilityCreationService");
const availabilityUpdateService = require("../services/availabilityUpdateService");
const availabilityDeletionService = require("../services/availabilityDeletionService");
const { recordTicketService } = require("../services/ticketServiceTimingService");
const entitlementAdmissionService = require("../services/entitlementAdmissionService");
const ratingService = require("../services/ratingService");
const PDFDocument = require("pdfkit");
const {
  createTicket,
  getQueueSnapshot,
  openQueueDay,
  extendQueueDay,
  callNextTicket,
  confirmCurrentTicket,
  updateCurrentTicketStatus,
  closeQueueDay,
  reopenQueueDay,
  pauseQueueDay,
  resumeQueueDay,
  restoreSkippedTicket,
  cancelTicket,
  publishSnapshot
} = require("../services/queueService");
const { parsePaginationParams, formatPaginationMetadata } = require("../utils/pagination");
const {
  formatLocation,
  getAuthorizedTenant: getAuthorizedTenantHelper,
  getLocationForTenant,
  normalizeCounterSlug,
  normalizeRequestText
} = require("./vendorRouteHelpers");
const { handleCreateTicket } = require("./vendorQueueHandlers");
const {
  handleCreateLocation,
  handleUpdateLocation,
  handleCheckLocationSlugAvailability
} = require("./vendorLocationHandlers");
const {
  handleListServices,
  handleCreateService,
  handleUpdateService,
  handleDeleteService,
  handleCheckServiceSlugAvailability
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
  handleCreateCounter,
  handleUpdateCounter,
  handleDeleteCounter,
  handleCheckCounterSlugAvailability,
  handleListStaff,
  handleInviteStaff
} = require("./vendorManagementHandlers");

const router = express.Router();
router.use(moderatePublicText);

async function assertQueueLocationAccess(user, tenant, location) {
  if (location?.queueLifecycleMode !== "enforced") {
    return;
  }
  const membership = (user?.tenantMemberships || []).find(
    (candidate) =>
      String(candidate.tenantId) === String(tenant._id)
      && candidate.isActive !== false
  );
  if (membership?.role !== "staff") {
    return;
  }
  const allowed = await tenantMembershipLocationRepository.userHasLocationAssignment(
    user._id,
    tenant._id,
    location._id
  );
  if (!allowed) {
    const error = new Error("You are not assigned to operate this location.");
    error.statusCode = 403;
    error.code = "QUEUE_LOCATION_FORBIDDEN";
    throw error;
  }
}
async function assertBookingReadAccess(user, tenant, location) {
  if (permissions.userHasPermission(user, "tenant.booking.manage", { tenantId: tenant._id })) {
    return true;
  }
  assertTenantPermission(user, tenant._id, "tenant.queue.operate");
  if (!location || !(await tenantMembershipLocationRepository.userHasLocationAssignment(user._id, tenant._id, location._id))) {
    const error = new Error("Select an assigned location to view its bookings.");
    error.statusCode = 403;
    throw error;
  }
  return false;
}

function formatBookingForOperator(user, tenant, booking) {
  const formatted = formatVendorBooking(booking);
  return permissions.userHasPermission(user, "tenant.booking.manage", { tenantId: tenant._id })
    ? formatted
    : projectOperationalBooking(formatted);
}

function formatVendorBooking(booking) {
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
    groupFundedBookingId: booking.groupFundedBookingId,
    bookingPaymentSource: booking.bookingPaymentSource,
    groupFundedCampaign,
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

for (const method of ["get", "put"]) {
  router[method]("/tenant/:tenantSlug/locations/:locationSlug/resources", asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
    const location = await getLocationForTenant(tenant, req.params.locationSlug);
    const scope = { tenantId: tenant._id, locationId: location._id, actorUserId: req.user._id,localRequest:require("../services/localFixtureTenantScope").loopbackRequest(req) };
    const configuration = method === "get"
      ? await resourceConfigurationService.getConfiguration(scope)
      : await resourceConfigurationService.saveConfiguration(scope, req.body);
    res.json(configuration);
  }));
}
router.post("/tenant/:tenantSlug/locations/:locationSlug/resources/:poolId/activate",asyncHandler(async(req,res)=>{
  const localRequest=require("../services/localFixtureTenantScope").loopbackRequest(req);
  if(!localRequest)throw Object.assign(new Error("Local resource activation is unavailable."),{statusCode:404,code:"LOCAL_ACTIVATION_UNAVAILABLE"});
  const tenant=await getAuthorizedTenant(req.user,req.params.tenantSlug);
  assertTenantPermission(req.user,tenant._id,"tenant.location.manage");
  assertTenantPermission(req.user,tenant._id,"tenant.service.manage");
  const location=await getLocationForTenant(tenant,req.params.locationSlug);
  res.json(await resourceConfigurationService.activateConfiguration({tenantId:tenant._id,locationId:location._id,actorUserId:req.user._id,localRequest},req.params.poolId,req.body,req.get("Idempotency-Key")));
}));




router.get(
  "/tenant/:tenantSlug/dashboard",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    if (permissions.getTenantRole(req.user, tenant._id) === "staff") {
      await assertBookingReadAccess(req.user, tenant, location);
    }
    const snapshot = await getQueueSnapshot(tenant, { location, includeServiceTiming: true });
    res.json(snapshot);
  })
);

router.get(
  "/tenant/:tenantSlug/entitlements",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const [entitlements, plan] = await Promise.all([
      billingService.getTenantEntitlements(tenant._id),
      billingService.getTenantPlanSummary(tenant._id)
    ]);
    res.json({ entitlements, plan });
  })
);

router.get(
  "/tenant/:tenantSlug/locations",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const billing = await billingService.getBillingOverview(tenant._id);
    const locations = await storeLocationRepository.listLocationsByTenantId(tenant._id);
    const visibleLocations = permissions.getTenantRole(req.user, tenant._id) === "staff"
      ? (await Promise.all(locations.map(async (location) => ({
          location,
          assigned: await tenantMembershipLocationRepository.userHasLocationAssignment(req.user._id, tenant._id, location._id)
        })))).filter((entry) => entry.assigned).map((entry) => entry.location)
      : locations;
    const activeLocationLimit =
      billing.subscription?.entitlements?.locations ||
      billing.plans.find((plan) => plan.slug === billing.subscription?.planSlug)?.entitlements.locations ||
      1;
    const platformSettings = await platformRepository.getPlatformSettings();

    res.json({
      activeLocationLimit,
      defaultTimezone: platformSettings.defaultTimezone,
      locations: await Promise.all(visibleLocations.map((location) => formatLocation(location, tenant)))
    });
  })
);

router.get(
  "/tenant/:tenantSlug/public-board-theme",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.read");
    const requestedLocationSlug = normalizeRequestText(req.query.location);
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    const theme = await publicBoardThemeRepository.getResolvedTheme(
      tenant._id,
      location?._id,
      requestedLocationSlug ? {} : { mediaOnly: true }
    );

    res.json(theme);
  })
);

router.patch(
  "/tenant/:tenantSlug/public-board-theme",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.theme.manage");
    const requestedLocationSlug = normalizeRequestText(req.query.location);
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    if (location || req.body.applyToAllLocations) {
      await entitlementAdmissionService.admit({ tenantId: tenant._id, featureKey: "branding" });
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
    const requestedLocationSlug = normalizeRequestText(req.body.locationSlug || req.query.location);
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    if (location) {
      await entitlementAdmissionService.admit({ tenantId: tenant._id, featureKey: "branding" });
      if (!entitlements.brandedQueuePages) {
        const error = new Error("Public board rebranding is not available for this plan.");
        error.statusCode = 403;
        throw error;
      }
    }
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
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.byteLength) {
      const error = new Error("Image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const requestedLocationSlug = normalizeRequestText(req.query.location);
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    if (location) {
      await entitlementAdmissionService.admit({ tenantId: tenant._id, featureKey: "branding" });
    }
    const upload = await publicBoardThemeUploadService.uploadBinary({
      tenant,
      location,
      user: req.user,
      body: {
        assetType: normalizeRequestText(req.query.assetType),
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: req.body.byteLength
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
      req, res, getAuthorizedTenant, assertTenantPermission, locationCatalogService, formatLocation
    })
  )
);

router.patch(
  "/tenant/:tenantSlug/locations/:locationSlug",
  asyncHandler((req, res) =>
    handleUpdateLocation({
      req, res, getAuthorizedTenant, assertTenantPermission, locationCatalogService, formatLocation
    })
  )
);

router.post(
  "/tenant/:tenantSlug/locations/:locationSlug/queue-join-id/regenerate",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const location = await getLocationForTenant(tenant, req.params.locationSlug);
    const regeneratedLocation = await storeLocationRepository.regenerateQueueJoinId(location._id);
    res.json({ location: await formatLocation(regeneratedLocation, tenant) });
  })
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
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.byteLength) {
      const error = new Error("QR image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const upload = await locationPaymentQrUploadService.uploadBinary({
      actorUserId: req.user._id,
      tenant,
      location: { slug: locationSlug },
      body: {
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: req.body.byteLength
      },
      fileBuffer: req.body
    });

    res.status(201).json(upload);
  })
);

router.post(
  "/tenant/:tenantSlug/location-media/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const fileBuffer = Buffer.isBuffer(req.body) ? Buffer.from(req.body) : null;
    if (!fileBuffer || !fileBuffer.length) {
      const error = new Error("Image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }
    const requestedLocationSlug = normalizeRequestText(req.query.locationSlug);
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    const upload = await vendorMediaUploadService.uploadBinary({
      tenant,
      location,
      user: req.user,
      body: {
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: fileBuffer.length
      },
      fileBuffer,
      assetType: "location"
    });

    res.status(201).json(upload);
  })
);

router.post(
  "/tenant/:tenantSlug/service-media/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
    const fileBuffer = Buffer.isBuffer(req.body) ? Buffer.from(req.body) : null;
    if (!fileBuffer || !fileBuffer.length) {
      const error = new Error("Image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }
    const location = req.query.locationSlug
      ? await getLocationForTenant(tenant, normalizeRequestText(req.query.locationSlug))
      : null;
    const upload = await vendorMediaUploadService.uploadBinary({
      tenant,
      location,
      user: req.user,
      body: {
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: fileBuffer.length
      },
      fileBuffer,
      assetType: "service"
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
    if (!req.body || !Buffer.isBuffer(req.body) || !req.body.byteLength) {
      const error = new Error("QR image upload payload is required.");
      error.statusCode = 400;
      throw error;
    }

    const upload = await locationPaymentQrUploadService.uploadBinary({
      actorUserId: req.user._id,
      tenant,
      location,
      body: {
        fileName: normalizeRequestText(req.query.fileName),
        contentType: req.headers["content-type"],
        sizeBytes: req.body.byteLength
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
    await locationHoursService.replaceLocationHours(tenant, location, hours, { actorUserId: req.user._id });
    const updatedLocation = await storeLocationRepository.findLocationById(location._id);

    res.json({ location: await formatLocation(updatedLocation, tenant) });
  })
);

router.get("/tenant/:tenantSlug/services", asyncHandler((req, res) => handleListServices({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository, locationServiceRepository })));
router.get(
  "/tenant/:tenantSlug/location-services",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
    const locationServices = await locationServiceRepository.listLocationServicesByTenantId(tenant._id);
    res.json({ locationServices });
  })
);
router.get("/tenant/:tenantSlug/services/slug-availability", asyncHandler((req, res) => handleCheckServiceSlugAvailability({ req, res, getAuthorizedTenant, assertTenantPermission, vendorServiceRepository })));

router.post("/tenant/:tenantSlug/services", asyncHandler((req, res) => handleCreateService({ req, res, getAuthorizedTenant, assertTenantPermission, serviceDeactivationService })));

router.patch("/tenant/:tenantSlug/services/:serviceSlug", asyncHandler((req, res) => handleUpdateService({ req, res, getAuthorizedTenant, assertTenantPermission, serviceDeactivationService })));

router.delete("/tenant/:tenantSlug/services/:serviceSlug", asyncHandler((req, res) => handleDeleteService({ req, res, getAuthorizedTenant, assertTenantPermission, serviceDeactivationService })));

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
      assertBookingReadAccess,
      formatPaginationMetadata,
      parsePaginationParams
    })
  )
);

router.get(
  "/tenant/:tenantSlug/bookings/:bookingId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    const booking = await bookingRepository.findBookingById(req.params.bookingId);

    if (!booking || String(booking.tenantId) !== String(tenant._id)) {
      const error = new Error("Booking not found.");
      error.statusCode = 404;
      throw error;
    }

    if (normalizeRequestText(req.query.location)) {
      const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
      if (String(booking.locationId) !== String(location._id)) {
        const error = new Error("Booking not found.");
        error.statusCode = 404;
        throw error;
      }
    }

    const bookingLocation = await getLocationForTenant(tenant, booking.locationSlug);
    let canManageBookings;
    try {
      canManageBookings = await assertBookingReadAccess(req.user, tenant, bookingLocation);
    } catch (accessError) {
      if (accessError.statusCode !== 403) {
        throw accessError;
      }
      const error = new Error("Booking not found.");
      error.statusCode = 404;
      throw error;
    }

    res.json({
      booking: {
        ...(canManageBookings ? formatVendorBooking(booking) : projectOperationalBooking(formatVendorBooking(booking))),
        organizerCampaign: null
      }
    });
  })
);

router.get(
  "/tenant/:tenantSlug/bookings/:bookingId/reschedule-slots",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    const slots = await bookingService.listVendorBookingRescheduleSlots({
      tenant,
      bookingId: req.params.bookingId,
      date: normalizeRequestText(req.query.date)
    });

    res.json({ slots });
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
          user: req.user,
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

router.get("/tenant/:tenantSlug/ratings", asyncHandler(async (req, res) => {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");
  await billingService.assertPaidReviewAccess(tenant._id);
  const { parsePaginationParams } = require("../utils/pagination");
  const { page, pageSize, offset } = parsePaginationParams(req.query);
  const rows = await ratingRepository.listVendorReviews(tenant._id, pageSize + 1, offset);
  res.json({ reviews: rows.slice(0, pageSize), page, hasMore: rows.length > pageSize });
}));
router.patch("/tenant/:tenantSlug/ratings/:reviewId", asyncHandler(async (req, res) => {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");
  await billingService.assertPaidReviewAccess(tenant._id);
  if (typeof req.body?.visible !== "boolean" || !/^[1-9]\d*$/.test(req.params.reviewId)) return res.status(400).json({ message: "Choose a review and visibility." });
  const review = await ratingRepository.setReviewVisibility(tenant._id, req.params.reviewId, req.body.visible);
  if (!review) return res.status(404).json({ message: "Review not found." });
  res.json({ review });
}));
router.post(
  "/tenant/:tenantSlug/vendor-reviews/:reviewId/reply",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");
    await billingService.assertPaidReviewAccess(tenant._id);
    res.json({ rating: await ratingService.replyToVendorReview({ user: req.user, tenant, reviewId: req.params.reviewId, body: req.body || {} }) });
  })
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
          user: req.user,
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
      assertQueueLocationAccess,
      getLocationForTenant,
      bookingService,
      assertBookingReadAccess,
      formatBookingForOperator
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
      assertBookingReadAccess,
      formatBookingForOperator,
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
      availabilityCreationService
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
      availabilityUpdateService
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
      availabilityDeletionService
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
      availabilityCreationService
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
      availabilityUpdateService
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
      availabilityDeletionService
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
      assertQueueLocationAccess,
      getLocationForTenant,
      createTicket
    })
  )
);

router.post(
  "/tenant/:tenantSlug/queue/open",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    await entitlementAdmissionService.admit({ tenantId: tenant._id, featureKey: "queue" });
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    const snapshot = await openQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      expectedVersion: req.body?.expectedVersion,
      note: normalizeRequestText(req.body?.note)
    });
    res.json({ message: "Queue Day opened.", snapshot });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/extend",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    const snapshot = await extendQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      expectedVersion: req.body?.expectedVersion,
      reason: normalizeRequestText(req.body?.reason),
      note: normalizeRequestText(req.body?.note)
    });
    res.json({ message: "Queue Day extended by 30 minutes.", snapshot });
  })
);

router.post(
  "/tenant/:tenantSlug/queue/pause",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    const snapshot = await pauseQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      reason: normalizeRequestText(req.body?.reason, "Paused from vendor dashboard"),
      pauseMode: "manual",
      expectedVersion: req.body?.expectedVersion,
      note: normalizeRequestText(req.body?.note)
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
    await assertQueueLocationAccess(req.user, tenant, location);
    const snapshot = await resumeQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      expectedVersion: req.body?.expectedVersion
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
    await assertQueueLocationAccess(req.user, tenant, location);
    const snapshot = await closeQueueDay(tenant, {
      location,
      reason: normalizeRequestText(req.body?.reason),
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      expectedVersion: req.body?.expectedVersion,
      note: normalizeRequestText(req.body?.note)
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
    assertTenantPermission(req.user, tenant._id, "tenant.queue.reopen");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    const snapshot = await reopenQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      expectedVersion: req.body?.expectedVersion,
      reason: normalizeRequestText(req.body?.reason, "manual_reopen"),
      note: normalizeRequestText(req.body?.note)
    });

    res.json({
      message: "Queue day reopened.",
      snapshot
    });
  })
);

async function getCurrentCounterTarget(req, location) {
  req.body = req.body || {};
  if (!Object.hasOwn(req.body, "counterSlug") || (req.body.counterSlug !== null && !normalizeRequestText(req.body.counterSlug))) {
    throw Object.assign(new Error("Select the counter for this called ticket."), { statusCode: 400, code: "COUNTER_REQUIRED" });
  }
  if(Object.hasOwn(req.body,"expectedCounterId"))require('../services/queueCounterBinding').validate(req.body);
  return { ticketId: req.body.ticketId,
    ...(Object.hasOwn(req.body,"expectedCounterId")?{expectedCounterId:req.body.expectedCounterId,counterSlug:req.body.counterSlug}:{}),
    serviceCounter: await getCounterForLocation(location, normalizeRequestText(req.body.counterSlug)) };
}

router.post(
  "/tenant/:tenantSlug/queue/call-next",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    if (!normalizeRequestText(req.body?.counterSlug)) {
      throw Object.assign(new Error("Select an active counter before calling a customer."), { statusCode: 400, code: "COUNTER_REQUIRED" });
    }
    const serviceCounter = await getCounterForLocation(location, normalizeRequestText(req.body.counterSlug));
    const result = await callNextTicket(tenant, {
      location,
      serviceCounter,
      counterSlug:req.body.counterSlug,
      ...(Object.hasOwn(req.body,"expectedCounterId")?{expectedCounterId:req.body.expectedCounterId}:{}),
      ...(req.get('Idempotency-Key')?{operationKey:req.get('Idempotency-Key')}:{}),
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor"
    });

    if (!result) {
      res.json({
        message: "No waiting tickets in the queue.",
        snapshot: await getQueueSnapshot(tenant, { location, includeServiceTiming: true })
      });
      return;
    }

    res.json({
      ...(result.replayed?{replayed:true}:{}),
      ticket: {
        id: String(result.ticket._id),
        ticketNumber: result.ticket.ticketNumber,
        status: result.ticket.status,
        serviceReservation: result.reservation
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
    await assertQueueLocationAccess(req.user, tenant, location);
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

async function getQueueTicketOperationContext(req) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.ticket.update_state");
  const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
  await assertQueueLocationAccess(req.user, tenant, location);
  return { tenant, location };
}

function sendQueueTicketMutation(res, result) {
  res.json({
    ticket: { id: String(result.ticket._id), ticketNumber: result.ticket.ticketNumber, status: result.ticket.status },
    snapshot: result.snapshot
  });
}

router.post(
  "/tenant/:tenantSlug/queue/tickets/:ticketId/cancel",
  asyncHandler(async (req, res) => {
    const { tenant, location } = await getQueueTicketOperationContext(req);
    const ticketId = String(req.params.ticketId);
    if (!/^[1-9]\d*$/.test(ticketId) || !Number.isSafeInteger(Number(ticketId))) {
      const error = new Error("A valid ticket ID is required.");
      error.statusCode = 400;
      throw error;
    }
    const result = await cancelTicket(tenant, "", {
      location, vendorTicketId: ticketId,
      actorUserId: req.user?._id, actorRole: "vendor", source: "vendor"
    });
    if (!result) {
      const error = new Error("Ticket not found at this location.");
      error.statusCode = 404;
      throw error;
    }
    sendQueueTicketMutation(res, result);
  })
);

for (const method of ["get", "patch"]) {
  router[method]("/tenant/:tenantSlug/queue/tickets/:ticketId/details", asyncHandler(async (req, res) => {
    const { tenant, location } = await getQueueTicketOperationContext(req);
    const ticketId = String(req.params.ticketId);
    const result = method === "get"
      ? await queueTicketDetailsService.get(tenant, location, req.user._id, ticketId)
      : await queueTicketDetailsService.patch(tenant, location, req.user._id, ticketId, req.body);
    res.set("Cache-Control", "no-store").json(result);
  }));
}

router.get("/tenant/:tenantSlug/queue/waiting-tickets", asyncHandler(async (req, res) => {
  const { tenant, location } = await getQueueTicketOperationContext(req);
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) {
    const error = new Error("A valid waiting-ticket page is required.");
    error.statusCode = 400;
    throw error;
  }
  const tickets = await ticketRepository.listWaitingTickets(tenant._id, {
    locationId: location._id, limit: 26, offset: (page - 1) * 25
  });
  const eligibility = await require("../config/db").withTransaction(async client => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return require("../services/queueServiceHoursEligibilityService").forTickets(client,{tenantId:String(tenant._id),locationId:String(location._id)},tickets.slice(0,25).map(ticket=>String(ticket._id)));
  });
  res.json({ page, hasNextPage: tickets.length > 25, tickets: tickets.slice(0, 25).map(ticket => ({
    serviceHoursEligibility: eligibility.get(String(ticket._id)),
    id: String(ticket._id), ticketNumber: ticket.ticketNumber, customerName: ticket.customerName,
    isCarriedOver: Boolean(ticket.carriedOverAt || ticket.carryOverCount > 0),
    linkedBookingReference: ticket.linkedBookingReference || null
  })) });
}));

router.post(
  "/tenant/:tenantSlug/queue/current/confirm",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.ticket.update_state");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    const target = await getCurrentCounterTarget(req, location);
    const lookupCode = String(req.body.lookupCode || "").trim().toUpperCase();
    const barcodeToken = String(req.body.barcodeToken || "").trim().toUpperCase();
    if ((barcodeToken && !/^QB[A-F0-9]{32}$/.test(barcodeToken)) || (!barcodeToken && !/^[A-F0-9]{8}$/.test(lookupCode))) {
      throw Object.assign(new Error("Scan a valid QR or ticket code, or enter the code manually."), { statusCode: 400 });
    }

    const result = await confirmCurrentTicket(tenant, lookupCode, {
      location,
      ...target,
      ...(barcodeToken ? { barcodeToken } : {}),
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor_barcode_scan"
    });

    if (!result) {
      const error = new Error("There is no called ticket to confirm.");
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

router.get("/tenant/:tenantSlug/queue/service-options", asyncHandler(async (req, res) => {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
  await assertQueueLocationAccess(req.user, tenant, location);
  const catalog = await require('../services/queuePlanCatalog').readCatalog(require('../config/db').pool,{ tenantId: tenant._id, locationId: location._id });
  res.json({ ...catalog,queuePlanPolicy:{contractVersion:2,maxLines:20,quantityMin:1,quantityMax:100,durationEditable:false} });
}));

// V2 drafts remain separate from issued tickets and all queue intake effects.
const queuePlanDraftService = require('../services/queuePlanDraftService');
async function queuePlanContext(req) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, 'tenant.queue.operate');
  const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
  await assertQueueLocationAccess(req.user, tenant, location);
  return {tenant,location,actorUserId:req.user._id};
}
router.get('/tenant/:tenantSlug/queue/counter-controls',asyncHandler(async(req,res)=>{res.json(await require('../services/queueCounterControlsService').read(await queuePlanContext(req),{counterSlug:normalizeRequestText(req.query.counterSlug),requestKey:normalizeRequestText(req.query.requestKey)}));}));
async function queueStreamReadContext(req) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, 'tenant.queue.read');
  const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
  await assertQueueLocationAccess(req.user, tenant, location);
  return {tenant, location};
}
router.get('/tenant/:tenantSlug/queue/stream',asyncHandler(async(req,res)=>{
  const context=await queueStreamReadContext(req);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'});
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({locationId:String(context.location._id)})}\n\n`);
  require('../services/queueReadEventStream').attach({req,res,context,queueEvents,
    revalidate:async()=>{await revalidateAuthenticatedUser(req);return queueStreamReadContext(req);},
    sampleHours:fresh=>require('../config/db').withTransaction(async client=>{
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='3000ms'");
      return require('../services/queueServiceHoursEligibilityService').sample(client,{tenantId:String(fresh.tenant._id),locationId:String(fresh.location._id)});
    })});
}));
router.get('/tenant/:tenantSlug/queue/selection-options', asyncHandler(async(req,res)=>{
  const version=normalizeRequestText(req.query.contractVersion);
  if(version && version!=='4')throw Object.assign(new Error('Unsupported selection contract version.'),{statusCode:400});
  res.json(await queuePlanDraftService.selectionOptions(await queuePlanContext(req),version==='4'?4:3));
}));
router.get('/tenant/:tenantSlug/queue/plans', asyncHandler(async (req,res) => {
  res.json(await queuePlanDraftService.list(await queuePlanContext(req),req.query.cursor,req.query.state));
}));
router.post('/tenant/:tenantSlug/queue/plans', asyncHandler(async (req,res) => {
  const result = await queuePlanDraftService.mutate(await queuePlanContext(req),{
    action:'create',operationKey:req.get('Idempotency-Key'),body:req.body});
  res.status(201).json(result);
}));
router.get('/tenant/:tenantSlug/queue/plans/:planId', asyncHandler(async (req,res) => {
  res.json(await queuePlanDraftService.read(await queuePlanContext(req),req.params.planId));
}));
router.patch('/tenant/:tenantSlug/queue/plans/:planId', asyncHandler(async (req,res) => {
  res.json(await queuePlanDraftService.mutate(await queuePlanContext(req),{
    action:'update',draftId:req.params.planId,operationKey:req.get('Idempotency-Key'),body:req.body}));
}));
router.delete('/tenant/:tenantSlug/queue/plans/:planId', asyncHandler(async(req,res)=>{res.json(await queuePlanDraftService.remove(await queuePlanContext(req),{draftId:req.params.planId,operationKey:req.get('Idempotency-Key'),body:req.body}));}));
router.post('/tenant/:tenantSlug/queue/plans/:planId/publish', asyncHandler(async (req,res) => {
  const result=await require('../services/queuePlanPublishService').publish(await queuePlanContext(req),{
    draftId:req.params.planId,operationKey:req.get('Idempotency-Key'),body:req.body});
  res.json(result);
}));
for(const action of ['call','start','complete','interrupt','amend','handoff','pause','resume','retry','reassign','cancelProtection','skip','recall']) {
  router.post(`/tenant/:tenantSlug/queue/plans/:planId/${action}`,asyncHandler(async(req,res)=>{
    const context=await queuePlanContext(req);
    const serviceCounter=action==='call'||Object.hasOwn(req.body||{},'expectedCounterId') ? await getCounterForLocation(context.location,normalizeRequestText(req.body.counterSlug)):undefined;
    try{
      res.json(await require('../services/queuePlanCommandService').execute(context,{action,draftId:req.params.planId,
        operationKey:req.get('Idempotency-Key'),body:req.body,serviceCounter}));
    }catch(error){
      if(error.plan){res.status(error.statusCode||409).json({code:error.code,message:error.message,plan:error.plan,...require("../services/queueServiceHoursErrorResponse").fields(error)});return;}
      throw error;
    }
  }));
}
router.get('/tenant/:tenantSlug/queue/workflow',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueWorkflowService').get(await queuePlanContext(req)));
}));
router.put('/tenant/:tenantSlug/queue/workflow',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueWorkflowService').put(await queuePlanContext(req),req.body,req.get('Idempotency-Key')));
}));
router.post('/tenant/:tenantSlug/queue/named-resource-availability',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedAvailabilityService').preview(await queuePlanContext(req),req.body));
}));
router.get('/tenant/:tenantSlug/queue/resource-members',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').listMembers(await queuePlanContext(req),normalizeRequestText(req.query.poolId)));
}));
router.post('/tenant/:tenantSlug/queue/resource-members/reorder',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').reorderMembers(await queuePlanContext(req),{
    poolId:req.body?.poolId,memberIds:req.body?.memberIds,operationKey:req.get('Idempotency-Key')
  }));
}));
router.post('/tenant/:tenantSlug/queue/resource-members',asyncHandler(async(req,res)=>{
  res.status(201).json(await require('../services/queueNamedResourceConfigurationService').saveMember(await queuePlanContext(req),{
    body:req.body,operationKey:req.get('Idempotency-Key')}));
}));
router.patch('/tenant/:tenantSlug/queue/resource-members/:memberId',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').saveMember(await queuePlanContext(req),{
    memberId:req.params.memberId,body:req.body,operationKey:req.get('Idempotency-Key')}));
}));
router.post('/tenant/:tenantSlug/queue/resource-members/:memberId/archive',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').archiveMember(await queuePlanContext(req),{
    memberId:req.params.memberId,body:req.body,operationKey:req.get('Idempotency-Key')}));
}));
router.get('/tenant/:tenantSlug/queue/service-policies/:serviceId/configuration',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').getConfiguration(await queuePlanContext(req),req.params.serviceId));
}));
router.put('/tenant/:tenantSlug/queue/service-policies/:serviceId/configuration',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').saveConfiguration(await queuePlanContext(req),req.params.serviceId,req.body,req.get('Idempotency-Key')));
}));
router.get('/tenant/:tenantSlug/queue/service-policies',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').getPolicies(await queuePlanContext(req)));
}));
router.put('/tenant/:tenantSlug/queue/service-policies/:serviceId',asyncHandler(async(req,res)=>{
  res.json(await require('../services/queueNamedResourceConfigurationService').savePolicy(await queuePlanContext(req),
    req.params.serviceId,req.body,req.get('Idempotency-Key')));
}));

router.get("/tenant/:tenantSlug/queue/tickets/:ticketId/service-plan", asyncHandler(async (req, res) => {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
  await assertQueueLocationAccess(req.user, tenant, location);
  res.json(await ticketServicePlanService.getTicketPlan({ tenantId: tenant._id, locationId: location._id }, req.params.ticketId));
}));

// Ticket IDs make stale tabs and retries target the same service, never the next customer.
for (const action of ["start", "complete", "interrupt"]) {
  router.post(`/tenant/:tenantSlug/queue/tickets/:ticketId/service/${action}`, asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.ticket.update_state");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    const result = await recordTicketService(tenant, req.params.ticketId, action, {
      location, actorUserId: req.user._id,
      ...(Object.hasOwn(req.body||{},'expectedCounterId')||Object.hasOwn(req.body||{},'counterSlug')?{expectedCounterId:req.body.expectedCounterId,counterSlug:req.body.counterSlug}:{})
    });
    res.json({ ticket: { id: String(result.ticket._id), ticketNumber: result.ticket.ticketNumber,
      status: result.ticket.status }, snapshot: result.snapshot });
  }));
}

router.post(
  "/tenant/:tenantSlug/queue/current/serve",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.ticket.update_state");
    const location = await getLocationForTenant(tenant, normalizeRequestText(req.query.location));
    await assertQueueLocationAccess(req.user, tenant, location);
    const result = await updateCurrentTicketStatus(tenant, "served", {
      location,
      ...await getCurrentCounterTarget(req, location),
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
    await assertQueueLocationAccess(req.user, tenant, location);
    const result = await updateCurrentTicketStatus(tenant, "skipped", {
      location,
      ...await getCurrentCounterTarget(req, location),
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
  userRepository,
  getQueueSnapshot
})));

router.get("/tenant/:tenantSlug/notification-settings", asyncHandler((req, res) => handleGetNotificationSettings({ req, res, getAuthorizedTenant, assertTenantPermission })));

router.patch("/tenant/:tenantSlug/notification-settings", asyncHandler((req, res) => handleUpdateNotificationSettings({ req, res, getAuthorizedTenant, assertTenantPermission, tenantRepository })));

router.get("/tenant/:tenantSlug/history", asyncHandler((req, res) => handleListHistory({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, ticketRepository })));

router.get("/tenant/:tenantSlug/clients", asyncHandler((req, res) => handleListClients({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, ticketRepository })));

router.get("/tenant/:tenantSlug/counters", asyncHandler((req, res) => handleListCounters({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, serviceCounterRepository })));
router.get("/tenant/:tenantSlug/counters/slug-availability", asyncHandler((req, res) => handleCheckCounterSlugAvailability({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, serviceCounterRepository })));

router.get("/tenant/:tenantSlug/locations/slug-availability", asyncHandler((req, res) => handleCheckLocationSlugAvailability({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, storeLocationRepository })));

router.patch("/tenant/:tenantSlug/counters/:counterSlug", asyncHandler((req, res) => handleUpdateCounter({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, billingService, serviceCounterRepository, getCounterForLocation, tenantMembershipLocationRepository })));

router.delete("/tenant/:tenantSlug/counters/:counterSlug", asyncHandler((req, res) => handleDeleteCounter({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, serviceCounterRepository, getCounterForLocation })));

router.get("/tenant/:tenantSlug/staff", asyncHandler((req, res) => handleListStaff({ req, res, getAuthorizedTenant, assertTenantPermission, billingService, userRepository, serviceCounterRepository, tenantMembershipLocationRepository })));

router.post("/tenant/:tenantSlug/staff", asyncHandler((req, res) => handleInviteStaff({ req, res, getAuthorizedTenant, assertTenantPermission, userRepository, staffInvitationResourceService })));

router.patch(
  "/tenant/:tenantSlug/staff/:userId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.staff.manage");
    const requester = req.user.tenantMemberships?.find(
      member => String(member.tenantId) === String(tenant._id) && member.isActive !== false
    );
    if (Object.hasOwn(req.body, "role") && requester?.role !== "owner") {
      throw Object.assign(new Error("Only tenant owners can change staff roles."), { statusCode: 403 });
    }
    await staffAccessResourceService.update({ tenant, userId: req.params.userId,
      actorId: req.user._id, body: req.body });
    res.json({ userId: req.params.userId });
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
    await staffRemovalResourceService.remove({ tenant, userId: req.params.userId, actorId: req.user._id });
    res.status(204).send();
  })
);

router.post("/tenant/:tenantSlug/counters", asyncHandler((req, res) => handleCreateCounter({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant })));

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
