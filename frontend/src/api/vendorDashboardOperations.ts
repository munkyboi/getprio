import type {
  AddVendorStaffRequest,
  CheckoutSyncResponse,
  SavePublicBoardThemeRequest,
  StoreLocationWithHours,
  StoreHourSummary,
  UpdateTenantSettingsRequest,
  UpdateTenantNotificationSettingsRequest,
  UpdateTenantNotificationSettingsResponse,
  UpdateVendorStaffRequest
} from "@shared";
import { API_BASE_URL, apiRequest } from "./client";

type VendorDashboardHistoryResponse = {
  historyDays?: number;
  historyLabel?: string;
  tickets: import("@shared").QueueHistoryTicket[];
};

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
  return apiRequest<import("@shared").PublicBoardThemeResponse>(
    `/vendor/tenant/${tenantSlug}/public-board-theme?location=${encodeURIComponent(locationSlug)}`,
    { token }
  );
}

export function saveTheme(token: string, tenantSlug: string, locationSlug: string, body: SavePublicBoardThemeRequest) {
  return apiRequest<import("@shared").PublicBoardThemeResponse, SavePublicBoardThemeRequest>(
    `/vendor/tenant/${tenantSlug}/public-board-theme?location=${encodeURIComponent(locationSlug)}`,
    { method: "PATCH", token, body }
  );
}

export function uploadThemeAsset(token: string, tenantSlug: string, locationSlug: string, assetType: "background" | "logo", file: File) {
  return fetch(
    `${API_BASE_URL}/vendor/tenant/${tenantSlug}/public-board-theme/uploads/direct?location=${encodeURIComponent(locationSlug)}&assetType=${encodeURIComponent(assetType)}&fileName=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type },
      body: file
    }
  ).then(async (response) => {
    if (!response.ok) throw new Error("Upload failed.");
    return (await response.json()) as import("@shared").PublicBoardThemeUploadResponse;
  });
}

export function uploadLocationPaymentQr(token: string, tenantSlug: string, locationSlug: string, file: File) {
  return fetch(
    `${API_BASE_URL}/vendor/tenant/${tenantSlug}/location-payment-qrs/uploads/direct?locationSlug=${encodeURIComponent(locationSlug)}&fileName=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type },
      body: file
    }
  ).then(async (response) => {
    if (!response.ok) throw new Error("Payment QR upload failed.");
    return (await response.json()) as import("@shared").LocationPaymentQrUploadResponse;
  });
}

async function uploadSignedAsset(uploadUrl: string, file: File, contentType: string) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: file
  });
  if (!response.ok) {
    throw new Error("Upload failed.");
  }
}

export async function uploadLocationMedia(token: string, tenantSlug: string, locationSlug: string, file: File) {
  const init = await apiRequest<import("@shared").PublicBoardThemeUploadResponse>(
    `/vendor/tenant/${tenantSlug}/location-media/uploads/direct?locationSlug=${encodeURIComponent(locationSlug)}&fileName=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      token,
      body: {
        locationSlug,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size
      }
    }
  );
  if (init.upload?.url) {
    await uploadSignedAsset(init.upload.url, file, file.type);
    return init;
  }
  throw new Error("Image upload failed.");
}

export async function uploadServiceMedia(token: string, tenantSlug: string, locationSlug: string, file: File) {
  const init = await apiRequest<import("@shared").PublicBoardThemeUploadResponse>(
    `/vendor/tenant/${tenantSlug}/service-media/uploads/direct?locationSlug=${encodeURIComponent(locationSlug)}&fileName=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      token,
      body: {
        locationSlug,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size
      }
    }
  );
  if (init.upload?.url) {
    await uploadSignedAsset(init.upload.url, file, file.type);
    return init;
  }
  throw new Error("Image upload failed.");
}
