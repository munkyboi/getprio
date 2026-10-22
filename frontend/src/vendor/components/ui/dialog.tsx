import { useContext } from "react";
import { VendorPortal } from "../../portal";
import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@vendor/components/ui/button"
import { IconX } from "@tabler/icons-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "v:fixed v:inset-0 v:isolate v:z-50 v:bg-black/10 v:duration-100 v:supports-backdrop-filter:backdrop-blur-xs v:data-open:animate-in v:data-open:fade-in-0 v:data-closed:animate-out v:data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const container = useContext(VendorPortal);
  return (
    <DialogPortal container={container || undefined}>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "v:fixed v:top-1/2 v:left-1/2 v:z-50 v:grid v:w-full v:max-w-[calc(100%-2rem)] v:-translate-x-1/2 v:-translate-y-1/2 v:gap-4 v:rounded-xl v:bg-popover v:p-4 v:text-sm v:text-popover-foreground v:ring-1 v:ring-foreground/10 v:duration-100 v:outline-none v:sm:max-w-sm v:data-open:animate-in v:data-open:fade-in-0 v:data-open:zoom-in-95 v:data-closed:animate-out v:data-closed:fade-out-0 v:data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="v:absolute v:top-2 v:right-2"
                size="icon"
              />
            }
          >
            <IconX
            />
            <span className="v:sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("v:flex v:flex-col v:gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "v:-mx-4 v:-mb-4 v:flex v:flex-col-reverse v:gap-2 v:rounded-b-xl v:border-t v:bg-muted/50 v:p-4 v:sm:flex-row v:sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "v:text-base v:leading-none v:font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "v:text-sm v:text-muted-foreground v:*:[a]:underline v:*:[a]:underline-offset-3 v:*:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
