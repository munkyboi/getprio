import type { BillingOverviewResponse, QueueSnapshot, StoreLocationsResponse, TenantNotificationSettings } from "@shared";
import { apiRequest } from "./client";

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
