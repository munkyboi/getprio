import type { CreateWalkInTicketRequest, TicketStatus } from "@shared";
import { apiRequest } from "./client";

type VendorDashboardActionResponse = {
  message?: string;
  snapshot?: import("@shared").QueueSnapshot;
};

export function createWalkInTicket(token: string, tenantSlug: string, locationQuery: string, body: CreateWalkInTicketRequest) {
  return apiRequest<
    { ticket: { id: string; ticketNumber: string; lookupCode: string; status: TicketStatus }; snapshot?: import("@shared").QueueSnapshot },
    CreateWalkInTicketRequest
  >(`/vendor/tenant/${tenantSlug}/tickets${locationQuery}`, { method: "POST", token, body });
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
