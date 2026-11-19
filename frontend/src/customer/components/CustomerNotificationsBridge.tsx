import { Toaster } from "./shadcn/toast";
import { customerToastManager } from "./customerNotifications";

/** Customer notifications use the shadcn toast manager directly. */
export function CustomerNotificationsBridge() {
  return <Toaster toastManager={customerToastManager} limit={4} />;
}
