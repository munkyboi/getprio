const { assertPublicTextFieldsAllowed } = require("./contentModeration");

function normalizeServiceSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function minutesFromTime(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function assertTimeRange(startsAt, endsAt, { allowEmpty = false, endsNextDay = false } = {}) {
  if (allowEmpty && !startsAt && !endsAt) {
    return;
  }
  const isValidTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  const startsAfterEnds = String(startsAt) > String(endsAt);
  if (!isValidTime(startsAt) || !isValidTime(endsAt) || (endsNextDay ? !startsAfterEnds : String(startsAt) >= String(endsAt))) {
    const error = new Error("A valid start and end time are required.");
    error.statusCode = 400;
    throw error;
  }
}

function assertWithinLocationBusinessHours(hours, weekday, startsAt, endsAt, endsNextDay) {
  const businessHours = hours.find((hour) => Number(hour.weekday) === weekday);
  if (!businessHours || businessHours.isClosed || !businessHours.opensAt || !businessHours.closesAt) {
    const error = new Error("Set business hours for this day before adding weekly availability.");
    error.statusCode = 400;
    throw error;
  }

  const opensAt = minutesFromTime(businessHours.opensAt);
  const closesAt = minutesFromTime(businessHours.closesAt);
  const businessEndsNextDay = closesAt <= opensAt;
  const businessEnd = closesAt + (businessEndsNextDay ? 24 * 60 : 0);
  const availabilityStart = minutesFromTime(startsAt);
  const availabilityEnd = minutesFromTime(endsAt) + (endsNextDay ? 24 * 60 : 0);

  if (availabilityStart < opensAt || availabilityEnd > businessEnd) {
    const error = new Error("Weekly availability must stay within this location's business hours.");
    error.statusCode = 400;
    throw error;
  }
}

async function getOptionalServiceForTenant(tenant, serviceSlug, vendorServiceRepository) {
  const normalizedServiceSlug = normalizeServiceSlug(serviceSlug);
  if (!normalizedServiceSlug) {
    return null;
  }
  const service = await vendorServiceRepository.findServiceByTenantAndSlug(tenant._id, normalizedServiceSlug);
  if (!service) {
    const error = new Error("Service not found.");
    error.statusCode = 404;
    throw error;
  }
  return service;
}

async function normalizeAvailabilityBlockPayload(tenant, body, existingBlock, vendorServiceRepository, getTenantLocation, storeLocationRepository) {
  const location = body.locationSlug ? await getTenantLocation(tenant, body.locationSlug) : null;
  const hasServiceSlug = Object.prototype.hasOwnProperty.call(body, "serviceSlug");
  const service = hasServiceSlug
    ? await getOptionalServiceForTenant(tenant, body.serviceSlug, vendorServiceRepository)
    : null;
  const startsAt = Object.prototype.hasOwnProperty.call(body, "startsAt") ? String(body.startsAt || "") : existingBlock?.startsAt;
  const endsAt = Object.prototype.hasOwnProperty.call(body, "endsAt") ? String(body.endsAt || "") : existingBlock?.endsAt;
  const endsNextDay = Object.prototype.hasOwnProperty.call(body, "endsNextDay") ? body.endsNextDay === true : Boolean(existingBlock?.endsNextDay);
  assertTimeRange(startsAt, endsAt, { endsNextDay });
  const weekday = Object.prototype.hasOwnProperty.call(body, "weekday") ? Number(body.weekday) : existingBlock?.weekday;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    const error = new Error("weekday must be between 0 and 6.");
    error.statusCode = 400;
    throw error;
  }
  const capacity = Object.prototype.hasOwnProperty.call(body, "capacity") ? Number(body.capacity) : existingBlock?.capacity || 1;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) {
    const error = new Error("capacity must be between 1 and 100.");
    error.statusCode = 400;
    throw error;
  }
  if (storeLocationRepository) {
    const hours = await storeLocationRepository.listHoursByLocationId(location?._id || existingBlock.locationId);
    assertWithinLocationBusinessHours(hours, weekday, startsAt, endsAt, endsNextDay);
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : existingBlock?.notes || "";
  assertPublicTextFieldsAllowed({ "Availability notes": notes });
  return {
    locationId: location?._id || existingBlock.locationId,
    serviceId: hasServiceSlug ? service?._id || null : existingBlock?.serviceId || null,
    weekday,
    startsAt,
    endsAt,
    endsNextDay,
    capacity,
    isActive: Object.prototype.hasOwnProperty.call(body, "isActive") ? Boolean(body.isActive) : existingBlock?.isActive ?? true,
    notes
  };
}

async function normalizeAvailabilityExceptionPayload(tenant, body, existingException, vendorServiceRepository, getTenantLocation) {
  const location = body.locationSlug ? await getTenantLocation(tenant, body.locationSlug) : null;
  const hasServiceSlug = Object.prototype.hasOwnProperty.call(body, "serviceSlug");
  const service = hasServiceSlug
    ? await getOptionalServiceForTenant(tenant, body.serviceSlug, vendorServiceRepository)
    : null;
  const exceptionDate = Object.prototype.hasOwnProperty.call(body, "exceptionDate")
    ? String(body.exceptionDate || "")
    : existingException?.exceptionDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exceptionDate || "")) {
    const error = new Error("exceptionDate must use YYYY-MM-DD format.");
    error.statusCode = 400;
    throw error;
  }
  const startsAt = Object.prototype.hasOwnProperty.call(body, "startsAt") ? String(body.startsAt || "") : existingException?.startsAt || null;
  const endsAt = Object.prototype.hasOwnProperty.call(body, "endsAt") ? String(body.endsAt || "") : existingException?.endsAt || null;
  if (startsAt || endsAt) {
    assertTimeRange(startsAt, endsAt);
  }
  const capacity = Object.prototype.hasOwnProperty.call(body, "capacity") ? Number(body.capacity) : existingException?.capacity || null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100)) {
    const error = new Error("capacity must be between 1 and 100.");
    error.statusCode = 400;
    throw error;
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : existingException?.reason || "";
  assertPublicTextFieldsAllowed({ "Availability reason": reason });
  return {
    locationId: location?._id || existingException.locationId,
    serviceId: hasServiceSlug ? service?._id || null : existingException?.serviceId || null,
    exceptionDate,
    startsAt,
    endsAt,
    isAvailable: Object.prototype.hasOwnProperty.call(body, "isAvailable") ? Boolean(body.isAvailable) : existingException?.isAvailable ?? false,
    capacity,
    reason
  };
}

module.exports = { normalizeAvailabilityBlockPayload, normalizeAvailabilityExceptionPayload };
