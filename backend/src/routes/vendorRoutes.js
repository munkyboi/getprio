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
const storeHoursService = require("../services/storeHoursService");
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

function normalizeTenantNotificationSettings(settings = {}) {
  return {
    bookingIntake: settings.bookingIntake !== false,
    paymentProofReview: settings.paymentProofReview !== false,
    bookingStatusChanges: settings.bookingStatusChanges !== false
  };
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
    paymentMethodLabel: location.paymentMethodLabel,
    paymentAccountDisplayName: location.paymentAccountDisplayName,
    paymentAccountIdentifierDisplay: location.paymentAccountIdentifierDisplay,
    paymentQrImageUrl: location.paymentQrImageUrl,
    paymentQrActive: location.paymentQrActive,
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

function normalizeLocationPayload(body, existingLocation = null) {
  const next = { ...body };
  const textFields = [
    "name",
    "slug",
    "addressLine1",
    "addressLine2",
    "city",
    "province",
    "postalCode",
    "country",
    "contactEmail",
    "contactPhone",
    "timezone",
    "paymentMethodLabel",
    "paymentAccountDisplayName",
    "paymentAccountIdentifierDisplay",
    "paymentQrImageUrl"
  ];

  for (const field of textFields) {
    if (Object.prototype.hasOwnProperty.call(next, field) && typeof next[field] === "string") {
      next[field] = next[field].trim();
    }
  }

  if (Object.prototype.hasOwnProperty.call(next, "paymentQrActive")) {
    next.paymentQrActive = next.paymentQrActive === true;
  }

  const paymentQrActive = Object.prototype.hasOwnProperty.call(next, "paymentQrActive")
    ? next.paymentQrActive
    : existingLocation?.paymentQrActive ?? false;
  const paymentMethodLabel = Object.prototype.hasOwnProperty.call(next, "paymentMethodLabel")
    ? next.paymentMethodLabel
    : existingLocation?.paymentMethodLabel || "";
  const paymentAccountDisplayName = Object.prototype.hasOwnProperty.call(next, "paymentAccountDisplayName")
    ? next.paymentAccountDisplayName
    : existingLocation?.paymentAccountDisplayName || "";
  const paymentQrImageUrl = Object.prototype.hasOwnProperty.call(next, "paymentQrImageUrl")
    ? next.paymentQrImageUrl
    : existingLocation?.paymentQrImageUrl || "";

  if (paymentQrActive && (!paymentMethodLabel || !paymentAccountDisplayName || !paymentQrImageUrl)) {
    const error = new Error("Active payment QR requires a method label, account display name, and QR image.");
    error.statusCode = 400;
    throw error;
  }

  return next;
}

function normalizeCounterSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPriceDisplay(priceAmountCents, currency = "PHP") {
  const amount = Number(priceAmountCents || 0) / 100;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount);
}

function normalizeServicePayload(body, existingService = null) {
  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const name = hasName ? String(body.name || "").trim() : existingService?.name;
  if (!name) {
    const error = new Error("name is required.");
    error.statusCode = 400;
    throw error;
  }

  const durationMinutes = Object.prototype.hasOwnProperty.call(body, "durationMinutes")
    ? Number(body.durationMinutes)
    : existingService?.durationMinutes;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    const error = new Error("durationMinutes must be between 5 and 480.");
    error.statusCode = 400;
    throw error;
  }

  const priceAmountCents = Object.prototype.hasOwnProperty.call(body, "priceAmountCents")
    ? Number(body.priceAmountCents)
    : existingService?.priceAmountCents ?? 0;
  if (!Number.isInteger(priceAmountCents) || priceAmountCents < 0) {
    const error = new Error("priceAmountCents must be a non-negative integer.");
    error.statusCode = 400;
    throw error;
  }

  const slugSource = Object.prototype.hasOwnProperty.call(body, "slug")
    ? body.slug
    : existingService?.slug || name;
  const slug = vendorServiceRepository.normalizeServiceSlug(slugSource);
  if (!slug) {
    const error = new Error("slug must contain at least one letter or number.");
    error.statusCode = 400;
    throw error;
  }

  const currency = "PHP";
  const priceDisplay = typeof body.priceDisplay === "string" && body.priceDisplay.trim()
    ? body.priceDisplay.trim()
    : buildPriceDisplay(priceAmountCents, currency);
  const allowBookingQuantity = Object.prototype.hasOwnProperty.call(body, "allowBookingQuantity")
    ? body.allowBookingQuantity === true
    : existingService?.allowBookingQuantity ?? false;
  const bookingQuantityLabel = typeof body.bookingQuantityLabel === "string" && body.bookingQuantityLabel.trim()
    ? body.bookingQuantityLabel.trim().slice(0, 40)
    : existingService?.bookingQuantityLabel || "Units";
  const manualPaymentRequired = Object.prototype.hasOwnProperty.call(body, "manualPaymentRequired")
    ? body.manualPaymentRequired === true
    : existingService?.manualPaymentRequired ?? false;

  return {
    name,
    slug,
    description: typeof body.description === "string"
      ? body.description.trim()
      : existingService?.description || "",
    durationMinutes,
    allowBookingQuantity,
    bookingQuantityLabel,
    manualPaymentRequired,
    priceAmountCents,
    currency,
    priceDisplay,
    isActive: Object.prototype.hasOwnProperty.call(body, "isActive")
      ? body.isActive !== false
      : existingService?.isActive ?? true,
    sortOrder: Object.prototype.hasOwnProperty.call(body, "sortOrder")
      ? Number(body.sortOrder || 0)
      : existingService?.sortOrder || 0
  };
}

function formatVendorService(service) {
  return {
    id: String(service._id),
    tenantId: String(service.tenantId),
    name: service.name,
    slug: service.slug,
    description: service.description,
    durationMinutes: service.durationMinutes,
    allowBookingQuantity: service.allowBookingQuantity,
    bookingQuantityLabel: service.bookingQuantityLabel,
    manualPaymentRequired: service.manualPaymentRequired,
    priceAmountCents: service.priceAmountCents,
    currency: service.currency,
    priceDisplay: service.priceDisplay,
    isActive: service.isActive,
    sortOrder: service.sortOrder,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt
  };
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function assertTimeRange(startsAt, endsAt, { allowEmpty = false } = {}) {
  if (allowEmpty && !startsAt && !endsAt) {
    return;
  }

  if (!isValidTime(startsAt) || !isValidTime(endsAt) || String(startsAt) >= String(endsAt)) {
    const error = new Error("A valid start and end time are required.");
    error.statusCode = 400;
    throw error;
  }
}

function formatAvailabilityBlock(block) {
  return {
    id: String(block._id),
    tenantId: String(block.tenantId),
    locationId: String(block.locationId),
    serviceId: block.serviceId ? String(block.serviceId) : null,
    weekday: block.weekday,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    capacity: block.capacity,
    isActive: block.isActive,
    notes: block.notes,
    createdAt: block.createdAt,
    updatedAt: block.updatedAt
  };
}

function formatAvailabilityException(exception) {
  return {
    id: String(exception._id),
    tenantId: String(exception.tenantId),
    locationId: String(exception.locationId),
    serviceId: exception.serviceId ? String(exception.serviceId) : null,
    exceptionDate: exception.exceptionDate,
    startsAt: exception.startsAt,
    endsAt: exception.endsAt,
    isAvailable: exception.isAvailable,
    capacity: exception.capacity,
    reason: exception.reason,
    createdAt: exception.createdAt,
    updatedAt: exception.updatedAt
  };
}

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

async function getOptionalServiceForTenant(tenant, serviceSlug) {
  const normalizedServiceSlug = vendorServiceRepository.normalizeServiceSlug(serviceSlug);
  if (!normalizedServiceSlug) {
    return null;
  }

  const service = await vendorServiceRepository.findServiceByTenantAndSlug(
    tenant._id,
    normalizedServiceSlug
  );
  if (!service) {
    const error = new Error("Service not found.");
    error.statusCode = 404;
    throw error;
  }

  return service;
}

async function normalizeAvailabilityBlockPayload(tenant, body, existingBlock = null) {
  const location = body.locationSlug
    ? await getLocationForTenant(tenant, body.locationSlug)
    : null;
  const service = Object.prototype.hasOwnProperty.call(body, "serviceSlug")
    ? await getOptionalServiceForTenant(tenant, body.serviceSlug)
    : null;
  const startsAt = Object.prototype.hasOwnProperty.call(body, "startsAt")
    ? String(body.startsAt || "")
    : existingBlock?.startsAt;
  const endsAt = Object.prototype.hasOwnProperty.call(body, "endsAt")
    ? String(body.endsAt || "")
    : existingBlock?.endsAt;
  assertTimeRange(startsAt, endsAt);

  const weekday = Object.prototype.hasOwnProperty.call(body, "weekday")
    ? Number(body.weekday)
    : existingBlock?.weekday;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    const error = new Error("weekday must be between 0 and 6.");
    error.statusCode = 400;
    throw error;
  }

  const capacity = Object.prototype.hasOwnProperty.call(body, "capacity")
    ? Number(body.capacity)
    : existingBlock?.capacity || 1;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    const error = new Error("capacity must be between 1 and 100.");
    error.statusCode = 400;
    throw error;
  }

  return {
    locationId: location?._id || existingBlock?.locationId,
    serviceId: Object.prototype.hasOwnProperty.call(body, "serviceSlug")
      ? service?._id || null
      : existingBlock?.serviceId || null,
    weekday,
    startsAt,
    endsAt,
    capacity,
    isActive: Object.prototype.hasOwnProperty.call(body, "isActive")
      ? body.isActive !== false
      : existingBlock?.isActive ?? true,
    notes: typeof body.notes === "string" ? body.notes.trim() : existingBlock?.notes || ""
  };
}

async function normalizeAvailabilityExceptionPayload(tenant, body, existingException = null) {
  const location = body.locationSlug
    ? await getLocationForTenant(tenant, body.locationSlug)
    : null;
  const service = Object.prototype.hasOwnProperty.call(body, "serviceSlug")
    ? await getOptionalServiceForTenant(tenant, body.serviceSlug)
    : null;
  const exceptionDate = Object.prototype.hasOwnProperty.call(body, "exceptionDate")
    ? String(body.exceptionDate || "")
    : existingException?.exceptionDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(exceptionDate || ""))) {
    const error = new Error("exceptionDate must use YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }

  const startsAt = Object.prototype.hasOwnProperty.call(body, "startsAt")
    ? String(body.startsAt || "")
    : existingException?.startsAt || "";
  const endsAt = Object.prototype.hasOwnProperty.call(body, "endsAt")
    ? String(body.endsAt || "")
    : existingException?.endsAt || "";
  assertTimeRange(startsAt, endsAt, { allowEmpty: true });

  const capacity = Object.prototype.hasOwnProperty.call(body, "capacity")
    ? body.capacity === null || body.capacity === "" ? null : Number(body.capacity)
    : existingException?.capacity ?? null;
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)) {
    const error = new Error("capacity must be between 1 and 100.");
    error.statusCode = 400;
    throw error;
  }

  return {
    locationId: location?._id || existingException?.locationId,
    serviceId: Object.prototype.hasOwnProperty.call(body, "serviceSlug")
      ? service?._id || null
      : existingException?.serviceId || null,
    exceptionDate,
    startsAt,
    endsAt,
    isAvailable: Object.prototype.hasOwnProperty.call(body, "isAvailable")
      ? body.isAvailable === true
      : existingException?.isAvailable ?? false,
    capacity,
    reason: typeof body.reason === "string" ? body.reason.trim() : existingException?.reason || ""
  };
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

    const requestedLocationSlug = req.query.location;
    const location = requestedLocationSlug
      ? await getLocationForTenant(tenant, requestedLocationSlug)
      : null;
    const upload = await publicBoardThemeUploadService.uploadBinary({
      tenant,
      location,
      user: req.user,
      body: {
        assetType: req.query.assetType,
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

    const locationPayload = normalizeLocationPayload(req.body || {});
    const location = await storeLocationRepository.createLocation({
      tenantId: tenant._id,
      ...locationPayload,
      timezone: locationPayload.timezone || "Asia/Manila"
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

    const updatedLocation = await storeLocationRepository.updateLocation(
      location._id,
      normalizeLocationPayload(req.body || {}, location)
    );

    res.json({ location: await formatLocation(updatedLocation, tenant) });
  })
);

router.post(
  "/tenant/:tenantSlug/location-payment-qrs/uploads/direct",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.location.manage");
    const locationSlug = String(req.query.locationSlug || "")
      .trim()
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
        fileName: req.query.fileName,
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

router.get(
  "/tenant/:tenantSlug/services",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
    const services = await vendorServiceRepository.listServicesByTenantId(tenant._id);

    res.json({ services: services.map(formatVendorService) });
  })
);

router.post(
  "/tenant/:tenantSlug/services",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
    const service = await vendorServiceRepository.createService({
      tenantId: tenant._id,
      ...normalizeServicePayload(req.body || {})
    });

    res.status(201).json({ service: formatVendorService(service) });
  })
);

router.patch(
  "/tenant/:tenantSlug/services/:serviceSlug",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
    const service = await vendorServiceRepository.findServiceByTenantAndSlug(
      tenant._id,
      req.params.serviceSlug
    );
    if (!service) {
      const error = new Error("Service not found.");
      error.statusCode = 404;
      throw error;
    }

    const updatedService = await vendorServiceRepository.updateService(
      service._id,
      normalizeServicePayload(req.body || {}, service)
    );

    res.json({ service: formatVendorService(updatedService) });
  })
);

router.delete(
  "/tenant/:tenantSlug/services/:serviceSlug",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.service.manage");
    const service = await vendorServiceRepository.findServiceByTenantAndSlug(
      tenant._id,
      req.params.serviceSlug
    );
    if (!service) {
      const error = new Error("Service not found.");
      error.statusCode = 404;
      throw error;
    }

    const deactivatedService = await vendorServiceRepository.deactivateService(service._id);

    res.json({ service: formatVendorService(deactivatedService) });
  })
);

router.get(
  "/tenant/:tenantSlug/bookings",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");

    const { page, pageSize } = parsePaginationParams(req.query);

    const location = req.query.location
      ? await getLocationForTenant(tenant, req.query.location)
      : null;
    const status = String(req.query.status || "").trim();
    const scheduledDate = String(req.query.scheduledDate || "").trim();
    const search = String(req.query.search || "").trim();

    const allowedStatuses = new Set([
      "pending",
      "confirmed",
      "rescheduled",
      "completed",
      "canceled",
      "disputed",
      "reviewed"
    ]);

    if (status && !allowedStatuses.has(status)) {
      const error = new Error("Unsupported booking status filter.");
      error.statusCode = 400;
      throw error;
    }

    await bookingService.expirePendingBookingsForTenant(tenant._id);
    const { bookings, totalItems } = await bookingRepository.listBookingsForTenant(tenant._id, {
      page,
      pageSize,
      locationId: location?._id,
      status: status || null,
      scheduledDate: scheduledDate || null,
      search: search || null
    });

    res.json({
      bookings: bookings.map(formatVendorBooking),
      pagination: formatPaginationMetadata(totalItems, page, pageSize)
    });
  })
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/status",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    const booking = await bookingService.updateVendorBookingStatus({
      tenant,
      bookingId: req.params.bookingId,
      status: String(req.body.status || "").trim()
    });
    const location = await getLocationForTenant(tenant, booking.locationSlug);
    await publishSnapshot(tenant, { location });

    res.json({
      booking: formatVendorBooking(booking)
    });
  })
);

router.get(
  "/tenant/:tenantSlug/bookings/:bookingId/payment-proof",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    const proofAccess = await bookingService.createVendorPaymentProofAccess({
      tenant,
      bookingId: req.params.bookingId
    });

    res.json(proofAccess);
  })
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/verify-payment",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    const booking = await bookingService.verifyVendorBookingPayment({
      tenant,
      bookingId: req.params.bookingId,
      user: req.user
    });
    const location = await getLocationForTenant(tenant, booking.locationSlug);
    await publishSnapshot(tenant, { location });

    res.json({
      booking: formatVendorBooking(booking)
    });
  })
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/reject-payment",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    const booking = await bookingService.rejectVendorBookingPayment({
      tenant,
      bookingId: req.params.bookingId,
      user: req.user,
      reason: req.body?.reason
    });
    const location = await getLocationForTenant(tenant, booking.locationSlug);
    await publishSnapshot(tenant, { location });

    res.json({
      booking: formatVendorBooking(booking)
    });
  })
);

router.patch(
  "/tenant/:tenantSlug/bookings/:bookingId/reschedule",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
    const booking = await bookingService.rescheduleVendorBooking({
      tenant,
      bookingId: req.params.bookingId,
      scheduledStartAt: req.body.scheduledStartAt
    });
    const location = await getLocationForTenant(tenant, booking.locationSlug);
    await publishSnapshot(tenant, { location });

    res.json({
      booking: formatVendorBooking(booking)
    });
  })
);

router.post(
  "/tenant/:tenantSlug/bookings/:bookingId/check-in",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
    const result = await bookingService.checkInVendorBooking({
      tenant,
      location,
      bookingId: req.params.bookingId,
      user: req.user,
      overrideWindow: Boolean(req.body.overrideWindow),
      overrideReason: req.body.overrideReason
    });

    res.status(201).json({
      booking: formatVendorBooking(result.booking),
      ticket: result.ticket
    });
  })
);

router.post(
  "/tenant/:tenantSlug/bookings/:bookingId/no-show",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
    const booking = await bookingService.markVendorBookingNoShow({
      tenant,
      location,
      bookingId: req.params.bookingId,
      user: req.user
    });
    await publishSnapshot(tenant, { location });

    res.json({
      booking: formatVendorBooking(booking)
    });
  })
);

router.get(
  "/tenant/:tenantSlug/availability",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
    const location = await getLocationForTenant(tenant, req.query.location);
    const availability = await vendorAvailabilityRepository.listAvailabilityByLocation(
      tenant._id,
      location._id
    );

    res.json({
      blocks: availability.blocks.map(formatAvailabilityBlock),
      exceptions: availability.exceptions.map(formatAvailabilityException)
    });
  })
);

router.post(
  "/tenant/:tenantSlug/availability/blocks",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
    const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
    const payload = await normalizeAvailabilityBlockPayload(tenant, {
      ...(req.body || {}),
      locationSlug: location.slug
    });
    const block = await vendorAvailabilityRepository.createBlock({
      tenantId: tenant._id,
      ...payload
    });

    res.status(201).json({ block: formatAvailabilityBlock(block) });
  })
);

router.patch(
  "/tenant/:tenantSlug/availability/blocks/:blockId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
    const block = await vendorAvailabilityRepository.findBlockByTenantAndId(
      tenant._id,
      req.params.blockId
    );
    if (!block) {
      const error = new Error("Availability block not found.");
      error.statusCode = 404;
      throw error;
    }

    const payload = await normalizeAvailabilityBlockPayload(tenant, req.body || {}, block);
    const updatedBlock = await vendorAvailabilityRepository.updateBlock(block._id, payload);

    res.json({ block: formatAvailabilityBlock(updatedBlock) });
  })
);

router.delete(
  "/tenant/:tenantSlug/availability/blocks/:blockId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
    const block = await vendorAvailabilityRepository.findBlockByTenantAndId(
      tenant._id,
      req.params.blockId
    );
    if (!block) {
      const error = new Error("Availability block not found.");
      error.statusCode = 404;
      throw error;
    }

    const updatedBlock = await vendorAvailabilityRepository.updateBlock(block._id, {
      isActive: false
    });

    res.json({ block: formatAvailabilityBlock(updatedBlock) });
  })
);

router.post(
  "/tenant/:tenantSlug/availability/exceptions",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
    const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
    const payload = await normalizeAvailabilityExceptionPayload(tenant, {
      ...(req.body || {}),
      locationSlug: location.slug
    });
    const exception = await vendorAvailabilityRepository.createException({
      tenantId: tenant._id,
      ...payload
    });

    res.status(201).json({ exception: formatAvailabilityException(exception) });
  })
);

router.patch(
  "/tenant/:tenantSlug/availability/exceptions/:exceptionId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
    const exception = await vendorAvailabilityRepository.findExceptionByTenantAndId(
      tenant._id,
      req.params.exceptionId
    );
    if (!exception) {
      const error = new Error("Availability exception not found.");
      error.statusCode = 404;
      throw error;
    }

    const payload = await normalizeAvailabilityExceptionPayload(tenant, req.body || {}, exception);
    const updatedException = await vendorAvailabilityRepository.updateException(
      exception._id,
      payload
    );

    res.json({ exception: formatAvailabilityException(updatedException) });
  })
);

router.delete(
  "/tenant/:tenantSlug/availability/exceptions/:exceptionId",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
    const exception = await vendorAvailabilityRepository.findExceptionByTenantAndId(
      tenant._id,
      req.params.exceptionId
    );
    if (!exception) {
      const error = new Error("Availability exception not found.");
      error.statusCode = 404;
      throw error;
    }

    await vendorAvailabilityRepository.deleteException(exception._id);
    res.status(204).send();
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
  "/tenant/:tenantSlug/queue/pause",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
    const location = await getLocationForTenant(tenant, req.query.location);
    const snapshot = await pauseQueueDay(tenant, {
      location,
      actorUserId: req.user?._id,
      actorRole: "vendor",
      source: "vendor",
      reason: typeof req.body?.reason === "string" ? req.body.reason : "Paused from vendor dashboard",
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
    const location = await getLocationForTenant(tenant, req.query.location);
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
    const {
      queuePrefix,
      averageServiceMinutes,
      notificationThreshold,
      autoPauseEnabled,
      autoPauseThreshold,
      autoResumeEnabled,
      autoResumeVacancyPercent,
      contactEmail,
      contactPhone
    } = req.body;
    const wantsToChangeContactDetails =
      typeof contactEmail === "string" || typeof contactPhone === "string";
    if (wantsToChangeContactDetails) {
      assertTenantPermission(req.user, tenant._id, "tenant.settings.manage_contact");
    }

    const normalizedAutoPauseEnabled = Boolean(autoPauseEnabled);
    const normalizedAutoPauseThreshold = normalizedAutoPauseEnabled
      ? Math.max(1, Number(autoPauseThreshold || 1))
      : null;
    const normalizedAutoResumeEnabled = normalizedAutoPauseEnabled && Boolean(autoResumeEnabled);
    const normalizedAutoResumeVacancyPercent =
      normalizedAutoResumeEnabled
        ? Math.max(5, Math.min(50, Number(autoResumeVacancyPercent || 20)))
        : null;

    const updatedTenant = await tenantRepository.updateTenant(tenant._id, {
      queuePrefix: queuePrefix ? String(queuePrefix).slice(0, 4).toUpperCase() : tenant.queuePrefix,
      averageServiceMinutes: averageServiceMinutes ? Number(averageServiceMinutes) : tenant.averageServiceMinutes,
      notificationThreshold: notificationThreshold ? Number(notificationThreshold) : tenant.notificationThreshold,
      autoPauseEnabled: normalizedAutoPauseEnabled,
      autoPauseThreshold: normalizedAutoPauseThreshold,
      autoResumeEnabled: normalizedAutoResumeEnabled,
      autoResumeVacancyPercent: normalizedAutoResumeVacancyPercent,
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
        autoPauseEnabled: updatedTenant.autoPauseEnabled,
        autoPauseThreshold: updatedTenant.autoPauseThreshold,
        autoResumeEnabled: updatedTenant.autoResumeEnabled,
        autoResumeVacancyPercent: updatedTenant.autoResumeVacancyPercent,
        contactEmail: updatedTenant.contactEmail,
        contactPhone: updatedTenant.contactPhone
      },
      snapshot: await getQueueSnapshot(updatedTenant, {
        location: await getLocationForTenant(updatedTenant, req.query.location)
      })
    });
  })
);

router.get(
  "/tenant/:tenantSlug/notification-settings",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");

    res.json({
      notificationSettings: normalizeTenantNotificationSettings(tenant.notificationSettings)
    });
  })
);

router.patch(
  "/tenant/:tenantSlug/notification-settings",
  asyncHandler(async (req, res) => {
    const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
    assertTenantPermission(req.user, tenant._id, "tenant.settings.manage");

    const notificationSettings = normalizeTenantNotificationSettings(req.body || {});
    const updatedTenant = await tenantRepository.updateTenant(tenant._id, {
      notificationSettings
    });

    res.json({
      notificationSettings: normalizeTenantNotificationSettings(updatedTenant.notificationSettings)
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
          isActive: membership?.isActive !== false,
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

    const nextRole = ["owner", "admin", "staff"].includes(req.body.role) ? req.body.role : "staff";
    const requesterMembership = req.user.tenantMemberships?.find(
      (item) => String(item.tenantId) === String(tenant._id) && item.isActive !== false
    );
    const requesterRole = requesterMembership?.role || null;
    const ownerCount = staff.filter((member) =>
      member.tenantMemberships.some(
        (item) => String(item.tenantId) === String(tenant._id) && item.role === "owner" && item.isActive !== false
      )
    ).length;

    if (requesterRole === "admin" && nextRole !== "staff") {
      const error = new Error("Tenant admins can only invite staff members.");
      error.statusCode = 403;
      throw error;
    }

    if ((nextRole === "admin" || nextRole === "owner") && requesterRole !== "owner") {
      const error = new Error("Only tenant owners can assign admin or owner roles.");
      error.statusCode = 403;
      throw error;
    }

    if (nextRole === "owner" && ownerCount >= 1) {
      const error = new Error("Only one tenant owner is allowed per vendor.");
      error.statusCode = 400;
      throw error;
    }

    await userRepository.addTenantMembership(user._id, tenant._id, nextRole);
    res.status(201).json({ userId: user._id });
  })
);

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
