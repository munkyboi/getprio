import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { cn } from "cn"
import { VendorPortal } from "../../portal"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const container = React.useContext(VendorPortal)
  return (
    <PopoverPrimitive.Portal container={container || undefined}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="v:isolate v:z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "v:z-50 v:flex v:w-72 v:origin-(--transform-origin) v:flex-col v:gap-2.5 v:rounded-lg v:bg-popover v:p-2.5 v:text-sm v:text-popover-foreground v:shadow-md v:ring-1 v:ring-foreground/10 v:outline-hidden v:duration-100 v:data-[side=bottom]:slide-in-from-top-2 v:data-[side=inline-end]:slide-in-from-left-2 v:data-[side=inline-start]:slide-in-from-right-2 v:data-[side=left]:slide-in-from-right-2 v:data-[side=right]:slide-in-from-left-2 v:data-[side=top]:slide-in-from-bottom-2 v:data-open:animate-in v:data-open:fade-in-0 v:data-open:zoom-in-95 v:data-closed:animate-out v:data-closed:fade-out-0 v:data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("v:flex v:flex-col v:gap-0.5 v:text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("v:font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("v:text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
