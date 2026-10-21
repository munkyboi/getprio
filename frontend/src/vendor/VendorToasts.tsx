import { createVendorNotificationQueue } from "./notificationQueue";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toast, ToastClose, ToastContent, ToastDescription, ToastProvider, ToastTitle, ToastViewport, ToastPortal, useToastManager } from "./components/ui/toast";
import { notifications as customerNotifications } from "@mantine/notifications";
import { VendorPortal } from "./portal";
import { Button } from "./components/ui/button";

const NotificationContext = createContext<ReturnType<typeof createVendorNotificationQueue> | null>(null);

export function VendorToastProvider({ children }: { children: ReactNode }) {
  return <ToastProvider timeout={4000} limit={5}><NotificationBridge>{children}</NotificationBridge></ToastProvider>;
}

function NotificationBridge({ children }: { children: ReactNode }) {
  const { add } = useToastManager();
  const notifications = useMemo(() => createVendorNotificationQueue(add), [add]);
  useEffect(() => { notifications.activate(); return () => notifications.dispose(); }, [notifications]);
  return <NotificationContext.Provider value={notifications}>{children}</NotificationContext.Provider>;
}

export function useVendorNotifications() {
  const notifications = useContext(NotificationContext);
  if (!notifications) throw new Error("Vendor notifications require a scoped provider.");
  return notifications;
}

export function useScopedNotifications() {
  return useContext(NotificationContext) || customerNotifications;
}

export function VendorToastViewport() {
  const { toasts } = useToastManager<{ icon?: ReactNode }>();
  const container = useContext(VendorPortal);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalContainer(container?.current || null); }, [container]);
  return <ToastPortal container={portalContainer}><ToastViewport className="vendor-toast-viewport" aria-label="Dashboard notifications">
    {toasts.map(item => <Toast key={item.id} toast={item} className="vendor-toast">
      <ToastContent className="vendor-toast-content">
        {item.data?.icon ? <span aria-hidden>{item.data.icon}</span> : null}
        <div className="vendor-toast-message"><ToastTitle /><ToastDescription /></div>
        <ToastClose aria-label="Dismiss notification" render={<Button variant="ghost" size="icon" />} />
      </ToastContent>
    </Toast>)}
  </ToastViewport></ToastPortal>;
}
