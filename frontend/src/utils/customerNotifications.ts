import { notifications } from "@mantine/notifications";

export function showCustomerSuccess(title: string, message: string) {
  notifications.show({
    color: "teal",
    title,
    message
  });
}

export function showCustomerError(message: string, title = "Could not complete that action") {
  notifications.show({
    color: "red",
    title,
    message
  });
}
