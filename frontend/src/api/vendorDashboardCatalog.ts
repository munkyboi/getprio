import type {
  SaveServiceCounterRequest,
  SaveVendorAvailabilityBlockRequest,
  SaveVendorAvailabilityExceptionRequest,
  SaveVendorServiceRequest,
  ServiceCountersResponse,
  VendorAvailabilityBlockResponse,
  VendorAvailabilityExceptionResponse,
  VendorAvailabilityResponse,
  VendorServiceResponse
} from "@shared";
import { apiRequest } from "./client";

export function getServices(token: string, tenantSlug: string) {
  return apiRequest<import("@shared").VendorServicesResponse>(`/vendor/tenant/${tenantSlug}/services`, { token });
}

export function checkServiceSlugAvailability(token: string, tenantSlug: string, serviceSlug: string, excludeServiceId?: string) {
  const params = new URLSearchParams({ serviceSlug });
  if (excludeServiceId) {
    params.set("excludeServiceId", excludeServiceId);
  }
  return apiRequest<{ serviceSlug: string; available: boolean; valid: boolean; message: string }>(
    `/vendor/tenant/${tenantSlug}/services/slug-availability?${params.toString()}`,
    { token }
  );
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
