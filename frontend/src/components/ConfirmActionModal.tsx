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
      className={className}
      centered
      opened={opened}
      onClose={onClose}
      title={title}
      zIndex={1100}
      overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
    >
      <Stack gap="md">
        <Text c="dimmed">{description}</Text>
        <Group justify="space-between">
          <Button variant="default" onClick={onClose}>
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
