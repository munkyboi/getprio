const { projectOperationalBooking } = require("./vendorBookingReadModel");
const { normalizeAvailabilityBlockPayload, normalizeAvailabilityExceptionPayload } = require("../services/availabilityPayloadService");

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

async function handleListBookings({ req, res, getAuthorizedTenant, assertTenantPermission, assertBookingReadAccess, getLocationForTenant, bookingService, bookingRepository, formatPaginationMetadata, parsePaginationParams }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  const { page, pageSize } = parsePaginationParams(req.query);
  const location = req.query.location ? await getLocationForTenant(tenant, req.query.location) : null;
  const canManageBookings = assertBookingReadAccess
    ? await assertBookingReadAccess(req.user, tenant, location)
    : (assertTenantPermission(req.user, tenant._id, "tenant.booking.manage"), true);
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
  if (canManageBookings) {
    await bookingService.expirePendingBookingsForTenant(tenant._id);
  } else {
    await bookingService.expirePendingBookingsForLocation(tenant._id, location._id);
  }
  const { bookings, totalItems } = await bookingRepository.listBookingsForTenant(tenant._id, {
    page,
    pageSize,
    locationId: location?._id,
    status: status || null,
    hideCompleted: !status && req.query.hideCompleted === "true",
    scheduledDateFrom: scheduledDateFrom || null,
    scheduledDateTo: scheduledDateTo || null,
    search: search || null
  });
  res.json({ bookings: bookings.map((booking) => canManageBookings ? formatVendorBooking(booking) : projectOperationalBooking(formatVendorBooking(booking))), pagination: formatPaginationMetadata(totalItems, page, pageSize) });
}

async function handleBookingMutation({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, bookingService, publishSnapshot, permission, action, responseKey = "booking" }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, permission);
  const booking = await action({ tenant, req, getLocationForTenant, bookingService });
  const location = await getLocationForTenant(tenant, booking.locationSlug);
  await publishSnapshot(tenant, { location });
  res.json({ [responseKey]: formatVendorBooking(booking) });
}

async function handleCheckInBooking({ req, res, getAuthorizedTenant, assertTenantPermission, assertQueueLocationAccess, getLocationForTenant, bookingService, formatBookingForOperator, assertBookingReadAccess }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  if (assertBookingReadAccess) await assertBookingReadAccess(req.user, tenant, location);
  if (assertQueueLocationAccess) {
    await assertQueueLocationAccess(req.user, tenant, location);
  }
  const result = await bookingService.checkInVendorBooking({
    tenant, location, bookingId: req.params.bookingId, user: req.user, overrideWindow: Boolean(req.body.overrideWindow), overrideReason: req.body.overrideReason
  });
  res.status(201).json({ booking: formatBookingForOperator ? formatBookingForOperator(req.user, tenant, result.booking) : formatVendorBooking(result.booking), ticket: result.ticket });
}

async function handleMarkNoShow({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, bookingService, publishSnapshot, formatBookingForOperator, assertBookingReadAccess }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.queue.operate");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  if (assertBookingReadAccess) await assertBookingReadAccess(req.user, tenant, location);
  const booking = await bookingService.markVendorBookingNoShow({ tenant, location, bookingId: req.params.bookingId, user: req.user });
  await publishSnapshot(tenant, { location });
  res.json({ booking: formatBookingForOperator ? formatBookingForOperator(req.user, tenant, booking) : formatVendorBooking(booking) });
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

async function handleCreateAvailabilityBlock({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, availabilityCreationService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  const block = await availabilityCreationService.createAvailabilityEntry(tenant, location, req.body || {}, "block", { actorUserId: req.user._id });
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

async function handleDeleteAvailabilityBlock({ req, res, getAuthorizedTenant, assertTenantPermission, availabilityDeletionService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const block = await availabilityDeletionService.deleteAvailabilityEntry(tenant, req.params.blockId, "block", { actorUserId: req.user._id });
  res.json({ block: formatAvailabilityBlock(block) });
}

async function handleCreateAvailabilityException({ req, res, getAuthorizedTenant, assertTenantPermission, getLocationForTenant, availabilityCreationService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  const location = await getLocationForTenant(tenant, req.body.locationSlug || req.query.location);
  const exception = await availabilityCreationService.createAvailabilityEntry(tenant, location, req.body || {}, "exception", { actorUserId: req.user._id });
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

async function handleDeleteAvailabilityException({ req, res, getAuthorizedTenant, assertTenantPermission, availabilityDeletionService }) {
  const tenant = await getAuthorizedTenant(req.user, req.params.tenantSlug);
  assertTenantPermission(req.user, tenant._id, "tenant.availability.manage");
  await availabilityDeletionService.deleteAvailabilityEntry(tenant, req.params.exceptionId, "exception", { actorUserId: req.user._id });
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
