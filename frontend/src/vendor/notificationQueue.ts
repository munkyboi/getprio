import type { ReactNode } from "react";
import type { ToastManagerAddOptions } from "@base-ui/react/toast";
export type VendorNotification = {
  id?: string; color?: string; icon?: ReactNode; title?: ReactNode;
  message: ReactNode; autoClose?: number | false;
};

/** Overflow starts its display timer only when a visible slot is available. */
export function createVendorNotificationQueue(add: (options: ToastManagerAddOptions<{icon?: ReactNode}>) => string) {
  const known = new Set<string>();
  const active = new Set<string>();
  const pending: Array<VendorNotification & {id: string}> = [];
  let sequence = 0;
  let disposed = false;
  // Initial effect emissions wait until StrictMode provider replay has settled.
  function scheduleDrain() { queueMicrotask(drain); }
  function drain() {
    while (!disposed && active.size < 5 && pending.length) {
      const item = pending.shift()!;
      active.add(item.id);
      add({ id: item.id, title: item.title, description: item.message,
        type: item.color === "red" ? "error" : item.color === "teal" ? "success" : item.color === "yellow" ? "warning" : "info",
        priority: item.color === "red" ? "high" : "low",
        timeout: item.autoClose === false ? 0 : item.autoClose,
        data: { icon: item.icon },
        // Base UI completes removal after this callback; enqueue after that mutation.
        onRemove: () => { active.delete(item.id); known.delete(item.id); scheduleDrain(); },
      });
    }
  }
  return {
    show(item: VendorNotification) {
      const id = item.id || `vendor-toast-${++sequence}`;
      if (disposed || known.has(id)) return id;
      known.add(id);
      pending.push({...item, id});
      scheduleDrain();
      return id;
    },
    // React effect replay must retain active IDs and queued messages.
    activate() { disposed = false; scheduleDrain(); },
    dispose() { disposed = true; },
  };
}
