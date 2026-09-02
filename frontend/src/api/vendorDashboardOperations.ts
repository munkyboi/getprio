import type {
  AddVendorStaffRequest,
  CheckoutSyncResponse,
  CustomerProfileUpdateRequest,
  CustomerProfileUpdateResponse,
  SavePublicBoardThemeRequest,
  StoreLocationWithHours,
  StoreHourSummary,
  UpdateTenantSettingsRequest,
  UpdateTenantNotificationSettingsRequest,
  UpdateTenantNotificationSettingsResponse,
  UpdateVendorStaffRequest
} from "@shared";
import { apiRequest, apiUpload } from "./client";

type VendorDashboardHistoryResponse = {
  historyDays?: number;
  historyLabel?: string;
  tickets: import("@shared").QueueHistoryTicket[];
};

export function startMfaEnrollment(token: string, currentCode?: string) {
  return apiRequest<{ secret: string; otpAuthUri: string }, { currentCode?: string }>(
    "/auth/mfa/enrollment/start",
    { method: "POST", token, body: currentCode ? { currentCode } : {} }
  );
}

export function confirmMfaEnrollment(token: string, code: string) {
  return apiRequest<{ success: boolean; recoveryCodes: string[]; message: string }, { code: string }>(
    "/auth/mfa/enrollment/confirm",
    { method: "POST", token, body: { code } }
  );
}

export function cancelMfaEnrollment(token: string) {
  return apiRequest<{ success: boolean; canceled: boolean; message: string }>(
    "/auth/mfa/enrollment/cancel",
    { method: "POST", token }
  );
}

export function verifyMfaStepUp(token: string, password: string, code: string) {
  return apiRequest<{ success: boolean }, { password: string; code: string }>(
    "/auth/mfa/step-up",
    { method: "POST", token, body: { password, code } }
  );
}

export function disableMfa(token: string, password: string, code: string, recoveryCode: string) {
  return apiRequest<{ success: boolean; message: string }, { password: string; code: string; recoveryCode: string }>(
    "/auth/mfa/disable",
    { method: "POST", token, body: { password, code, recoveryCode } }
  );
}

export function updateAccountProfile(token: string, body: CustomerProfileUpdateRequest) {
  return apiRequest<CustomerProfileUpdateResponse, CustomerProfileUpdateRequest>(
    "/account/profile",
    { method: "PATCH", token, body }
  );
}

export function getHistory(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<VendorDashboardHistoryResponse>(
    `/vendor/tenant/${tenantSlug}/history?limit=50&location=${encodeURIComponent(locationSlug)}`,
    { token }
  );
}

export function getClients(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<import("@shared").VendorClientsResponse>(`/vendor/tenant/${tenantSlug}/clients${locationQuery}`, { token });
}

export function getStaff(token: string, tenantSlug: string) {
  return apiRequest<import("@shared").VendorStaffResponse>(`/vendor/tenant/${tenantSlug}/staff`, { token });
}

export function syncCheckout(token: string, tenantSlug: string, checkoutId: string) {
  return apiRequest<CheckoutSyncResponse>(`/billing/tenant/${tenantSlug}/checkout/${checkoutId}/sync`, {
    method: "POST",
    token
  });
}

export function updateSettings(token: string, tenantSlug: string, settings: UpdateTenantSettingsRequest) {
  return apiRequest<{ message?: string; snapshot?: import("@shared").QueueSnapshot }, UpdateTenantSettingsRequest>(
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

export function addStaff(token: string, tenantSlug: string, body: AddVendorStaffRequest) {
  return apiRequest<{ userId: string }, AddVendorStaffRequest>(`/vendor/tenant/${tenantSlug}/staff`, {
    method: "POST",
    token,
    body
  });
}

export function updateStaff(token: string, tenantSlug: string, memberId: string, body: UpdateVendorStaffRequest) {
  return apiRequest<{ userId: string }, UpdateVendorStaffRequest>(
    `/vendor/tenant/${tenantSlug}/staff/${memberId}`,
    { method: "PATCH", token, body }
  );
}

export function removeStaff(token: string, tenantSlug: string, memberId: string) {
  return apiRequest<void>(`/vendor/tenant/${tenantSlug}/staff/${memberId}`, { method: "DELETE", token });
}

export function updateLocation(token: string, tenantSlug: string, locationSlug: string, body: { isActive: boolean } | Record<string, unknown>) {
  return apiRequest<{ location: StoreLocationWithHours }, typeof body>(
    `/vendor/tenant/${tenantSlug}/locations/${locationSlug}`,
    { method: "PATCH", token, body }
  );
}

export function regenerateLocationQueueQr(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<{ location: StoreLocationWithHours }>(
    `/vendor/tenant/${tenantSlug}/locations/${locationSlug}/queue-join-id/regenerate`,
    { method: "POST", token }
  );
}

export function checkLocationSlugAvailability(
  token: string,
  tenantSlug: string,
  locationSlug: string,
  excludeLocationId?: string
) {
  const params = new URLSearchParams({ location: locationSlug });
  if (excludeLocationId) {
    params.set("excludeLocationId", excludeLocationId);
  }
  return apiRequest<{ locationSlug: string; available: boolean; valid: boolean; message: string }>(
    `/vendor/tenant/${tenantSlug}/locations/slug-availability?${params.toString()}`,
    { token }
  );
}

export function saveLocation(token: string, tenantSlug: string, locationSlug: string | null, body: Record<string, unknown>) {
  const path = locationSlug ? `/vendor/tenant/${tenantSlug}/locations/${locationSlug}` : `/vendor/tenant/${tenantSlug}/locations`;
  const method = locationSlug ? "PATCH" : "POST";
  return apiRequest<{ location: StoreLocationWithHours }, typeof body>(path, { method, token, body });
}

export function checkCounterSlugAvailability(
  token: string,
  tenantSlug: string,
  locationSlug: string,
  counterSlug: string,
  excludeCounterId?: string
) {
  const params = new URLSearchParams({ location: locationSlug, counterSlug });
  if (excludeCounterId) {
    params.set("excludeCounterId", excludeCounterId);
  }
  return apiRequest<{ counterSlug: string; available: boolean; valid: boolean; message: string }>(
    `/vendor/tenant/${tenantSlug}/counters/slug-availability?${params.toString()}`,
    { token }
  );
}

export function saveLocationHours(token: string, tenantSlug: string, locationSlug: string, hours: StoreHourSummary[]) {
  return apiRequest<{ location: StoreLocationWithHours }, { hours: StoreHourSummary[] }>(
    `/vendor/tenant/${tenantSlug}/locations/${locationSlug}/hours`,
    { method: "PATCH", token, body: { hours } }
  );
}

export function getTheme(token: string, tenantSlug: string, locationSlug: string) {
  const locationQuery = locationSlug ? `?location=${encodeURIComponent(locationSlug)}` : "";
  return apiRequest<import("@shared").PublicBoardThemeResponse>(
    `/vendor/tenant/${tenantSlug}/public-board-theme${locationQuery}`,
    { token }
  );
}

export function saveTheme(token: string, tenantSlug: string, locationSlug: string, body: SavePublicBoardThemeRequest) {
  const locationQuery = locationSlug ? `?location=${encodeURIComponent(locationSlug)}` : "";
  return apiRequest<import("@shared").PublicBoardThemeResponse, SavePublicBoardThemeRequest>(
    `/vendor/tenant/${tenantSlug}/public-board-theme${locationQuery}`,
    { method: "PATCH", token, body }
  );
}

export function uploadThemeAsset(token: string, tenantSlug: string, locationSlug: string, assetType: "background" | "logo", file: File) {
  const locationQuery = locationSlug ? `location=${encodeURIComponent(locationSlug)}&` : "";
  return apiUpload<import("@shared").PublicBoardThemeUploadResponse>(
    `/vendor/tenant/${tenantSlug}/public-board-theme/uploads/direct?${locationQuery}assetType=${encodeURIComponent(assetType)}&fileName=${encodeURIComponent(file.name)}`,
    { token, body: file, contentType: file.type }
  );
}

export function uploadLocationPaymentQr(token: string, tenantSlug: string, locationSlug: string, file: File) {
  return apiUpload<import("@shared").LocationPaymentQrUploadResponse>(
    `/vendor/tenant/${tenantSlug}/location-payment-qrs/uploads/direct?locationSlug=${encodeURIComponent(locationSlug)}&fileName=${encodeURIComponent(file.name)}`,
    { token, body: file, contentType: file.type }
  );
}

export async function uploadLocationMedia(token: string, tenantSlug: string, locationSlug: string, file: File) {
  return apiUpload<import("@shared").PublicBoardThemeUploadResponse>(
    `/vendor/tenant/${tenantSlug}/location-media/uploads/direct?locationSlug=${encodeURIComponent(locationSlug)}&fileName=${encodeURIComponent(file.name)}`,
    {
      token, body: file, contentType: file.type
    }
  );
}

export async function uploadServiceMedia(token: string, tenantSlug: string, locationSlug: string, file: File) {
  return apiUpload<import("@shared").PublicBoardThemeUploadResponse>(
    `/vendor/tenant/${tenantSlug}/service-media/uploads/direct?locationSlug=${encodeURIComponent(locationSlug)}&fileName=${encodeURIComponent(file.name)}`,
    {
      token, body: file, contentType: file.type
    }
  );
}
