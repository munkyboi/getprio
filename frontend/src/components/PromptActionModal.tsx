import { Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";

type PromptActionModalProps = {
  opened: boolean;
  eyebrow: string;
  title: string;
  description?: string;
  error?: string;
  label: string;
  placeholder?: string;
  value: string;
  confirmLabel: string;
  confirmColor?: string;
  loading?: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function PromptActionModal({
  opened,
  eyebrow,
  title,
  description,
  error,
  label,
  placeholder,
  value,
  confirmLabel,
  confirmColor,
  loading = false,
  maxLength,
  onChange,
  onClose,
  onConfirm
}: PromptActionModalProps) {
  const handleClose = () => {
    if (!loading) onClose();
  };

  return (
    <Modal
      centered
      className="task-modal prompt-action-modal"
      closeButtonProps={{ disabled: loading }}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      onClose={handleClose}
      opened={opened}
      overlayProps={{ blur: 6, backgroundOpacity: 0.35 }}
      size="md"
      title={(
        <Stack className="getprio-modal-title" gap={2}>
          <Text className="getprio-modal-eyebrow">{eyebrow}</Text>
          <Text className="getprio-modal-heading">{title}</Text>
        </Stack>
      )}
      zIndex={1200}
    >
      <Stack
        className="task-modal__shell"
        component="form"
        gap="md"
        aria-busy={loading}
        onSubmit={(event) => {
          event.preventDefault();
          if (!loading && value.trim()) onConfirm();
        }}
      >
        <Stack className="task-modal__main" gap="md">
          {description ? <Text c="dimmed" size="sm">{description}</Text> : null}
          <Textarea
            autosize
            data-autofocus
            disabled={loading}
            error={error}
            label={label}
            maxLength={maxLength}
            minRows={4}
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder={placeholder}
            required
            value={value}
          />
          {maxLength ? <Text c="dimmed" size="xs">{value.length}/{maxLength} characters</Text> : null}
        </Stack>
        <Group className="task-modal__footer" justify="flex-end">
          <Button className="task-modal__cancel" disabled={loading} onClick={handleClose} variant="default">Cancel</Button>
          <Button
            color={confirmColor}
            disabled={!value.trim()}
            loading={loading}
            type="submit"
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
