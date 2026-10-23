import { apiRequest } from "./client";
import { queuePlanBase } from "./queuePlansV2";
import type {
  QueueNamedAvailabilityRequestV1,
  QueueNamedAvailabilityResponseV1,
  QueueSelectionDraftInputV4,
  QueueSelectionDraftV4,
  QueuePublishedSelectionPlanV4,
  QueueSelectionOptionsV4,
  QueueSelectionPlanV4,
} from "../../../shared/queueSelectionPlanV4";

export async function getQueueSelectionOptionsV4(
  token: string,
  tenant: string,
  location: string,
  signal?: AbortSignal,
) {
  const clientRequestStartedAt = performance.now();
  const response = await apiRequest<QueueSelectionOptionsV4>(
    `/vendor/tenant/${encodeURIComponent(tenant)}/queue/selection-options?location=${encodeURIComponent(location)}&contractVersion=4`,
    { token, signal },
  );
  return { ...response, clientRequestStartedAt };
}
export async function listQueueSelectionsV4(
  token: string,
  tenant: string,
  location: string,
  state: "draft" | "active",
  signal?: AbortSignal,
  cursor?: string,
) {
  const response = await apiRequest<{
    plans: QueueSelectionPlanV4[];
    nextCursor: string | null;
  }>(
    `${queuePlanBase(tenant, location)}&state=${state}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    { token, signal },
  );
  return {
    ...response,
    plans: response.plans.filter((plan) => plan.contractVersion === 4),
  };
}
export function readQueueSelectionV4(
  token: string,
  tenant: string,
  location: string,
  id: string,
) {
  return apiRequest<{ plan: QueueSelectionPlanV4 }>(
    queuePlanBase(tenant, location, id),
    { token },
  );
}
export function saveQueueSelectionV4(
  token: string,
  tenant: string,
  location: string,
  id: string | null,
  body: QueueSelectionDraftInputV4 & { expectedPlanRevision?: string },
  key: string,
) {
  return apiRequest<{ plan: QueueSelectionDraftV4 }>(
    queuePlanBase(tenant, location, id || undefined),
    {
      method: id ? "PATCH" : "POST",
      token,
      body,
      headers: { "Idempotency-Key": key },
    },
  );
}
export function commandQueueSelectionV4(
  token: string,
  tenant: string,
  location: string,
  id: string,
  action:
    | "publish"
    | "call"
    | "start"
    | "complete"
    | "interrupt"
    | "retry"
    | "amend"
    | "cancelProtection",
  body: object,
  key: string,
) {
  return apiRequest<{ plan: QueuePublishedSelectionPlanV4 }>(
    `/vendor/tenant/${encodeURIComponent(tenant)}/queue/plans/${encodeURIComponent(id)}/${action}?location=${encodeURIComponent(location)}`,
    { method: "POST", token, body, headers: { "Idempotency-Key": key } },
  );
}

/** Read-only interval preview through the normal authenticated/CSRF request path. */
export function previewQueueNamedAvailability(token: string, tenant: string, location: string, body: QueueNamedAvailabilityRequestV1, signal?: AbortSignal) {
  return apiRequest<QueueNamedAvailabilityResponseV1>(`/vendor/tenant/${encodeURIComponent(tenant)}/queue/named-resource-availability?location=${encodeURIComponent(location)}`, {method: "POST", token, body, signal});
}
