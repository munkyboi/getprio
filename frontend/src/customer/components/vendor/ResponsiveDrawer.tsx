import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
const FooterTarget = createContext<HTMLDivElement | null>(null);
export function CustomerDrawerActions({ children }: { children: ReactNode }) {
  const target = useContext(FooterTarget);
  return target ? createPortal(children, target) : children;
}
import { Sheet, SheetTrigger, SheetClose, SheetContent, SheetTitle, SheetDescription } from "../shadcn/sheet";
import { X as IconX } from "lucide-react";
import { Button } from "../ui";

// One mounted dialog changes placement through CSS, preserving content on resize.
export function ResponsiveDrawer({
  title,
  open,
  onOpenChange,
  description,
  trigger,
  children,
  footer,
  busy = false,
  canClose,
  triggerVariant = "outline",
}: {
  title: string;
  open?: boolean;
  onOpenChange?: (value: boolean) => void;
  description?: string;
  trigger: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  canClose?: () => boolean;
  triggerVariant?: "outline" | "ghost";
}) {
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  return (
    <Sheet
      open={open}
      onOpenChange={(value, details) => {
        if (!value && (busy || canClose?.() === false)) {
          details.cancel();
          return;
        }
        onOpenChange?.(value);
      }}
    >
      <SheetTrigger aria-label={title} render={<Button type="button" variant={triggerVariant} />}>
        {trigger}
      </SheetTrigger>
        <SheetContent showCloseButton={false} className="customer-vendor-drawer">
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
                <Button type="button" variant="ghost" size="icon" aria-label="Close drawer" />
              }
            >
              <IconX />
            </SheetClose>
          </header>
          <div className="customer-drawer-body">
            <FooterTarget.Provider value={footerTarget}>
              {children}
            </FooterTarget.Provider>
          </div>
          <footer className="customer-drawer-footer">
            <div
              className="customer-drawer-action-target"
              ref={setFooterTarget}
            />
            {footer || (
              <SheetClose
                disabled={busy}
                render={<Button type="button" variant={triggerVariant} />}
              >
                Close
              </SheetClose>
            )}
          </footer>
        </SheetContent>
    </Sheet>
  );
}
