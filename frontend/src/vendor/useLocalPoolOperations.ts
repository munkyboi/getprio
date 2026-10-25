import { queueReadRequest } from "./queueReadRequest";
import { localPoolPreviewEnabled } from "./localPreviewEligibility";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import type { LocalResourceOperations } from "../../../shared/localPoolDemo";

export const localPoolDemoClientEnabled = localPoolPreviewEnabled;

export function useLocalPoolOperations(token: string | null, tenantSlug: string, locationSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["local-pool-operations", token, tenantSlug, locationSlug],
    enabled: Boolean(localPoolDemoClientEnabled && enabled && token && tenantSlug && locationSlug),
    queryFn: async ({signal}) => {
      const data = await queueReadRequest<LocalResourceOperations>(`/vendor/tenant/${encodeURIComponent(tenantSlug)}/locations/${encodeURIComponent(locationSlug)}/resource-operations`, {token: token || "",signal});
      if (data.contractVersion !== "local-resource-operations-v1" || data.localDemo !== true) throw new Error("Local pool operations are unavailable.");
      return data;
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: query => query.state.error instanceof ApiError && [404,429].includes(query.state.error.status) ? false : 10000,
  });
}
