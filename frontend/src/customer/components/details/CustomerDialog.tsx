import type { ReactNode } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription } from "../shadcn/dialog";
import { X } from "lucide-react";
import { Button } from "../ui";
/** Compact confirmations and QR passes stay dialogs rather than task drawers. */
export function CustomerDialog({
  title,
  description,
  open,
  onOpenChange,
  children,
  footer,
  busy = false,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  children?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
        <DialogContent showCloseButton={false} className="customer-compact-dialog">
          <header>
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : null}
            </div>
            <DialogClose
              disabled={busy}
              render={
                <Button variant="ghost" size="icon" aria-label="Close dialog" />
              }
            >
              <X />
            </DialogClose>
          </header>
          {children ? (
            <div className="customer-dialog-body">{children}</div>
          ) : null}
          {footer ? (
            <footer className="customer-drawer-footer">{footer}</footer>
          ) : null}
        </DialogContent>
    </Dialog>
  );
}
