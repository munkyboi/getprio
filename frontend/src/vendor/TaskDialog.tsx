import { TaskDialogBody } from "./TaskDialogBody";
import { scrollTaskControlIntoView } from "./taskDialogFocus";
import { cn } from "cn";
import { Button } from "./components/ui/button";
import { useCallback, useRef, type ReactNode, type RefObject } from "react";
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
  eyebrow?: string;
  headingEyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer: ReactNode;
  bodyOverlay?: ReactNode;
  className?: string;
  initialFocus?: RefObject<HTMLElement | null>;
};
export function TaskDialog({
  opened,
  onClose,
  busy = false,
  title,
  headingEyebrow,
  description,
  children,
  footer,
  bodyOverlay,
  className,
  initialFocus,
}: Props) {
  const stopFocusObserver = useRef<(() => void) | null>(null);
  const mainRef = useCallback((main: HTMLDivElement | null) => {
    stopFocusObserver.current?.();
    stopFocusObserver.current = null;
    if (!main) return;
    const revealActive = () => {
      const control = main.ownerDocument.activeElement;
      if (control instanceof HTMLElement)
        scrollTaskControlIntoView(main, control);
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(revealActive);
    observer?.observe(main);
    for (const child of main.children) observer?.observe(child);
    window.addEventListener("resize", revealActive);
    window.visualViewport?.addEventListener("resize", revealActive);
    stopFocusObserver.current = () => {
      observer?.disconnect();
      window.removeEventListener("resize", revealActive);
      window.visualViewport?.removeEventListener("resize", revealActive);
    };
  }, []);
  const main = (
        <div
          ref={mainRef}
          className="queue-dialog-main"
          onFocusCapture={(event) => {
            const main = event.currentTarget,
              control = event.target;
            if (!(control instanceof HTMLElement)) return;
            queueMicrotask(() => {
              if (document.activeElement === control)
                scrollTaskControlIntoView(main, control);
            });
          }}
        >
          {children}
        </div>
  );
  return (
    <Dialog
      open={opened}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      disablePointerDismissal={busy}
    >
      <DialogContent
        initialFocus={initialFocus}
        showCloseButton={!busy}
        className={cn("queue-task-dialog", className)}
      >
        <DialogHeader className="queue-dialog-header">
          <DialogTitle>
            {headingEyebrow ? <span className="vendor-eyebrow">{headingEyebrow}</span> : null}
            <span className="queue-dialog-title">{title}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription
          className={description ? "queue-dialog-guidance" : "v:sr-only"}
        >
          {description || "Review the details and choose an action."}
        </DialogDescription>
        {bodyOverlay !== undefined ? <TaskDialogBody overlay={bodyOverlay}>{main}</TaskDialogBody> : main}
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
  eyebrow = "QUEUE ACTION",
  error,
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
  eyebrow?: string;
  error?: string;
}) {
  return (
    <TaskDialog
      opened={opened}
      onClose={onClose}
      busy={loading}
      eyebrow={eyebrow}
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
      {error ? <p role="alert">{error}</p> : null}
    </TaskDialog>
  );
}
