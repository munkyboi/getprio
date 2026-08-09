import type { CheckoutSyncResponse } from "@shared";
import { apiRequest } from "./client";

export function syncCheckout(token: string, tenantSlug: string, checkoutId: string) {
  return apiRequest<CheckoutSyncResponse>(`/billing/tenant/${tenantSlug}/checkout/${checkoutId}/sync`, {
    method: "POST",
    token
  });
}

export async function startCheckout(token: string, tenantSlug: string, body: import("@shared").CreateCheckoutRequest) {
  const reason="Vendor started a verified paid-plan checkout"; const payload={planSlug:body.planSlug,billingInterval:body.billingInterval};
  const preview=await apiRequest<{confirmation:{token:string};preview:{revision:string}}>(`/billing/tenant/${tenantSlug}/commercial-actions/preview`,{method:"POST",token,body:{action:"subscription.checkout",reason,payload}});
  return apiRequest<import("@shared").CheckoutSessionResponse, typeof payload & {reason:string;previewRevision:string}>(
    `/billing/tenant/${tenantSlug}/checkout`,
    { method: "POST", token,headers:{"X-Transaction-Confirmation":preview.confirmation.token}, body:{...payload,reason,previewRevision:preview.preview.revision} }
  );
}
