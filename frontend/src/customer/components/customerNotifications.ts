import type { ReactNode } from "react";
import { createToastManager } from "./shadcn/toast";

const manager = createToastManager();
let sequence = 0;

type CustomerNotification = {
  id?: string;
  title?: ReactNode;
  message?: ReactNode;
  color?: string;
  icon?: ReactNode;
  autoClose?: boolean | number;
  loading?: boolean;
  withCloseButton?: boolean;
};

function toastType(color?: string, loading?: boolean) {
  if (loading) return "loading" as const;
  if (color === "red") return "error" as const;
  if (color === "green" || color === "teal") return "success" as const;
  if (color === "yellow" || color === "orange") return "warning" as const;
  return "info" as const;
}

export const customerToastManager = manager;

export const customerNotifications = {
  show(options: CustomerNotification) {
    const id = options.id || `customer-toast-${++sequence}`;
    manager.add({
      id,
      title: options.title,
      description: options.message,
      type: toastType(options.color, options.loading),
      timeout: options.loading || options.autoClose === false
        ? 0
        : typeof options.autoClose === "number"
          ? options.autoClose
          : 4000,
      data: {
        icon: options.icon,
        withCloseButton: options.withCloseButton !== false,
      },
    });
    return id;
  },
  hide(id: string) {
    manager.close(id);
  },
};
