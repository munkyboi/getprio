const { appUrl } = require("./emailTemplates");

function scheduledTime(booking) {
  if (!booking.scheduledStartAt) return "";
  const date = new Date(booking.scheduledStartAt);
  if (Number.isNaN(date.getTime())) return "";
  const timezone = booking.locationTimezone || "Asia/Manila";
  try {
    return `${new Intl.DateTimeFormat("en-PH", { dateStyle: "full", timeStyle: "short", timeZone: timezone }).format(date)} (${timezone})`;
  } catch {
    // Retain an unambiguous time if legacy location data has an invalid timezone.
    return date.toISOString();
  }
}

function bookingEmailTemplate(booking) {
  const services = Array.isArray(booking.bundleItems) && booking.bundleItems.length
    ? booking.bundleItems.map((item, index, items) => ({
      label: items.length > 1 ? `Service ${index + 1}` : "Service",
      value: `${item.serviceName}${item.bookingQuantity ? ` · Quantity: ${item.bookingQuantity}` : ""}`
    }))
    : [{ label: "Service", value: booking.serviceName }];
  return {
    greeting: booking.customerName ? `Hi ${booking.customerName},` : "",
    illustration: booking.status === "confirmed" ? "booking-confirmation" : undefined,
    details: [
      { label: "Booking reference", value: booking.reference },
      ...services,
      { label: "Venue", value: [booking.tenantName, booking.locationName].filter(Boolean).join(" · ") },
      { label: "Date and time", value: scheduledTime(booking) },
      { label: "Status", value: String(booking.status || "").replaceAll("_", " ") }
    ],
    // Guest booking emails must not promise access to an account-owned route.
    actionUrl: booking.customerUserId && booking._id ? appUrl(`/account/bookings/${encodeURIComponent(booking._id)}`) : "",
    actionLabel: "View booking"
  };
}

module.exports = { bookingEmailTemplate };
