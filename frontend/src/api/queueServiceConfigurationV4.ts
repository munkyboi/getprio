import { apiRequest } from "./client";
import type {
  QueueServiceConfigurationResponseV4,
  QueueServiceConfigurationWriteV4,
  QueueServiceConfigurationWriteResponseV4,
} from "../../../shared/queueSelectionPlanV4";

function configurationUrl(tenant: string, location: string, serviceId: string) {
  return `/vendor/tenant/${encodeURIComponent(tenant)}/queue/service-policies/${encodeURIComponent(serviceId)}/configuration?location=${encodeURIComponent(location)}`;
}

export function getQueueServiceConfiguration(
  token: string,
  tenant: string,
  location: string,
  serviceId: string,
  signal?: AbortSignal,
) {
  return apiRequest<QueueServiceConfigurationResponseV4>(
    configurationUrl(tenant, location, serviceId),
    { token, signal },
  );
}

/** Callers retain the same body/key after an unknown result; edits require a new command. */
export function saveQueueServiceConfiguration(
  token: string,
  tenant: string,
  location: string,
  serviceId: string,
  body: QueueServiceConfigurationWriteV4,
  key: string,
) {
  return apiRequest<QueueServiceConfigurationWriteResponseV4>(
    configurationUrl(tenant, location, serviceId),
    {
      method: "PUT",
      token,
      body,
      headers: { "Idempotency-Key": key },
    },
  );
}
