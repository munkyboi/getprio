import { createElement } from "react";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCircleCheck } from "@tabler/icons-react";

export function showCustomerSuccess(title: string, message: string) {
  notifications.show({
    className: "getprio-notification getprio-notification--success",
    color: "teal",
    icon: createElement(IconCircleCheck, { size: 20 }),
    title,
    message
  });
}

export function showCustomerError(message: string, title = "Could not complete that action") {
  notifications.show({
    className: "getprio-notification getprio-notification--error",
    color: "red",
    icon: createElement(IconAlertCircle, { size: 20 }),
    title,
    message
  });
}
