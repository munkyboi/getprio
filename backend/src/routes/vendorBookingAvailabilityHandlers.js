const { getLocationForTenant } = require("./vendorRouteHelpers");
const { assertPublicTextFieldsAllowed } = require("../services/contentModeration");

function normalizeServiceSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
    groupFundedBookingId: booking.groupFundedBookingId,
    bookingPaymentSource: booking.bookingPaymentSource,
    groupFundedCampaign: booking.groupFundedCampaign,
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

function formatAvailabilityBlock(block) {
  return {
    id: String(block._id),
    tenantId: String(block.tenantId),
    locationId: String(block.locationId),
    serviceId: block.serviceId ? String(block.serviceId) : null,
    weekday: block.weekday,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    endsNextDay: Boolean(block.endsNextDay),
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

function buildAvailabilitySummary(availability) {
  const sharedBlocks = availability.blocks.filter((block) => block.isActive && !block.serviceId).length;
  const serviceSpecificBlocks = availability.blocks.filter((block) => block.isActive && block.serviceId).length;
  const sharedExceptions = availability.exceptions.filter((exception) => !exception.isAvailable && !exception.serviceId).length;
  const serviceSpecificExceptions = availability.exceptions.filter((exception) => !exception.isAvailable && exception.serviceId).length;

  return {
    sharedBlocks,
    serviceSpecificBlocks,
    sharedExceptions,
    serviceSpecificExceptions,
    hasSharedLocationCapacity: sharedBlocks > 0 || sharedExceptions > 0,
    hasServiceSpecificCapacity: serviceSpecificBlocks > 0 || serviceSpecificExceptions > 0
  };
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

async function normalizeAvailabilityBlockPayload(tenant, body, existingBlock, vendorServiceRepository, getTenantLocation = getLocationForTenant, storeLocationRepository) {
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

async function normalizeAvailabilityExceptionPayload(tenant, body, existingException, vendorServiceRepository, getTenantLocation = getLocationForTenant) {
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

async function handleListBookings({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, bookingService, bookingRepository, formatPaginationMetadata, parsePaginationParams }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.booking.manage");
  const { page, pageSize } = parsePaginationParams(req.query);
  const location = req.query.location ? await getLocationForTenant(tenant, req.query.location) : null;
  const status = String(req.query.status || "").trim();
  const scheduledDateFrom = String(req.query.scheduledDateFrom || req.query.scheduledDate || "").trim();
  const scheduledDateTo = String(req.query.scheduledDateTo || req.query.scheduledDate || "").trim();
  const search = String(req.query.search || "").trim();
  const allowedStatuses = new Set(["pending", "confirmed", "rescheduled", "completed", "canceled", "disputed", "reviewed"]);
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
    scheduledDateFrom: scheduledDateFrom || null,
    scheduledDateTo: scheduledDateTo || null,
    search: search || null
  });
  res.json({ bookings: bookings.map(formatVendorBooking), pagination: formatPaginationMetadata(totalItems, page, pageSize) });
}

async function handleBookingMutation({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, bookingService, publishSnapshot, permission, action, responseKey = "booking" }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, permission);
  const booking = await action({ tenant, req, getLocationForTenant, bookingService });
  const location = await getLocationForTenant(tenant, booking.locationSlug);
  await publishSnapshot(tenant, { location });
  res.json({ [responseKey]: formatVendorBooking(booking) });
}

async function handleCheckInBooking({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, bookingService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  const result = await bookingService.checkInVendorBooking({
    tenant, location, bookingId: req.params.bookingId, user: req.user, overrideWindow: Boolean(req.body.overrideWindow), overrideReason: req.body.overrideReason
  });
  res.status(201).json({ booking: formatVendorBooking(result.booking), ticket: result.ticket });
}

async function handleMarkNoShow({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, bookingService, publishSnapshot }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  const booking = await bookingService.markVendorBookingNoShow({ tenant, location, bookingId: req.params.bookingId, user: req.user });
  await publishSnapshot(tenant, { location });
  res.json({ booking: formatVendorBooking(booking) });
}

async function handleListAvailability({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, vendorAvailabilityRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const location = await getLocationForTenant(tenant, req.query.location);
  const availability = await vendorAvailabilityRepository.listAvailabilityByLocation(tenant._id, location._id);
  res.json({
    blocks: availability.blocks.map(formatAvailabilityBlock),
    exceptions: availability.exceptions.map(formatAvailabilityException),
    summary: buildAvailabilitySummary(availability)
  });
}

async function handleCreateAvailabilityBlock({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, storeLocationRepository, vendorAvailabilityRepository, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  const payload = await normalizeAvailabilityBlockPayload(
    tenant,
    { ...(req.body || {}), locationSlug: location.slug },
    null,
    vendorServiceRepository,
    getLocationForTenant,
    storeLocationRepository
  );
  const block = await vendorAvailabilityRepository.createBlock({ tenantId: tenant._id, ...payload });
  res.status(201).json({ block: formatAvailabilityBlock(block) });
}

async function handleUpdateAvailabilityBlock({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, storeLocationRepository, vendorAvailabilityRepository, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const block = await vendorAvailabilityRepository.findBlockByTenantAndId(tenant._id, req.params.blockId);
  if (!block) { const error = new Error("Availability block not found."); error.statusCode = 404; throw error; }
  const payload = await normalizeAvailabilityBlockPayload(
    tenant,
    req.body || {},
    block,
    vendorServiceRepository,
    getLocationForTenant,
    storeLocationRepository
  );
  const updatedBlock = await vendorAvailabilityRepository.updateBlock(block._id, payload);
  res.json({ block: formatAvailabilityBlock(updatedBlock) });
}

async function handleDeleteAvailabilityBlock({ req, res, getAuthorizedTenant, assertTenantPermission, vendorAvailabilityRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const block = await vendorAvailabilityRepository.findBlockByTenantAndId(tenant._id, req.params.blockId);
  if (!block) { const error = new Error("Availability block not found."); error.statusCode = 404; throw error; }
  await vendorAvailabilityRepository.deleteBlock(block._id);
  res.json({ block: formatAvailabilityBlock(block) });
}

async function handleCreateAvailabilityException({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, vendorAvailabilityRepository, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  const payload = await normalizeAvailabilityExceptionPayload(
    tenant,
    { ...(req.body || {}), locationSlug: location.slug },
    null,
    vendorServiceRepository,
    getLocationForTenant
  );
  const exception = await vendorAvailabilityRepository.createException({ tenantId: tenant._id, ...payload });
  res.status(201).json({ exception: formatAvailabilityException(exception) });
}

async function handleUpdateAvailabilityException({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, vendorAvailabilityRepository, vendorServiceRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const exception = await vendorAvailabilityRepository.findExceptionByTenantAndId(tenant._id, req.params.exceptionId);
  if (!exception) { const error = new Error("Availability exception not found."); error.statusCode = 404; throw error; }
  const payload = await normalizeAvailabilityExceptionPayload(
    tenant,
    req.body || {},
    exception,
    vendorServiceRepository,
    getLocationForTenant
  );
  const updatedException = await vendorAvailabilityRepository.updateException(exception._id, payload);
  res.json({ exception: formatAvailabilityException(updatedException) });
}

async function handleDeleteAvailabilityException({ req, res, getAuthorizedTenant, assertTenantPermission, vendorAvailabilityRepository }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const exception = await vendorAvailabilityRepository.findExceptionByTenantAndId(tenant._id, req.params.exceptionId);
  if (!exception) { const error = new Error("Availability exception not found."); error.statusCode = 404; throw error; }
  await vendorAvailabilityRepository.deleteException(exception._id);
  res.status(204).send();
}

module.exports = {
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
  handleDeleteAvailabilityException,
  formatVendorBooking,
  formatAvailabilityBlock,
  formatAvailabilityException,
  buildAvailabilitySummary,
  normalizeAvailabilityBlockPayload,
  normalizeAvailabilityExceptionPayload
};
