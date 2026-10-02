import type { BillingOverviewResponse, QueueSnapshot, StoreLocationsResponse, TenantNotificationSettings } from "@shared";
import { apiRequest } from "./client";

export interface VendorCapacityResource {
  limit: number;
  used: number;
  creditRemaining: number;
  resetAt: string | null;
}

export interface VendorCapacitySummary {
  planSlug: string | null;
  lifecycleState: string;
  resources: Record<string, VendorCapacityResource>;
}

export interface VendorCapacityExperience {
  enabled: boolean;
  capacity: VendorCapacitySummary | null;
}

export async function getBootstrap(
  token: string,
  tenantSlug: string,
  locationQuery: string,
  includeNotificationSettings = true
) {
  const locationsResponse = await apiRequest<StoreLocationsResponse>(`/vendor/tenant/${tenantSlug}/locations`, { token });
  const requestedSlug = new URLSearchParams(locationQuery.replace(/^\?/, "")).get("location");
  const selectedLocation = locationsResponse.locations.find((location) => location.slug === requestedSlug)
    || locationsResponse.locations.find((location) => location.isPrimary)
    || locationsResponse.locations[0];
  if (!selectedLocation) throw new Error("No assigned location is available. Ask your vendor administrator to assign a location.");
  const scopedQuery = `?location=${encodeURIComponent(selectedLocation.slug)}`;
  const [snapshotResponse, notificationSettingsResponse] = await Promise.all([
    apiRequest<QueueSnapshot>(`/vendor/tenant/${tenantSlug}/dashboard${scopedQuery}`, { token }),
    includeNotificationSettings
      ? apiRequest<{ notificationSettings: TenantNotificationSettings }>(`/vendor/tenant/${tenantSlug}/notification-settings`, { token })
      : Promise.resolve({ notificationSettings: { queueJoin: true, bookingIntake: true, paymentProofReview: true, bookingStatusChanges: true } })
  ]);
  return { locationsResponse, snapshotResponse, notificationSettings: notificationSettingsResponse.notificationSettings };
}

export function getBillingOverview(token: string, tenantSlug: string) {
  return apiRequest<BillingOverviewResponse>(`/billing/tenant/${tenantSlug}/subscription`, { token });
}

export function getEffectiveEntitlements(token: string, tenantSlug: string) {
  return apiRequest<{
    entitlements: BillingOverviewResponse["plans"][number]["entitlements"];
    plan?: { planName: string | null; planSlug: string | null; subscriptionStatus: string | null };
  }>(
    `/vendor/tenant/${tenantSlug}/entitlements`,
    { token }
  );
}

export async function getCapacityExperience(
  token: string,
  tenantSlug: string
): Promise<VendorCapacityExperience> {
  const capabilities = await apiRequest<{ vendorCapacityExperience: boolean }>(
    "/billing/capabilities",
    { token }
  );

  if (!capabilities.vendorCapacityExperience) {
    return { enabled: false, capacity: null };
  }

  const response = await apiRequest<{ capacity: VendorCapacitySummary }>(
    `/billing/tenant/${tenantSlug}/capacity`,
    { token }
  );
  return { enabled: true, capacity: response.capacity };
}
