// Staff receive operational booking details only. Administrative/payment metadata
// must be explicitly added to this allowlist if a future operational flow needs it.
function projectOperationalBooking(booking) {
  const fields = [
    "id", "reference", "tenantId", "tenantName", "tenantSlug",
    "locationId", "locationName", "locationSlug", "serviceId", "serviceName", "serviceSlug",
    "serviceManualPaymentRequired", "servicePriceAmountCents", "serviceCurrency", "servicePriceDisplay",
    "bundleItems", "executionMode", "bookingQuantity", "customerName", "customerPhone", "customerEmail",
    "scheduledStartAt", "scheduledEndAt", "status", "paymentStatus", "pendingExpiresAt",
    "expiredAt", "expirationReason", "linkedTicket", "checkedInAt", "noShowAt", "createdAt", "updatedAt"
  ];
  return Object.fromEntries(fields.map((field) => [field, booking[field]]));
}
module.exports = { projectOperationalBooking };
