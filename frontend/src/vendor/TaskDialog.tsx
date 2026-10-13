import { Button } from "./components/ui/button";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";

type Props = {
  opened: boolean;
  onClose: () => void;
  busy?: boolean;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
};
export function TaskDialog({
  opened,
  onClose,
  busy = false,
  eyebrow,
  title,
  description,
  children,
  footer,
}: Props) {
  return (
    <Dialog
      open={opened}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      disablePointerDismissal={busy}
    >
      <DialogContent showCloseButton={!busy} className="queue-task-dialog">
        <DialogHeader className="queue-dialog-header">
          <DialogTitle>
            <span className="vendor-eyebrow">{eyebrow}</span>
            <span className="queue-dialog-title">{title}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription
          className={description ? "queue-dialog-guidance" : "v:sr-only"}
        >
          {description || "Review the details and choose an action."}
        </DialogDescription>
        <div className="queue-dialog-main">{children}</div>
        <div className="queue-dialog-footer">{footer}</div>
      </DialogContent>
    </Dialog>
  );
}
export function QueueConfirmation({
  opened,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmColor = "red",
  loading = false,
  onConfirm,
  onClose,
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
}) {
  return (
    <TaskDialog
      opened={opened}
      onClose={onClose}
      busy={loading}
      eyebrow="QUEUE ACTION"
      title={title}
      footer={
        <>
          <Button variant="outline" disabled={loading} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmColor === "red" ? "destructive" : "default"}
            disabled={loading}
            aria-busy={loading}
            onClick={onConfirm}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <p>{description}</p>
    </TaskDialog>
  );
}
