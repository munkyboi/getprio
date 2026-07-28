import { Button, Group, Modal, Stack, Text } from "@mantine/core";

export function ConfirmActionModal({
  opened,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep editing",
  confirmColor = "red",
  loading = false,
  onConfirm,
  onClose,
  className
}: {
  opened: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmColor?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <Modal
      className={["task-modal", "confirm-action-modal", className].filter(Boolean).join(" ")}
      centered
      opened={opened}
      onClose={onClose}
      title={title}
      zIndex={1100}
      overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
    >
      <Stack className="task-modal__shell" gap="md">
        <Text className="task-modal__main" c="dimmed">{description}</Text>
        <Group className="task-modal__footer" justify="flex-end">
          <Button className="task-modal__cancel" variant="default" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button color={confirmColor} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
