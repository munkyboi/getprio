import {
  getVapidPublicKey,
  savePushSubscription,
  type PushSubscriptionRecord
} from "../api/pushNotifications";

export function isBrowserPushSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

export async function subscribeToBrowserPush(options: {
  token: string;
  tenantSlug?: string;
}): Promise<{
  permission: NotificationPermission;
  subscription: PushSubscriptionRecord;
}> {
  if (!isBrowserPushSupported()) {
    throw new Error("This browser does not support Web Push notifications.");
  }

  if (!window.isSecureContext) {
    throw new Error("Web Push notifications require https:// or localhost.");
  }

  const permission =
    window.Notification.permission === "granted"
      ? "granted"
      : await window.Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Browser notification permission was not granted.");
  }

  const vapid = await getVapidPublicKey();
  if (!vapid.configured || !vapid.publicKey) {
    throw new Error("Web Push is not configured on this server yet.");
  }

  const registration = await navigator.serviceWorker.register("/service-worker.js");
  const readyRegistration = await navigator.serviceWorker.ready;
  const existingSubscription = await readyRegistration.pushManager.getSubscription();
  const browserSubscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey)
    }));

  const response = await savePushSubscription(options.token, {
    tenantSlug: options.tenantSlug,
    subscription: browserSubscription.toJSON()
  });

  return {
    permission,
    subscription: response.subscription
  };
}
