import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetDescription } from "../shadcn/sheet";
import { X as IconX } from "lucide-react";
import { Button } from "../ui";
export function ControlledDrawer({
  title,
  description,
  open,
  onOpenChange,
  children,
  footer,
  busy = false,
  containFocus = false,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  containFocus?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!containFocus || event.key !== "Tab") return;
    const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.getClientRects().length > 0 && !element.closest("[inert], [hidden], [aria-hidden='true']"));
    if (!elements.length) { event.preventDefault(); event.currentTarget.focus(); return; }
    const index = elements.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); elements[elements.length - 1].focus(); }
    else if (!event.shiftKey && (index === -1 || index === elements.length - 1)) { event.preventDefault(); elements[0].focus(); }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
        <SheetContent showCloseButton={false} className="customer-vendor-drawer" initialFocus={containFocus ? closeRef : undefined} onKeyDown={handleKeyDown}>
          <header>
            <div>
              <SheetTitle>{title}</SheetTitle>
              {description ? (
                <SheetDescription>{description}</SheetDescription>
              ) : null}
            </div>
            <SheetClose
              disabled={busy}
              render={
                <Button ref={closeRef} variant="ghost" size="icon" aria-label="Close drawer" />
              }
            >
              <IconX />
            </SheetClose>
          </header>
          <div className="customer-drawer-body">{children}</div>
          {footer ? (
            <footer className="customer-drawer-footer">{footer}</footer>
          ) : null}
        </SheetContent>
    </Sheet>
  );
}
