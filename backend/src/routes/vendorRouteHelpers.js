const storeLocationRepository = require("../repositories/storeLocations");
const vendorServiceRepository = require("../repositories/vendorServices");
const storeHoursService = require("../services/storeHoursService");

const BOOKING_CAPACITY_SCOPES = new Set(["service", "location"]);

async function getAuthorizedTenant(user, tenantSlug, tenantRepository, userHasTenantAccess) {
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

function normalizeRequestText(value, fallback = "") {
  if (Array.isArray(value)) {
    return normalizeRequestText(value[0], fallback);
  }

  if (typeof value === "string") {
    const text = value.trim();
    return text || fallback;
  }

  return fallback;
}

async function getLocationForTenant(tenant, locationSlug) {
  const normalizedLocationSlug = normalizeRequestText(locationSlug);

  if (normalizedLocationSlug) {
    const location = await storeLocationRepository.findLocationByTenantAndSlug(
      tenant._id,
      normalizedLocationSlug
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
    queueJoin: settings.queueJoin !== false,
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
  const bookingCapacityScope = Object.prototype.hasOwnProperty.call(body, "bookingCapacityScope")
    ? String(body.bookingCapacityScope || "").trim()
    : existingService?.bookingCapacityScope || "service";
  if (!BOOKING_CAPACITY_SCOPES.has(bookingCapacityScope)) {
    const error = new Error("bookingCapacityScope must be service or location.");
    error.statusCode = 400;
    throw error;
  }

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
    bookingCapacityScope,
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
    bookingCapacityScope: service.bookingCapacityScope || "service",
    priceAmountCents: service.priceAmountCents,
    currency: service.currency,
    priceDisplay: service.priceDisplay,
    isActive: service.isActive,
    sortOrder: service.sortOrder,
    createdAt: service.createdAt,
    updatedAt: service.updatedAt
  };
}

module.exports = {
  buildPriceDisplay,
  formatLocation,
  formatVendorService,
  getAuthorizedTenant,
  getLocationForTenant,
  normalizeCounterSlug,
  normalizeLocationPayload,
  normalizeServicePayload,
  normalizeRequestText,
  normalizeTenantNotificationSettings
};
