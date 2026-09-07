import { apiRequest } from "./client";

export interface PushVapidKeyResponse {
  publicKey: string;
  configured: boolean;
}

export interface PushSubscriptionRecord {
  _id: string;
  userId: string;
  tenantId: string | null;
  endpoint: string;
  userAgent: string;
  isActive: boolean;
}

export interface SavePushSubscriptionRequest {
  tenantSlug?: string;
  subscription: PushSubscriptionJSON;
}

export function getVapidPublicKey() {
  return apiRequest<PushVapidKeyResponse>("/push/vapid-public-key");
}

export function savePushSubscription(token: string, body: SavePushSubscriptionRequest) {
  return apiRequest<{ subscription: PushSubscriptionRecord }, SavePushSubscriptionRequest>(
    "/account/push-subscriptions",
    { method: "POST", token, body }
  );
}

export function deletePushSubscription(token: string, subscriptionId: string) {
  return apiRequest<{ subscription: PushSubscriptionRecord }>(
    `/account/push-subscriptions/${subscriptionId}`,
    { method: "DELETE", token }
  );
}
