import type {
  BookingPaymentProofAccessResponse,
  RejectVendorBookingPaymentRequest,
  RescheduleVendorBookingRequest,
  UpdateVendorBookingStatusRequest,
  VendorBookingResponse,
  VendorBookingsResponse,
  VendorCheckInBookingRequest,
  VendorCheckInBookingResponse
} from "@shared";
import { apiRequest } from "./client";

export function getBookings(
  token: string,
  tenantSlug: string,
  locationSlug: string,
  page: number,
  search: string,
  status: string,
  dateRange: [string | null, string | null]
) {
  const statusQuery = status !== "all" ? `&status=${encodeURIComponent(status)}` : "";
  const [dateFrom, dateTo] = dateRange;
  const dateQuery = [
    dateFrom ? `scheduledDateFrom=${encodeURIComponent(dateFrom)}` : "",
    dateTo ? `scheduledDateTo=${encodeURIComponent(dateTo)}` : ""
  ]
    .filter(Boolean)
    .join("&");
  const searchQuery = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
  return apiRequest<VendorBookingsResponse>(
    `/vendor/tenant/${tenantSlug}/bookings?page=${page}&pageSize=10&location=${encodeURIComponent(locationSlug)}${statusQuery}${dateQuery ? `&${dateQuery}` : ""}${searchQuery}`,
    { token }
  );
}

export function getBookingAlerts(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<VendorBookingsResponse>(
    `/vendor/tenant/${tenantSlug}/bookings?page=1&pageSize=10&location=${encodeURIComponent(locationSlug)}&status=pending`,
    { token }
  );
}

export function updateBookingStatus(
  token: string,
  tenantSlug: string,
  bookingId: string,
  status: UpdateVendorBookingStatusRequest["status"]
) {
  return apiRequest<VendorBookingResponse, UpdateVendorBookingStatusRequest>(
    `/vendor/tenant/${tenantSlug}/bookings/${bookingId}/status`,
    { method: "PATCH", token, body: { status } }
  );
}

export function rescheduleBooking(token: string, tenantSlug: string, bookingId: string, scheduledStartAt: string) {
  return apiRequest<VendorBookingResponse, RescheduleVendorBookingRequest>(
    `/vendor/tenant/${tenantSlug}/bookings/${bookingId}/reschedule`,
    { method: "PATCH", token, body: { scheduledStartAt } }
  );
}

export function checkInBooking(
  token: string,
  tenantSlug: string,
  bookingId: string,
  body: VendorCheckInBookingRequest,
  locationQuery: string
) {
  return apiRequest<VendorCheckInBookingResponse, VendorCheckInBookingRequest>(
    `/vendor/tenant/${tenantSlug}/bookings/${bookingId}/check-in${locationQuery}`,
    { method: "POST", token, body }
  );
}

export function markBookingNoShow(token: string, tenantSlug: string, bookingId: string, locationQuery: string) {
  return apiRequest<VendorBookingResponse>(`/vendor/tenant/${tenantSlug}/bookings/${bookingId}/no-show${locationQuery}`, {
    method: "POST",
    token
  });
}

export function getBookingPaymentProof(token: string, tenantSlug: string, bookingId: string) {
  return apiRequest<BookingPaymentProofAccessResponse>(
    `/vendor/tenant/${tenantSlug}/bookings/${bookingId}/payment-proof`,
    { token }
  );
}

export function verifyBookingPayment(token: string, tenantSlug: string, bookingId: string) {
  return apiRequest<VendorBookingResponse>(`/vendor/tenant/${tenantSlug}/bookings/${bookingId}/verify-payment`, {
    method: "PATCH",
    token
  });
}

export function rejectBookingPayment(
  token: string,
  tenantSlug: string,
  bookingId: string,
  body: RejectVendorBookingPaymentRequest
) {
  return apiRequest<VendorBookingResponse, RejectVendorBookingPaymentRequest>(
    `/vendor/tenant/${tenantSlug}/bookings/${bookingId}/reject-payment`,
    { method: "PATCH", token, body }
  );
}
