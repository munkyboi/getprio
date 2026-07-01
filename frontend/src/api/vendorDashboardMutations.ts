import { API_BASE_URL, apiRequest } from "./client";
import type {
  BookingPaymentProofAccessResponse,
  CheckoutSessionResponse,
  CreateCheckoutRequest,
  CreateWalkInTicketRequest,
  LocationPaymentQrUploadResponse,
  PublicBoardThemeResponse,
  PublicBoardThemeUploadResponse,
  RejectVendorBookingPaymentRequest,
  RescheduleVendorBookingRequest,
  SavePublicBoardThemeRequest,
  SaveServiceCounterRequest,
  SaveVendorAvailabilityBlockRequest,
  SaveVendorAvailabilityExceptionRequest,
  SaveVendorServiceRequest,
  TicketStatus,
  UpdateTenantNotificationSettingsRequest,
  UpdateTenantNotificationSettingsResponse,
  UpdateTenantSettingsRequest,
  UpdateVendorBookingStatusRequest,
  VendorAvailabilityBlockResponse,
  VendorAvailabilityExceptionResponse,
  VendorBookingResponse,
  VendorCheckInBookingRequest,
  VendorCheckInBookingResponse,
  VendorServiceResponse
} from "@shared";

type VendorDashboardActionResponse = {
  message?: string;
  snapshot?: import("@shared").QueueSnapshot;
};

export function updateSettings(token: string, tenantSlug: string, settings: UpdateTenantSettingsRequest) {
  return apiRequest<VendorDashboardActionResponse, UpdateTenantSettingsRequest>(
    `/vendor/tenant/${tenantSlug}/settings`,
    { method: "PATCH", token, body: settings }
  );
}

export function updateNotificationSettings(token: string, tenantSlug: string, settings: UpdateTenantNotificationSettingsRequest) {
  return apiRequest<UpdateTenantNotificationSettingsResponse, UpdateTenantNotificationSettingsRequest>(
    `/vendor/tenant/${tenantSlug}/notification-settings`,
    { method: "PATCH", token, body: settings }
  );
}

export function startCheckout(token: string, tenantSlug: string, body: CreateCheckoutRequest) {
  return apiRequest<CheckoutSessionResponse, CreateCheckoutRequest>(`/billing/tenant/${tenantSlug}/checkout`, {
    method: "POST",
    token,
    body
  });
}

export function saveTheme(token: string, tenantSlug: string, locationSlug: string, body: SavePublicBoardThemeRequest) {
  return apiRequest<PublicBoardThemeResponse, SavePublicBoardThemeRequest>(
    `/vendor/tenant/${tenantSlug}/public-board-theme?location=${encodeURIComponent(locationSlug)}`,
    { method: "PATCH", token, body }
  );
}

export function uploadThemeAsset(
  token: string,
  tenantSlug: string,
  locationSlug: string,
  assetType: "background" | "logo",
  file: File
) {
  return fetch(
    `${API_BASE_URL}/vendor/tenant/${tenantSlug}/public-board-theme/uploads/direct?location=${encodeURIComponent(locationSlug)}&assetType=${encodeURIComponent(assetType)}&fileName=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type
      },
      body: file
    }
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error("Upload failed.");
    }

    return (await response.json()) as PublicBoardThemeUploadResponse;
  });
}

export function uploadLocationPaymentQr(token: string, tenantSlug: string, locationSlug: string, file: File) {
  return fetch(
    `${API_BASE_URL}/vendor/tenant/${tenantSlug}/location-payment-qrs/uploads/direct?locationSlug=${encodeURIComponent(locationSlug)}&fileName=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type
      },
      body: file
    }
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error("Payment QR upload failed.");
    }

    return (await response.json()) as LocationPaymentQrUploadResponse;
  });
}

export function createWalkInTicket(token: string, tenantSlug: string, locationQuery: string, body: CreateWalkInTicketRequest) {
  return apiRequest<
    { ticket: { id: string; ticketNumber: string; lookupCode: string; status: TicketStatus }; snapshot?: import("@shared").QueueSnapshot },
    CreateWalkInTicketRequest
  >(`/vendor/tenant/${tenantSlug}/tickets${locationQuery}`, { method: "POST", token, body });
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

export function saveService(token: string, tenantSlug: string, slug: string | null, body: SaveVendorServiceRequest) {
  const path = slug ? `/vendor/tenant/${tenantSlug}/services/${slug}` : `/vendor/tenant/${tenantSlug}/services`;
  const method = slug ? "PATCH" : "POST";
  return apiRequest<VendorServiceResponse, SaveVendorServiceRequest>(path, { method, token, body });
}

export function deactivateService(token: string, tenantSlug: string, slug: string) {
  return apiRequest<VendorServiceResponse>(`/vendor/tenant/${tenantSlug}/services/${slug}`, {
    method: "DELETE",
    token
  });
}

export function saveAvailabilityBlock(
  token: string,
  tenantSlug: string,
  blockId: string | null,
  body: SaveVendorAvailabilityBlockRequest
) {
  const path = blockId
    ? `/vendor/tenant/${tenantSlug}/availability/blocks/${blockId}`
    : `/vendor/tenant/${tenantSlug}/availability/blocks`;
  const method = blockId ? "PATCH" : "POST";
  return apiRequest<VendorAvailabilityBlockResponse, SaveVendorAvailabilityBlockRequest>(path, {
    method,
    token,
    body
  });
}

export function deleteAvailabilityBlock(token: string, tenantSlug: string, blockId: string) {
  return apiRequest<VendorAvailabilityBlockResponse>(
    `/vendor/tenant/${tenantSlug}/availability/blocks/${blockId}`,
    { method: "DELETE", token }
  );
}

export function saveAvailabilityException(
  token: string,
  tenantSlug: string,
  exceptionId: string | null,
  body: SaveVendorAvailabilityExceptionRequest
) {
  const path = exceptionId
    ? `/vendor/tenant/${tenantSlug}/availability/exceptions/${exceptionId}`
    : `/vendor/tenant/${tenantSlug}/availability/exceptions`;
  const method = exceptionId ? "PATCH" : "POST";
  return apiRequest<VendorAvailabilityExceptionResponse, SaveVendorAvailabilityExceptionRequest>(path, {
    method,
    token,
    body
  });
}

export function deleteAvailabilityException(token: string, tenantSlug: string, exceptionId: string) {
  return apiRequest<void>(`/vendor/tenant/${tenantSlug}/availability/exceptions/${exceptionId}`, {
    method: "DELETE",
    token
  });
}

export function saveCounter(token: string, tenantSlug: string, locationSlug: string, counterSlug: string | null, body: SaveServiceCounterRequest) {
  const path = counterSlug
    ? `/vendor/tenant/${tenantSlug}/counters/${counterSlug}?location=${encodeURIComponent(locationSlug)}`
    : `/vendor/tenant/${tenantSlug}/counters?location=${encodeURIComponent(locationSlug)}`;
  const method = counterSlug ? "PATCH" : "POST";
  return apiRequest<{ counter: import("@shared").ServiceCounterSummary }, SaveServiceCounterRequest>(path, {
    method,
    token,
    body
  });
}

export function deleteCounter(token: string, tenantSlug: string, locationSlug: string, counterSlug: string) {
  return apiRequest<void>(
    `/vendor/tenant/${tenantSlug}/counters/${counterSlug}?location=${encodeURIComponent(locationSlug)}`,
    { method: "DELETE", token }
  );
}

export function addStaff(token: string, tenantSlug: string, body: import("@shared").AddVendorStaffRequest) {
  return apiRequest<{ userId: string }, import("@shared").AddVendorStaffRequest>(`/vendor/tenant/${tenantSlug}/staff`, {
    method: "POST",
    token,
    body
  });
}

export function updateStaff(token: string, tenantSlug: string, memberId: string, body: import("@shared").UpdateVendorStaffRequest) {
  return apiRequest<{ userId: string }, import("@shared").UpdateVendorStaffRequest>(
    `/vendor/tenant/${tenantSlug}/staff/${memberId}`,
    { method: "PATCH", token, body }
  );
}

export function removeStaff(token: string, tenantSlug: string, memberId: string) {
  return apiRequest<void>(`/vendor/tenant/${tenantSlug}/staff/${memberId}`, { method: "DELETE", token });
}

export function updateLocation(token: string, tenantSlug: string, locationSlug: string, body: { isActive: boolean } | Record<string, unknown>) {
  return apiRequest<{ location: import("@shared").StoreLocationWithHours }, typeof body>(
    `/vendor/tenant/${tenantSlug}/locations/${locationSlug}`,
    { method: "PATCH", token, body }
  );
}

export function saveLocation(
  token: string,
  tenantSlug: string,
  locationSlug: string | null,
  body: Record<string, unknown>
) {
  const path = locationSlug
    ? `/vendor/tenant/${tenantSlug}/locations/${locationSlug}`
    : `/vendor/tenant/${tenantSlug}/locations`;
  const method = locationSlug ? "PATCH" : "POST";
  return apiRequest<{ location: import("@shared").StoreLocationWithHours }, typeof body>(path, {
    method,
    token,
    body
  });
}

export function saveLocationHours(token: string, tenantSlug: string, locationSlug: string, hours: import("@shared").StoreHourSummary[]) {
  return apiRequest<{ location: import("@shared").StoreLocationWithHours }, { hours: import("@shared").StoreHourSummary[] }>(
    `/vendor/tenant/${tenantSlug}/locations/${locationSlug}/hours`,
    { method: "PATCH", token, body: { hours } }
  );
}

export function pauseQueueDay(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<VendorDashboardActionResponse, { reason: string }>(
    `/vendor/tenant/${tenantSlug}/queue/pause${locationQuery}`,
    { method: "POST", token, body: { reason: "Paused from vendor dashboard" } }
  );
}

export function resumeQueueDay(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<VendorDashboardActionResponse>(
    `/vendor/tenant/${tenantSlug}/queue/resume${locationQuery}`,
    { method: "POST", token }
  );
}

export function closeQueueDay(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<VendorDashboardActionResponse, { reason: string }>(
    `/vendor/tenant/${tenantSlug}/queue/close${locationQuery}`,
    { method: "POST", token, body: { reason: "Closed from vendor dashboard" } }
  );
}

export function reopenQueueDay(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<VendorDashboardActionResponse>(
    `/vendor/tenant/${tenantSlug}/queue/reopen${locationQuery}`,
    { method: "POST", token }
  );
}

export function callNextTicket(token: string, tenantSlug: string, locationQuery: string, counterSlug: string) {
  return apiRequest<VendorDashboardActionResponse>(
    `/vendor/tenant/${tenantSlug}/queue/call-next${locationQuery}`,
    { method: "POST", token, body: { counterSlug } }
  );
}

export function serveCurrentTicket(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<VendorDashboardActionResponse>(
    `/vendor/tenant/${tenantSlug}/queue/current/serve${locationQuery}`,
    { method: "POST", token }
  );
}

export function skipCurrentTicket(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<VendorDashboardActionResponse>(
    `/vendor/tenant/${tenantSlug}/queue/current/skip${locationQuery}`,
    { method: "POST", token }
  );
}

export function restoreSkippedTicket(
  token: string,
  tenantSlug: string,
  ticketId: string,
  locationQuery: string,
  lookupCode: string
) {
  return apiRequest<VendorDashboardActionResponse, { lookupCode: string }>(
    `/vendor/tenant/${tenantSlug}/queue/tickets/${ticketId}/restore${locationQuery}`,
    { method: "POST", token, body: { lookupCode } }
  );
}
