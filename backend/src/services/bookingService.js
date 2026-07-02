const bookingRepository = require("../repositories/bookings");
const db = require("../config/db");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const vendorServiceRepository = require("../repositories/vendorServices");
const vendorAvailabilityRepository = require("../repositories/vendorAvailability");
const bookingOtpService = require("./bookingOtpService");
const bookingSmsAlertPaymentService = require("./bookingSmsAlertPaymentService");
const notificationService = require("./notificationService");
const paymentProofStorageService = require("./paymentProofStorageService");

const CHECK_IN_WINDOW_MINUTES = 15;
const PENDING_BOOKING_EXPIRATION_MINUTES = 15;
const PENDING_BOOKING_EXPIRATION_REASON = "Expired after pending booking window.";
let queueServiceForTest = null;

function getQueueService() {
  return queueServiceForTest || require("./queueService");
}

function setQueueServiceForTest(queueService) {
  queueServiceForTest = queueService;
}

async function publishBookingSnapshot(tenant, location) {
  try {
    await getQueueService().publishSnapshot(tenant, { location });
  } catch {
    // Booking writes should not fail if a live dashboard refresh cannot be published.
  }
}

function normalizeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function normalizeBookingQuantity(value) {
  const quantity = Number(value || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 24) {
    const error = new Error("bookingQuantity must be between 1 and 24.");
    error.statusCode = 400;
    throw error;
  }
  return quantity;
}

function getServiceDurationMinutes(service) {
  const serviceDurationMinutes = Number(service.durationMinutes);
  if (!Number.isFinite(serviceDurationMinutes) || serviceDurationMinutes <= 0) {
    const error = new Error("Service duration must be configured before bookings can be created.");
    error.statusCode = 409;
    throw error;
  }
  return serviceDurationMinutes;
}

function getBookingDurationMinutes(service, bookingQuantity) {
  return getServiceDurationMinutes(service) * bookingQuantity;
}

function getBookingCapacityServiceId(service, capacityScope = "service") {
  return service.bookingCapacityScope === "location" || capacityScope === "location" ? null : service._id;
}

function normalizeServiceBookingQuantity(service, value) {
  const bookingQuantity = normalizeBookingQuantity(value);
  if (!service.allowBookingQuantity && bookingQuantity !== 1) {
    const error = new Error("This service does not allow booking multiple units.");
    error.statusCode = 400;
    throw error;
  }
  return service.allowBookingQuantity ? bookingQuantity : 1;
}

function buildLinkedQueueTicketSummary(ticket) {
  return {
    id: String(ticket._id),
    ticketNumber: ticket.ticketNumber,
    lookupCode: ticket.lookupCode,
    status: ticket.status
  };
}

function assertBookingBelongsToTenantLocation(booking, tenant, location) {
  if (!booking || String(booking.tenantId) !== String(tenant._id)) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  if (location && String(booking.locationId) !== String(location._id)) {
    const error = new Error("Booking not found for this location.");
    error.statusCode = 404;
    throw error;
  }
}

function getCheckInWindowState(booking, now = new Date()) {
  const scheduledStartAt = new Date(booking.scheduledStartAt);
  const earlyAt = new Date(scheduledStartAt.getTime() - CHECK_IN_WINDOW_MINUTES * 60 * 1000);
  const lateAt = new Date(scheduledStartAt.getTime() + CHECK_IN_WINDOW_MINUTES * 60 * 1000);
  const nowMs = now.getTime();

  return {
    earlyAt,
    lateAt,
    isTooEarly: nowMs < earlyAt.getTime(),
    isLate: nowMs > lateAt.getTime(),
    isWithinWindow: nowMs >= earlyAt.getTime() && nowMs <= lateAt.getTime()
  };
}

function getPendingBookingExpiration() {
  return new Date(Date.now() + PENDING_BOOKING_EXPIRATION_MINUTES * 60 * 1000).toISOString();
}

function hasActiveLocationPaymentQr(location) {
  return Boolean(
    location?.paymentQrActive &&
      location.paymentMethodLabel &&
      location.paymentAccountDisplayName &&
      location.paymentQrImageUrl
  );
}

function assertManualPaymentDestinationAvailable({ service, location }) {
  if (!service.manualPaymentRequired) {
    return;
  }

  if (!hasActiveLocationPaymentQr(location)) {
    const error = new Error("Manual payment is not available for this service at the selected branch.");
    error.statusCode = 409;
    throw error;
  }
}

async function expirePendingBookings(options = {}) {
  if (!bookingRepository.expirePendingBookings) {
    return [];
  }

  return bookingRepository.expirePendingBookings({
    ...options,
    reason: PENDING_BOOKING_EXPIRATION_REASON
  });
}

async function expirePendingBookingsForTenant(tenantId) {
  return expirePendingBookings({ tenantId });
}

async function expirePendingBookingsForCustomer(customerUserId) {
  return expirePendingBookings({ customerUserId });
}

function assertVerifiedPayloadMatchesRequest(verifiedPayload, requestBody) {
  const expected = {
    tenantSlug: String(requestBody.tenantSlug || "").trim().toLowerCase(),
    locationSlug: String(requestBody.locationSlug || "").trim().toLowerCase(),
    serviceSlug: vendorServiceRepository.normalizeServiceSlug(requestBody.serviceSlug),
    scheduledStartAt: String(requestBody.scheduledStartAt || "").trim(),
    bookingQuantity: normalizeBookingQuantity(requestBody.bookingQuantity)
  };

  for (const [field, value] of Object.entries(expected)) {
    const actualValue = field === "bookingQuantity"
      ? normalizeBookingQuantity(verifiedPayload[field])
      : verifiedPayload[field];
    if (actualValue !== value) {
      const error = new Error("Booking verification does not match this booking request. Please verify again.");
      error.statusCode = 400;
      throw error;
    }
  }
}

async function sendBookingSubmittedNotification({ tenant, booking }) {
  const message = `${tenant.name}: Your booking request ${booking.reference} was submitted and is pending vendor confirmation.`;

  if (booking.customerEmail) {
    await notificationService.sendEmail({
      to: booking.customerEmail,
      subject: `${tenant.name}: booking request submitted`,
      text: message,
      tenantId: tenant._id,
      purpose: "booking_submitted",
      metadata: { bookingId: booking._id, reference: booking.reference }
    });
  }

  if (booking.notifyBySms && booking.customerPhone) {
    await notificationService.sendSms({
      to: booking.customerPhone,
      body: message
    });
  }
}

function minutesFromTime(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return hours * 60 + minutes;
}

function getLocalDateKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getAvailabilityExceptionDateKey(exceptionDate) {
  if (!exceptionDate) {
    return "";
  }

  return getLocalDateKey(new Date(exceptionDate));
}

function parseDateKey(value) {
  const dateKey = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  return dateKey;
}

function getWeekdayInManila(date) {
  const shortDay = date.toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "short" });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(shortDay);
}

function getWeekdayForDateKey(dateKey) {
  return getWeekdayInManila(new Date(`${dateKey}T00:00:00+08:00`));
}

function getLocalTimeMinutes(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function dateKeyAndMinutesToDate(dateKey, minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const time = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  return new Date(`${dateKey}T${time}:00+08:00`);
}

function bookingFitsTimeRange({ startsAt, endsAt }, startMinutes, endMinutes) {
  const openMinutes = minutesFromTime(startsAt);
  const closeMinutes = minutesFromTime(endsAt);

  if (openMinutes === closeMinutes) {
    return true;
  }

  if (openMinutes < closeMinutes) {
    return startMinutes >= openMinutes && endMinutes <= closeMinutes;
  }

  return startMinutes >= openMinutes || endMinutes <= closeMinutes;
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function bookingFitsRule(rule, startMinutes, endMinutes) {
  return bookingFitsTimeRange(
    {
      startsAt: rule.startsAt,
      endsAt: rule.endsAt
    },
    startMinutes,
    endMinutes
  );
}

function ruleOverlapsBooking(rule, startMinutes, endMinutes) {
  if (!rule.startsAt || !rule.endsAt) {
    return true;
  }

  return rangesOverlap(startMinutes, endMinutes, minutesFromTime(rule.startsAt), minutesFromTime(rule.endsAt));
}

function storeHoursAllowBooking({ hours, scheduledStartAt, startMinutes, endMinutes }) {
  const weekday = getWeekdayInManila(scheduledStartAt);
  const hour = hours.find((entry) => entry.weekday === weekday);

  return Boolean(
    hour &&
      !hour.isClosed &&
      hour.opensAt &&
      hour.closesAt &&
      bookingFitsTimeRange(
        {
          startsAt: hour.opensAt,
          endsAt: hour.closesAt
        },
        startMinutes,
        endMinutes
      )
  );
}

async function assertAvailabilityAllowsBooking({ availability, location, service, scheduledStartAt, scheduledEndAt }) {
  const decision = await getBookingAvailabilityDecision({
    availability,
    location,
    service,
    scheduledStartAt,
    scheduledEndAt
  });

  if (!decision.allowed) {
    const error = new Error(decision.message);
    error.statusCode = 409;
    throw error;
  }

  return decision;
}

async function getBookingAvailabilityDecision({ availability, location, service, scheduledStartAt, scheduledEndAt }) {
  const dateKey = getLocalDateKey(scheduledStartAt);
  const startMinutes = getLocalTimeMinutes(scheduledStartAt);
  const endMinutes = getLocalTimeMinutes(scheduledEndAt);
  const matchingExceptions = availability.exceptions.filter((exception) =>
    getAvailabilityExceptionDateKey(exception.exceptionDate) === dateKey &&
      (!exception.serviceId || String(exception.serviceId) === String(service._id))
  );

  const blockingException = matchingExceptions.find((exception) =>
    !exception.isAvailable &&
      ruleOverlapsBooking(exception, startMinutes, endMinutes)
  );
  if (blockingException) {
    return {
      allowed: false,
      message: "That date or time is not available for booking."
    };
  }

  const availableException = matchingExceptions.find((exception) =>
    exception.isAvailable &&
      (!exception.startsAt || bookingFitsRule(exception, startMinutes, endMinutes))
  );
  if (availableException) {
    return {
      allowed: true,
      capacity: availableException.capacity || 1,
      capacityScope: availableException.serviceId ? "service" : "location"
    };
  }

  const activeBlocks = availability.blocks.filter((block) => block.isActive);
  const weekday = getWeekdayInManila(scheduledStartAt);
  const matchingBlock = activeBlocks.find((block) =>
      block.weekday === weekday &&
      (!block.serviceId || String(block.serviceId) === String(service._id)) &&
      bookingFitsRule(block, startMinutes, endMinutes)
  );

  if (!activeBlocks.length) {
    const hours = await storeLocationRepository.listHoursByLocationId(location._id);
    if (storeHoursAllowBooking({ hours, scheduledStartAt, startMinutes, endMinutes })) {
      return {
        allowed: true,
        capacity: 1,
        capacityScope: "service"
      };
    }
  }

  if (!matchingBlock) {
    return {
      allowed: false,
      message: "The selected time is outside the vendor's availability."
    };
  }

  return {
    allowed: true,
    capacity: matchingBlock.capacity || 1,
    capacityScope: matchingBlock.serviceId ? "service" : "location"
  };
}

function buildAvailabilityWindows({ availability, hours, service, location, dateKey }) {
  const weekday = getWeekdayForDateKey(dateKey);
  const activeBlocks = availability.blocks.filter((block) => block.isActive);
  const windows = [];

  if (activeBlocks.length) {
    for (const block of activeBlocks) {
      if (block.weekday !== weekday) {
        continue;
      }
      if (block.serviceId && String(block.serviceId) !== String(service._id)) {
        continue;
      }
      windows.push({
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        capacity: block.capacity || 1,
        capacityScope: block.serviceId ? "service" : "location"
      });
    }
  } else {
    const hour = hours.find((entry) => entry.weekday === weekday);
    if (hour && !hour.isClosed && hour.opensAt && hour.closesAt) {
      windows.push({
        startsAt: hour.opensAt,
        endsAt: hour.closesAt,
        capacity: 1,
        capacityScope: "service"
      });
    }
  }

  for (const exception of availability.exceptions) {
    if (
      getAvailabilityExceptionDateKey(exception.exceptionDate) !== dateKey ||
      !exception.isAvailable ||
      (exception.serviceId && String(exception.serviceId) !== String(service._id)) ||
      !exception.startsAt ||
      !exception.endsAt
    ) {
      continue;
    }

    windows.push({
      startsAt: exception.startsAt,
      endsAt: exception.endsAt,
      capacity: exception.capacity || 1,
      capacityScope: exception.serviceId ? "service" : "location"
    });
  }

  return windows
    .map((window) => ({
      startMinutes: minutesFromTime(window.startsAt),
      endMinutes: minutesFromTime(window.endsAt),
      capacity: window.capacity,
      capacityScope: window.capacityScope,
      locationId: location._id
    }))
    .filter((window) => window.startMinutes < window.endMinutes);
}

async function listBookingSlots({
  tenantSlug: tenantSlugValue,
  locationSlug: locationSlugValue,
  serviceSlug: serviceSlugValue,
  date,
  bookingQuantity: bookingQuantityValue,
  excludeBookingId,
  requirePublicVendor = true
}) {
  const tenantSlug = String(tenantSlugValue || "").trim().toLowerCase();
  const locationSlug = String(locationSlugValue || "").trim().toLowerCase();
  const serviceSlug = vendorServiceRepository.normalizeServiceSlug(serviceSlugValue);
  const dateKey = parseDateKey(date);

  if (!tenantSlug || !locationSlug || !serviceSlug || !dateKey) {
    const error = new Error("tenantSlug, locationSlug, serviceSlug, and date are required.");
    error.statusCode = 400;
    throw error;
  }

  const tenant = await tenantRepository.findTenantBySlug(tenantSlug, { activeOnly: true });
  if (
    !tenant ||
    (requirePublicVendor && (!tenant.publicProfileEnabled || tenant.vendorApprovalStatus !== "approved"))
  ) {
    const error = new Error("Vendor not found.");
    error.statusCode = 404;
    throw error;
  }

  const location = await storeLocationRepository.findLocationByTenantAndSlug(tenant._id, locationSlug);
  if (!location || !location.isActive) {
    const error = new Error("Location not found.");
    error.statusCode = 404;
    throw error;
  }

  const service = await vendorServiceRepository.findServiceByTenantAndSlug(tenant._id, serviceSlug);
  if (!service || !service.isActive) {
    const error = new Error("Service not found.");
    error.statusCode = 404;
    throw error;
  }
  const bookingQuantity = normalizeServiceBookingQuantity(service, bookingQuantityValue);
  await expirePendingBookingsForTenant(tenant._id);

  const availability = await vendorAvailabilityRepository.listAvailabilityByLocation(
    tenant._id,
    location._id
  );
  const hours = availability.blocks.some((block) => block.isActive)
    ? []
    : await storeLocationRepository.listHoursByLocationId(location._id);
  const windows = buildAvailabilityWindows({ availability, hours, service, location, dateKey });
  const slotsByStart = new Map();
  const bookingDurationMinutes = getBookingDurationMinutes(service, bookingQuantity);

  for (const window of windows) {
    for (
      let startMinutes = window.startMinutes;
      startMinutes + bookingDurationMinutes <= window.endMinutes;
      startMinutes += bookingDurationMinutes
    ) {
      const endMinutes = startMinutes + bookingDurationMinutes;
      const scheduledStartAt = dateKeyAndMinutesToDate(dateKey, startMinutes);
      const scheduledEndAt = dateKeyAndMinutesToDate(dateKey, endMinutes);

      if (scheduledStartAt.getTime() <= Date.now()) {
        continue;
      }

      const decision = await getBookingAvailabilityDecision({
        availability,
        location,
        service,
        scheduledStartAt,
        scheduledEndAt
      });

      if (!decision.allowed) {
        continue;
      }

      const capacity = decision.capacity || window.capacity || 1;
      const capacityScope = decision.capacityScope || window.capacityScope || "service";
      const activeCount = await bookingRepository.countOverlappingActiveBookings(tenant._id, {
        locationId: location._id,
        serviceId: getBookingCapacityServiceId(service, capacityScope),
        startsAt: scheduledStartAt.toISOString(),
        endsAt: scheduledEndAt.toISOString(),
        excludeBookingId
      });
      const remainingCapacity = Math.max(capacity - activeCount, 0);
      const slot = {
        startAt: scheduledStartAt.toISOString(),
        endAt: scheduledEndAt.toISOString(),
        remainingCapacity,
        isAvailable: remainingCapacity > 0,
        ...(remainingCapacity > 0 ? {} : { disabledReason: "capacity_full" })
      };
      const existing = slotsByStart.get(slot.startAt);
      if (!existing || slot.remainingCapacity > existing.remainingCapacity) {
        slotsByStart.set(slot.startAt, slot);
      }
    }
  }

  return [...slotsByStart.values()].sort((left, right) => left.startAt.localeCompare(right.startAt));
}

async function listVendorBookingRescheduleSlots({ tenant, bookingId, date }) {
  const booking = await bookingRepository.findBookingById(bookingId);
  assertBookingBelongsToTenantLocation(booking, tenant);

  if (!["pending", "confirmed", "rescheduled"].includes(booking.status)) {
    const error = new Error("This booking can no longer be rescheduled.");
    error.statusCode = 409;
    throw error;
  }

  return listBookingSlots({
    tenantSlug: tenant.slug,
    locationSlug: booking.locationSlug,
    serviceSlug: booking.serviceSlug,
    date,
    bookingQuantity: booking.bookingQuantity,
    excludeBookingId: booking._id,
    requirePublicVendor: false
  });
}

async function assertSlotCapacityAvailable({ tenant, location, service, scheduledStartAt, scheduledEndAt, capacity, capacityScope = "service", excludeBookingId }) {
  await expirePendingBookingsForTenant(tenant._id);

  const activeCount = await bookingRepository.countOverlappingActiveBookings(tenant._id, {
    locationId: location._id,
    serviceId: getBookingCapacityServiceId(service, capacityScope),
    startsAt: scheduledStartAt.toISOString(),
    endsAt: scheduledEndAt.toISOString(),
    excludeBookingId
  });

  if (activeCount >= capacity) {
    const error = new Error("This slot is no longer available. Please choose another time.");
    error.statusCode = 409;
    throw error;
  }
}

async function createCustomerBooking({ user, body }) {
  const tenantSlug = String(body.tenantSlug || "").trim().toLowerCase();
  const locationSlug = String(body.locationSlug || "").trim().toLowerCase();
  const serviceSlug = vendorServiceRepository.normalizeServiceSlug(body.serviceSlug);
  const scheduledStartAt = normalizeDateTime(body.scheduledStartAt);
  const customerEmail = String(body.customerEmail || user.email || "").trim().toLowerCase();
  const customerPhone = String(body.customerPhone || user.phone || "").trim();
  const bookingVerificationToken = String(body.bookingVerificationToken || "").trim();

  if (!tenantSlug || !locationSlug || !serviceSlug) {
    const error = new Error("tenantSlug, locationSlug, and serviceSlug are required.");
    error.statusCode = 400;
    throw error;
  }

  if (!scheduledStartAt || scheduledStartAt.getTime() <= Date.now()) {
    const error = new Error("scheduledStartAt must be a future date and time.");
    error.statusCode = 400;
    throw error;
  }

  const tenant = await tenantRepository.findTenantBySlug(tenantSlug, { activeOnly: true });
  if (!tenant || !tenant.publicProfileEnabled || tenant.vendorApprovalStatus !== "approved") {
    const error = new Error("Vendor not found.");
    error.statusCode = 404;
    throw error;
  }

  const location = await storeLocationRepository.findLocationByTenantAndSlug(tenant._id, locationSlug);
  if (!location || !location.isActive) {
    const error = new Error("Location not found.");
    error.statusCode = 404;
    throw error;
  }

  const service = await vendorServiceRepository.findServiceByTenantAndSlug(tenant._id, serviceSlug);
  if (!service || !service.isActive) {
    const error = new Error("Service not found.");
    error.statusCode = 404;
    throw error;
  }
  assertManualPaymentDestinationAvailable({ service, location });
  const bookingQuantity = normalizeServiceBookingQuantity(service, body.bookingQuantity);
  await expirePendingBookingsForTenant(tenant._id);

  if (!bookingVerificationToken) {
    const error = new Error("Booking verification is required before submitting this request.");
    error.statusCode = 400;
    throw error;
  }

  const verifiedBooking = await bookingOtpService.getVerifiedBookingPayload({
    tenant,
    token: bookingVerificationToken
  });
  assertVerifiedPayloadMatchesRequest(verifiedBooking.payload, body);

  const verifiedCustomerName = String(body.customerName || verifiedBooking.payload.customerName || user.name || "").trim();
  if (!verifiedCustomerName) {
    const error = new Error("customerName is required.");
    error.statusCode = 400;
    throw error;
  }

  const verifiedCustomerEmail = verifiedBooking.payload.customerEmail || customerEmail;
  const verifiedCustomerPhone = verifiedBooking.payload.customerPhone || customerPhone;
  const notifyBySms = Boolean(verifiedBooking.payload.notifyBySms);

  const scheduledEndAt = new Date(scheduledStartAt.getTime() + getBookingDurationMinutes(service, bookingQuantity) * 60 * 1000);
  const availability = await vendorAvailabilityRepository.listAvailabilityByLocation(
    tenant._id,
    location._id
  );
  const decision = await assertAvailabilityAllowsBooking({ availability, location, service, scheduledStartAt, scheduledEndAt });
  await assertSlotCapacityAvailable({
    tenant,
    location,
    service,
    scheduledStartAt,
    scheduledEndAt,
    capacity: decision.capacity || 1,
    capacityScope: decision.capacityScope || "service"
  });

  const smsFee = await bookingSmsAlertPaymentService.getBookingSmsFeeForTenant(tenant._id);
  let smsAlertFeePaymentId = null;
  if (bookingSmsAlertPaymentService.shouldChargeBookingSmsFee(smsFee, { notifyBySms })) {
    smsAlertFeePaymentId = String(body.smsAlertFeePaymentId || "").trim();
    await bookingSmsAlertPaymentService.assertPaidBookingSmsPayment({
      tenant,
      paymentId: smsAlertFeePaymentId,
      bookingOtpId: verifiedBooking.otpId
    });
  }

  const booking = await bookingRepository.createBooking({
    tenantId: tenant._id,
    locationId: location._id,
    serviceId: service._id,
    customerUserId: user._id,
    customerName: verifiedCustomerName,
    customerEmail: verifiedCustomerEmail,
    customerPhone: verifiedCustomerPhone,
    bookingQuantity,
    scheduledStartAt: scheduledStartAt.toISOString(),
    scheduledEndAt: scheduledEndAt.toISOString(),
    notes: String(verifiedBooking.payload.notes || body.notes || "").trim(),
    paymentReference: String(body.paymentReference || "").trim(),
    pendingExpiresAt: getPendingBookingExpiration(),
    notifyByEmail: Boolean(verifiedCustomerEmail),
    notifyBySms,
    smsAlertFeePaymentId,
    contactVerifiedAt: verifiedBooking.contactVerifiedAt,
    contactVerificationChannel: verifiedBooking.contactVerificationChannel
  });

  await bookingOtpService.consumeBookingVerificationToken(verifiedBooking.otpId);
  await sendBookingSubmittedNotification({ tenant, booking });
  await publishBookingSnapshot(tenant, location);

  return booking;
}

async function getCustomerOwnedBooking({ user, bookingId }) {
  await expirePendingBookingsForCustomer(user._id);
  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.customerUserId) !== String(user._id)) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  return booking;
}

function assertBookingCanAcceptPaymentProof(booking) {
  if (!booking.serviceManualPaymentRequired) {
    const error = new Error("This booking does not have an active manual payment QR.");
    error.statusCode = 409;
    throw error;
  }

  if (booking.checkedInAt || booking.queueTicketId) {
    const error = new Error("This booking has already been checked in and can no longer accept payment proof.");
    error.statusCode = 409;
    throw error;
  }

  if (!["pending", "confirmed", "rescheduled"].includes(booking.status)) {
    const error = new Error("This booking can no longer accept payment proof.");
    error.statusCode = 409;
    throw error;
  }

  if (booking.paymentProofObjectKey) {
    const error = new Error("Payment proof has already been submitted for this booking.");
    error.statusCode = 409;
    throw error;
  }
}

async function createCustomerPaymentProofUpload({ user, bookingId, body }) {
  const booking = await getCustomerOwnedBooking({ user, bookingId });
  assertBookingCanAcceptPaymentProof(booking);

  return paymentProofStorageService.createUpload({
    booking,
    body
  });
}

async function uploadCustomerPaymentProofDirect({ user, bookingId, body, fileBuffer }) {
  const booking = await getCustomerOwnedBooking({ user, bookingId });
  assertBookingCanAcceptPaymentProof(booking);

  return paymentProofStorageService.uploadBinary({
    booking,
    body,
    fileBuffer
  });
}

async function submitCustomerPaymentProof({ user, bookingId, body }) {
  const booking = await getCustomerOwnedBooking({ user, bookingId });
  assertBookingCanAcceptPaymentProof(booking);

  const paymentReference = String(body.paymentReference || "").trim();
  if (!paymentReference) {
    const error = new Error("paymentReference is required.");
    error.statusCode = 400;
    throw error;
  }

  const contentType = String(body.contentType || "").toLowerCase();
  const sizeBytes = Number(body.sizeBytes || 0);
  paymentProofStorageService.assertUploadMetadata({ contentType, sizeBytes });
  const objectKey = paymentProofStorageService.assertObjectKeyBelongsToBooking(
    booking,
    body.objectKey
  );

  const updated = await bookingRepository.updateBooking(booking._id, {
    paymentReference,
    paymentStatus: "pending",
    paymentProofObjectKey: objectKey,
    paymentProofFileName: String(body.fileName || "payment-proof").trim().slice(0, 160),
    paymentProofContentType: contentType,
    paymentProofSizeBytes: sizeBytes,
    paymentProofUploadedAt: new Date().toISOString()
  });

  const tenant = await tenantRepository.findTenantBySlug(updated.tenantSlug);
  const location = tenant
    ? await storeLocationRepository.findLocationByTenantAndSlug(tenant._id, updated.locationSlug)
    : null;
  if (tenant && location) {
    await publishBookingSnapshot(tenant, location);
  }

  return updated;
}

async function createCustomerPaymentProofAccess({ user, bookingId }) {
  const booking = await getCustomerOwnedBooking({ user, bookingId });
  return paymentProofStorageService.createViewAccess({ booking });
}

async function createVendorPaymentProofAccess({ tenant, bookingId }) {
  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.tenantId) !== String(tenant._id)) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  return paymentProofStorageService.createViewAccess({ booking });
}

async function updateVendorBookingStatus({ tenant, bookingId, status }) {
  await expirePendingBookingsForTenant(tenant._id);

  const allowedStatuses = new Set(["confirmed", "canceled"]);
  if (!allowedStatuses.has(status)) {
    const error = new Error("status must be confirmed or canceled.");
    error.statusCode = 400;
    throw error;
  }

  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.tenantId) !== String(tenant._id)) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  if (["completed", "reviewed", "disputed"].includes(booking.status)) {
    const error = new Error("This booking can no longer be changed.");
    error.statusCode = 409;
    throw error;
  }

  if (status === "confirmed" && booking.paymentStatus === "pending") {
    const error = new Error("Payment evidence must be verified before this booking can be confirmed.");
    error.statusCode = 409;
    throw error;
  }

  return bookingRepository.updateBooking(booking._id, { status });
}

function assertVendorCanReviewBookingPayment(booking, tenant) {
  if (!booking || String(booking.tenantId) !== String(tenant._id)) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  if (booking.queueTicketId || booking.checkedInAt) {
    const error = new Error("Checked-in bookings must be managed from the live queue.");
    error.statusCode = 409;
    throw error;
  }

  if (booking.status !== "pending") {
    const error = new Error("Only pending bookings can have payment evidence reviewed.");
    error.statusCode = 409;
    throw error;
  }

  if (!booking.paymentProofObjectKey) {
    const error = new Error("Payment proof has not been submitted for this booking.");
    error.statusCode = 409;
    throw error;
  }
}

async function verifyVendorBookingPayment({ tenant, bookingId, user }) {
  await expirePendingBookingsForTenant(tenant._id);
  const booking = await bookingRepository.findBookingById(bookingId);
  assertVendorCanReviewBookingPayment(booking, tenant);

  if (booking.paymentStatus === "paid" || booking.paymentVerifiedAt) {
    const error = new Error("Payment evidence has already been verified.");
    error.statusCode = 409;
    throw error;
  }

  if (booking.paymentStatus !== "pending") {
    const error = new Error("Only pending payment evidence can be verified.");
    error.statusCode = 409;
    throw error;
  }

  return bookingRepository.updateBooking(booking._id, {
    paymentStatus: "paid",
    paymentVerifiedAt: new Date().toISOString(),
    paymentVerifiedByUserId: user?._id || null,
    paymentRejectedAt: null,
    paymentRejectedByUserId: null,
    paymentRejectionReason: ""
  });
}

async function rejectVendorBookingPayment({ tenant, bookingId, user, reason }) {
  await expirePendingBookingsForTenant(tenant._id);
  const booking = await bookingRepository.findBookingById(bookingId);
  assertVendorCanReviewBookingPayment(booking, tenant);

  if (booking.paymentRejectedAt || booking.paymentStatus === "failed") {
    const error = new Error("Payment evidence has already been rejected.");
    error.statusCode = 409;
    throw error;
  }

  const paymentRejectionReason = String(reason || "").trim();
  if (!paymentRejectionReason) {
    const error = new Error("A customer-visible rejection reason is required.");
    error.statusCode = 400;
    throw error;
  }

  const updated = await bookingRepository.updateBooking(booking._id, {
    status: "canceled",
    paymentStatus: "failed",
    paymentRejectedAt: new Date().toISOString(),
    paymentRejectedByUserId: user?._id || null,
    paymentRejectionReason
  });

  const message = `${updated.tenantName}: Payment evidence for booking ${updated.reference} was rejected. ${paymentRejectionReason}`;
  if (updated.customerEmail) {
    await notificationService.sendEmail({
      to: updated.customerEmail,
      subject: `${updated.tenantName}: booking payment rejected`,
      text: message,
      tenantId: updated.tenantId,
      purpose: "booking_payment_rejected",
      metadata: { bookingId: updated._id, reference: updated.reference }
    });
  }
  if (updated.notifyBySms && updated.customerPhone) {
    await notificationService.sendSms({
      to: updated.customerPhone,
      body: message
    });
  }

  return updated;
}

async function cancelCustomerBooking({ user, bookingId, reason }) {
  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.customerUserId) !== String(user._id)) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  if (booking.checkedInAt || booking.queueTicketId) {
    const error = new Error("This booking has already been checked in and can no longer be cancelled here.");
    error.statusCode = 409;
    throw error;
  }

  if (!["pending", "confirmed", "rescheduled"].includes(booking.status)) {
    const error = new Error("This booking can no longer be cancelled.");
    error.statusCode = 409;
    throw error;
  }

  const cancellationReason = String(reason || "").trim();
  const updated = await bookingRepository.updateBooking(booking._id, {
    status: "canceled",
    notes: cancellationReason || booking.notes || ""
  });

  const message = `${updated.tenantName}: Your booking request ${updated.reference} was cancelled.`;
  if (updated.customerEmail) {
    await notificationService.sendEmail({
      to: updated.customerEmail,
      subject: `${updated.tenantName}: booking cancelled`,
      text: message,
      tenantId: updated.tenantId,
      purpose: "booking_cancelled",
      metadata: { bookingId: updated._id, reference: updated.reference }
    });
  }
  if (updated.notifyBySms && updated.customerPhone) {
    await notificationService.sendSms({
      to: updated.customerPhone,
      body: message
    });
  }
  const tenant = tenantRepository.findTenantBySlug
    ? await tenantRepository.findTenantBySlug(updated.tenantSlug)
    : null;
  const location = tenant && storeLocationRepository.findLocationByTenantAndSlug
    ? await storeLocationRepository.findLocationByTenantAndSlug(tenant._id, updated.locationSlug)
    : null;
  if (tenant && location) {
    await publishBookingSnapshot(tenant, location);
  }

  return updated;
}

async function rescheduleVendorBooking({ tenant, bookingId, scheduledStartAt: scheduledStartAtValue }) {
  await expirePendingBookingsForTenant(tenant._id);
  const booking = await bookingRepository.findBookingById(bookingId);
  if (!booking || String(booking.tenantId) !== String(tenant._id)) {
    const error = new Error("Booking not found.");
    error.statusCode = 404;
    throw error;
  }

  if (["completed", "reviewed", "disputed", "canceled"].includes(booking.status)) {
    const error = new Error("This booking can no longer be rescheduled.");
    error.statusCode = 409;
    throw error;
  }

  const scheduledStartAt = normalizeDateTime(scheduledStartAtValue);
  if (!scheduledStartAt || scheduledStartAt.getTime() <= Date.now()) {
    const error = new Error("scheduledStartAt must be a future date and time.");
    error.statusCode = 400;
    throw error;
  }

  const location = await storeLocationRepository.findLocationByTenantAndSlug(
    tenant._id,
    booking.locationSlug
  );
  const service = await vendorServiceRepository.findServiceByTenantAndSlug(
    tenant._id,
    booking.serviceSlug
  );
  if (!location || !service) {
    const error = new Error("Booking location or service is no longer available.");
    error.statusCode = 409;
    throw error;
  }

  const bookingQuantity = normalizeBookingQuantity(booking.bookingQuantity);
  const scheduledEndAt = new Date(scheduledStartAt.getTime() + getBookingDurationMinutes(service, bookingQuantity) * 60 * 1000);
  const availability = await vendorAvailabilityRepository.listAvailabilityByLocation(
    tenant._id,
    location._id
  );
  const decision = await assertAvailabilityAllowsBooking({ availability, location, service, scheduledStartAt, scheduledEndAt });
  await assertSlotCapacityAvailable({
    tenant,
    location,
    service,
    scheduledStartAt,
    scheduledEndAt,
    capacity: decision.capacity || 1,
    capacityScope: decision.capacityScope || "service",
    excludeBookingId: booking._id
  });

  return bookingRepository.updateBooking(booking._id, {
    scheduledStartAt: scheduledStartAt.toISOString(),
    scheduledEndAt: scheduledEndAt.toISOString(),
    status: "rescheduled",
    queueTicketId: null,
    checkedInAt: null,
    checkedInByUserId: null
  });
}

async function checkInVendorBooking({ tenant, location, bookingId, user, overrideWindow, overrideReason }) {
  await expirePendingBookingsForTenant(tenant._id);
  const queueService = getQueueService();
  const result = await db.withTransaction(async (client) => {
    const booking = await bookingRepository.findBookingByIdForUpdate(bookingId, { client });
    assertBookingBelongsToTenantLocation(booking, tenant, location);

    if (!["confirmed", "rescheduled"].includes(booking.status)) {
      const error = new Error("Only confirmed or rescheduled bookings can be checked in.");
      error.statusCode = 409;
      throw error;
    }

    if (booking.queueTicketId || booking.checkedInAt) {
      const error = new Error("This booking has already been checked in.");
      error.statusCode = 409;
      throw error;
    }

    const windowState = getCheckInWindowState(booking);
    if (windowState.isTooEarly) {
      const error = new Error("This booking is not inside the check-in window yet.");
      error.statusCode = 409;
      throw error;
    }
    if (windowState.isLate && !overrideWindow) {
      const error = new Error("This booking is outside the check-in window. Use a late check-in override to continue.");
      error.statusCode = 409;
      throw error;
    }

    await queueService.assertQueueIntakeOpen(tenant, location, { client });
    const ticket = await queueService.createTicketForTenantInTransaction(client, {
      tenant,
      location,
      userId: booking.customerUserId,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      notifyByEmail: booking.notifyByEmail,
      notifyBySms: booking.notifyBySms,
      joinChannel: "vendor",
      notes: [
        `Checked in from booking ${booking.reference}.`,
        windowState.isLate ? `Late override: ${String(overrideReason || "vendor override").trim()}` : ""
      ].filter(Boolean).join(" "),
      servicePriorityBand: "checked_in_booking"
    });

    const updatedBooking = await bookingRepository.updateBooking(
      booking._id,
      {
        queueTicketId: ticket._id,
        checkedInAt: new Date().toISOString(),
        checkedInByUserId: user?._id || null
      },
      { client }
    );

    return { booking: updatedBooking, ticket };
  });

  await queueService.maybeNotifyUpcomingTickets(tenant, { location });
  await queueService.maybeAutoPauseQueueDay(tenant, { location });
  await queueService.publishSnapshot(tenant, {
    lookupCode: result.ticket.lookupCode,
    location
  });

  return {
    booking: result.booking,
    ticket: buildLinkedQueueTicketSummary(result.ticket)
  };
}

async function markVendorBookingNoShow({ tenant, location, bookingId, user }) {
  await expirePendingBookingsForTenant(tenant._id);
  const booking = await bookingRepository.findBookingById(bookingId);
  assertBookingBelongsToTenantLocation(booking, tenant, location);

  if (booking.queueTicketId || booking.checkedInAt) {
    const error = new Error("Checked-in bookings must be managed from the live queue.");
    error.statusCode = 409;
    throw error;
  }

  if (!["confirmed", "rescheduled"].includes(booking.status)) {
    const error = new Error("Only confirmed or rescheduled bookings can be marked as no-show.");
    error.statusCode = 409;
    throw error;
  }

  const windowState = getCheckInWindowState(booking);
  if (!windowState.isLate) {
    const error = new Error("This booking is not late enough to mark as no-show.");
    error.statusCode = 409;
    throw error;
  }

  const updated = await bookingRepository.updateBooking(booking._id, {
    status: "canceled",
    noShowAt: new Date().toISOString(),
    noShowByUserId: user?._id || null
  });

  const message = `${updated.tenantName}: Your booking request ${updated.reference} was cancelled as a no-show.`;
  if (updated.customerEmail) {
    await notificationService.sendEmail({
      to: updated.customerEmail,
      subject: `${updated.tenantName}: booking no-show`,
      text: message,
      tenantId: updated.tenantId,
      purpose: "booking_no_show",
      metadata: { bookingId: updated._id, reference: updated.reference }
    });
  }
  if (updated.notifyBySms && updated.customerPhone) {
    await notificationService.sendSms({
      to: updated.customerPhone,
      body: message
    });
  }

  return updated;
}

module.exports = {
  _setQueueServiceForTest: setQueueServiceForTest,
  cancelCustomerBooking,
  checkInVendorBooking,
  createCustomerBooking,
  createCustomerPaymentProofAccess,
  createCustomerPaymentProofUpload,
  uploadCustomerPaymentProofDirect,
  createVendorPaymentProofAccess,
  expirePendingBookingsForCustomer,
  expirePendingBookingsForTenant,
  listBookingSlots,
  listVendorBookingRescheduleSlots,
  markVendorBookingNoShow,
  rejectVendorBookingPayment,
  submitCustomerPaymentProof,
  rescheduleVendorBooking,
  updateVendorBookingStatus,
  verifyVendorBookingPayment
};
