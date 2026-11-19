import { queueReadRequest } from "./queueReadRequest";
import { localPoolPreviewEnabled } from "./localPreviewEligibility";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { resourceDashboardModel, type VendorResourceOperations } from "./resourceDashboardModel";

export const localPoolDemoClientEnabled = localPoolPreviewEnabled;

export function useLocalPoolOperations(token: string | null, tenantSlug: string, locationSlug: string, enabled: boolean) {
  return useQuery({
    queryKey: ["local-pool-operations", token, tenantSlug, locationSlug],
    enabled: Boolean(enabled && token && tenantSlug && locationSlug),
    queryFn: async ({signal}) => {
      const data = await queueReadRequest<VendorResourceOperations>(`/vendor/tenant/${encodeURIComponent(tenantSlug)}/locations/${encodeURIComponent(locationSlug)}/resource-operations/snapshot`, {token: token || "",signal});
      resourceDashboardModel(data, {tenantSlug, locationSlug, tenantId:data.scope?.tenantId, locationId:data.scope?.locationId});
      return data;
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: query => query.state.error instanceof ApiError && [404,429].includes(query.state.error.status) ? false : 10000,
  });
}
