import { API_BASE_URL, apiRequest } from "./client";
import type {
  BillingOverviewResponse,
  CheckoutSyncResponse,
  QueueSnapshot,
  PublicBoardThemeResponse,
  StoreLocationsResponse,
  TenantNotificationSettings,
  VendorBookingsResponse,
  VendorClientsResponse,
  VendorServicesResponse,
  VendorStaffResponse,
  ServiceCountersResponse,
  VendorAvailabilityResponse
} from "@shared";

type VendorDashboardHistoryResponse = {
  historyDays?: number;
  historyLabel?: string;
  tickets: import("@shared").QueueHistoryTicket[];
};

export function getBootstrap(token: string, tenantSlug: string, locationQuery: string) {
  return Promise.all([
    apiRequest<StoreLocationsResponse>(`/vendor/tenant/${tenantSlug}/locations`, { token }),
    apiRequest<QueueSnapshot>(`/vendor/tenant/${tenantSlug}/dashboard${locationQuery}`, { token }),
    apiRequest<BillingOverviewResponse>(`/billing/tenant/${tenantSlug}/subscription`, { token }),
    apiRequest<{ notificationSettings: TenantNotificationSettings }>(`/vendor/tenant/${tenantSlug}/notification-settings`, {
      token
    })
  ]).then(([locationsResponse, snapshotResponse, billingResponse, notificationSettingsResponse]) => ({
    locationsResponse,
    snapshotResponse,
    billingResponse,
    notificationSettings: notificationSettingsResponse.notificationSettings
  }));
}

export function getStaff(token: string, tenantSlug: string) {
  return apiRequest<VendorStaffResponse>(`/vendor/tenant/${tenantSlug}/staff`, { token });
}

export function getServices(token: string, tenantSlug: string) {
  return apiRequest<VendorServicesResponse>(`/vendor/tenant/${tenantSlug}/services`, { token });
}

export function getAvailability(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<VendorAvailabilityResponse>(
    `/vendor/tenant/${tenantSlug}/availability?location=${encodeURIComponent(locationSlug)}`,
    { token }
  );
}

export function getCounters(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<ServiceCountersResponse>(
    `/vendor/tenant/${tenantSlug}/counters?location=${encodeURIComponent(locationSlug)}`,
    { token }
  );
}

export function getHistory(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<VendorDashboardHistoryResponse>(
    `/vendor/tenant/${tenantSlug}/history?limit=50&location=${encodeURIComponent(locationSlug)}`,
    { token }
  );
}

export function getClients(token: string, tenantSlug: string, locationQuery: string) {
  return apiRequest<VendorClientsResponse>(`/vendor/tenant/${tenantSlug}/clients${locationQuery}`, { token });
}

export function getBookings(
  token: string,
  tenantSlug: string,
  locationSlug: string,
  page: number,
  search: string,
  status: string,
  date: string
) {
  const statusQuery = status !== "all" ? `&status=${encodeURIComponent(status)}` : "";
  const dateQuery = date ? `&scheduledDate=${encodeURIComponent(date)}` : "";
  const searchQuery = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
  return apiRequest<VendorBookingsResponse>(
    `/vendor/tenant/${tenantSlug}/bookings?page=${page}&pageSize=10&location=${encodeURIComponent(locationSlug)}${statusQuery}${dateQuery}${searchQuery}`,
    { token }
  );
}

export function getBookingAlerts(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<VendorBookingsResponse>(
    `/vendor/tenant/${tenantSlug}/bookings?page=1&pageSize=10&location=${encodeURIComponent(locationSlug)}&status=pending`,
    { token }
  );
}

export function syncCheckout(token: string, tenantSlug: string, checkoutId: string) {
  return apiRequest<CheckoutSyncResponse>(`/billing/tenant/${tenantSlug}/checkout/${checkoutId}/sync`, {
    method: "POST",
    token
  });
}

export function getTheme(token: string, tenantSlug: string, locationSlug: string) {
  return apiRequest<PublicBoardThemeResponse>(
    `/vendor/tenant/${tenantSlug}/public-board-theme?location=${encodeURIComponent(locationSlug)}`,
    { token }
  );
}

export function exportHistory(token: string, tenantSlug: string, locationSlug: string, range: string, format: "csv" | "pdf") {
  return fetch(
    `${API_BASE_URL}/vendor/tenant/${tenantSlug}/history/export?location=${encodeURIComponent(locationSlug)}&range=${encodeURIComponent(range)}&format=${encodeURIComponent(format)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
}
