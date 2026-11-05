import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"

import { Button } from "@vendor/components/ui/button"
import { IconX } from "@tabler/icons-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "v:fixed v:inset-0 v:z-50 v:bg-black/10 v:transition-opacity v:duration-150 v:data-ending-style:opacity-0 v:data-starting-style:opacity-0 v:supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  container,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  container?: SheetPrimitive.Portal.Props["container"]
}) {
  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "v:fixed v:z-50 v:flex v:flex-col v:gap-4 v:bg-popover v:bg-clip-padding v:text-sm v:text-popover-foreground v:shadow-lg v:transition v:duration-200 v:ease-in-out v:data-ending-style:opacity-0 v:data-starting-style:opacity-0 v:data-[side=bottom]:inset-x-0 v:data-[side=bottom]:bottom-0 v:data-[side=bottom]:h-auto v:data-[side=bottom]:border-t v:data-[side=bottom]:data-ending-style:translate-y-[2.5rem] v:data-[side=bottom]:data-starting-style:translate-y-[2.5rem] v:data-[side=left]:inset-y-0 v:data-[side=left]:left-0 v:data-[side=left]:h-full v:data-[side=left]:w-3/4 v:data-[side=left]:border-r v:data-[side=left]:data-ending-style:translate-x-[-2.5rem] v:data-[side=left]:data-starting-style:translate-x-[-2.5rem] v:data-[side=right]:inset-y-0 v:data-[side=right]:right-0 v:data-[side=right]:h-full v:data-[side=right]:w-3/4 v:data-[side=right]:border-l v:data-[side=right]:data-ending-style:translate-x-[2.5rem] v:data-[side=right]:data-starting-style:translate-x-[2.5rem] v:data-[side=top]:inset-x-0 v:data-[side=top]:top-0 v:data-[side=top]:h-auto v:data-[side=top]:border-b v:data-[side=top]:data-ending-style:translate-y-[-2.5rem] v:data-[side=top]:data-starting-style:translate-y-[-2.5rem] v:data-[side=left]:sm:max-w-sm v:data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="v:absolute v:top-3 v:right-3"
                size="icon-sm"
              />
            }
          >
            <IconX
            />
            <span className="v:sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("v:flex v:flex-col v:gap-0.5 v:p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("v:mt-auto v:flex v:flex-col v:gap-2 v:p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "v:text-base v:font-medium v:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("v:text-sm v:text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
