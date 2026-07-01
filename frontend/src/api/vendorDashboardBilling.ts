import type { CheckoutSyncResponse } from "@shared";
import { apiRequest } from "./client";

export function syncCheckout(token: string, tenantSlug: string, checkoutId: string) {
  return apiRequest<CheckoutSyncResponse>(`/billing/tenant/${tenantSlug}/checkout/${checkoutId}/sync`, {
    method: "POST",
    token
  });
}

export function startCheckout(token: string, tenantSlug: string, body: import("@shared").CreateCheckoutRequest) {
  return apiRequest<import("@shared").CheckoutSessionResponse, import("@shared").CreateCheckoutRequest>(
    `/billing/tenant/${tenantSlug}/checkout`,
    { method: "POST", token, body }
  );
}
