const bookingRepository = require("../repositories/bookings");
const tenantRepository = require("../repositories/tenants");
const storeLocationRepository = require("../repositories/storeLocations");
const vendorServiceRepository = require("../repositories/vendorServices");
const vendorAvailabilityRepository = require("../repositories/vendorAvailability");

function normalizeDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
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

function getWeekdayInManila(date) {
  const shortDay = date.toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "short" });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(shortDay);
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
  const dateKey = getLocalDateKey(scheduledStartAt);
  const startMinutes = getLocalTimeMinutes(scheduledStartAt);
  const endMinutes = getLocalTimeMinutes(scheduledEndAt);
  const matchingExceptions = availability.exceptions.filter((exception) =>
    String(exception.exceptionDate).slice(0, 10) === dateKey &&
      (!exception.serviceId || String(exception.serviceId) === String(service._id))
  );

  const blockingException = matchingExceptions.find((exception) =>
    !exception.isAvailable &&
      (!exception.startsAt || bookingFitsRule(exception, startMinutes, endMinutes))
  );
  if (blockingException) {
    const error = new Error("That date or time is not available for booking.");
    error.statusCode = 409;
    throw error;
  }

  const availableException = matchingExceptions.find((exception) =>
    exception.isAvailable &&
      (!exception.startsAt || bookingFitsRule(exception, startMinutes, endMinutes))
  );
  if (availableException) {
    return;
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
      return;
    }
  }

  if (!matchingBlock) {
    const error = new Error("The selected time is outside the vendor's availability.");
    error.statusCode = 409;
    throw error;
  }
}

async function createCustomerBooking({ user, body }) {
  const tenantSlug = String(body.tenantSlug || "").trim().toLowerCase();
  const locationSlug = String(body.locationSlug || "").trim().toLowerCase();
  const serviceSlug = vendorServiceRepository.normalizeServiceSlug(body.serviceSlug);
  const scheduledStartAt = normalizeDateTime(body.scheduledStartAt);
  const customerName = String(body.customerName || user.name || "").trim();
  const customerEmail = String(body.customerEmail || user.email || "").trim().toLowerCase();
  const customerPhone = String(body.customerPhone || user.phone || "").trim();

  if (!tenantSlug || !locationSlug || !serviceSlug) {
    const error = new Error("tenantSlug, locationSlug, and serviceSlug are required.");
    error.statusCode = 400;
    throw error;
  }

  if (!customerName) {
    const error = new Error("customerName is required.");
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

  const scheduledEndAt = new Date(scheduledStartAt.getTime() + service.durationMinutes * 60 * 1000);
  const availability = await vendorAvailabilityRepository.listAvailabilityByLocation(
    tenant._id,
    location._id
  );
  await assertAvailabilityAllowsBooking({ availability, location, service, scheduledStartAt, scheduledEndAt });

  return bookingRepository.createBooking({
    tenantId: tenant._id,
    locationId: location._id,
    serviceId: service._id,
    customerUserId: user._id,
    customerName,
    customerEmail,
    customerPhone,
    scheduledStartAt: scheduledStartAt.toISOString(),
    scheduledEndAt: scheduledEndAt.toISOString(),
    notes: String(body.notes || "").trim(),
    paymentReference: String(body.paymentReference || "").trim()
  });
}

module.exports = {
  createCustomerBooking
};
