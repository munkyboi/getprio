import { useContext } from "react";
import { VendorPortal } from "../../portal";

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cn } from "cn"
import { IconSelector, IconCheck, IconChevronUp, IconChevronDown } from "@tabler/icons-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("v:scroll-my-1 v:p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("v:flex v:flex-1 v:text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "v:flex v:w-fit v:items-center v:justify-between v:gap-1.5 v:rounded-lg v:border v:border-input v:bg-transparent v:py-2 v:pr-2 v:pl-2.5 v:text-sm v:whitespace-nowrap v:transition-colors v:outline-none v:select-none v:focus-visible:border-ring v:focus-visible:ring-3 v:focus-visible:ring-ring/50 v:disabled:cursor-not-allowed v:disabled:opacity-50 v:aria-invalid:border-destructive v:aria-invalid:ring-3 v:aria-invalid:ring-destructive/20 v:data-placeholder:text-muted-foreground v:data-[size=default]:min-h-11 v:data-[size=sm]:min-h-11 v:data-[size=sm]:rounded-[min(var(--radius-md),10px)] v:*:data-[slot=select-value]:line-clamp-1 v:*:data-[slot=select-value]:flex v:*:data-[slot=select-value]:items-center v:*:data-[slot=select-value]:gap-1.5 v:dark:bg-input/30 v:dark:hover:bg-input/50 v:dark:aria-invalid:border-destructive/50 v:dark:aria-invalid:ring-destructive/40 v:[&_svg]:pointer-events-none v:[&_svg]:shrink-0 v:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <IconSelector className="v:pointer-events-none v:size-4 v:text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  const container = useContext(VendorPortal);
  return (
    <SelectPrimitive.Portal container={container || undefined}>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="v:isolate v:z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("v: v: v:relative v:isolate v:z-50 v:max-h-(--available-height) v:w-(--anchor-width) v:min-w-36 v:origin-(--transform-origin) v:overflow-x-hidden v:overflow-y-auto v:rounded-lg v:bg-popover v:text-popover-foreground v:shadow-md v:ring-1 v:ring-foreground/10 v:duration-100 v:data-[align-trigger=true]:animate-none v:data-[side=bottom]:slide-in-from-top-2 v:data-[side=inline-end]:slide-in-from-left-2 v:data-[side=inline-start]:slide-in-from-right-2 v:data-[side=left]:slide-in-from-right-2 v:data-[side=right]:slide-in-from-left-2 v:data-[side=top]:slide-in-from-bottom-2 v:data-open:animate-in v:data-open:fade-in-0 v:data-open:zoom-in-95 v:data-closed:animate-out v:data-closed:fade-out-0 v:data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("v:px-1.5 v:py-1 v:text-xs v:text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "v:relative v:flex v:w-full v:cursor-default v:items-center v:gap-1.5 v:rounded-md v:min-h-11 v:py-2 v:pr-8 v:pl-1.5 v:text-sm v:outline-hidden v:select-none v:focus:bg-accent v:focus:text-accent-foreground v:not-data-[variant=destructive]:focus:**:text-accent-foreground v:data-disabled:pointer-events-none v:data-disabled:opacity-50 v:[&_svg]:pointer-events-none v:[&_svg]:shrink-0 v:[&_svg:not([class*=size-])]:size-4 v:*:[span]:last:flex v:*:[span]:last:items-center v:*:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="v:flex v:flex-1 v:shrink-0 v:gap-2 v:whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="v:pointer-events-none v:absolute v:right-2 v:flex v:size-4 v:items-center v:justify-center" />
        }
      >
        <IconCheck className="v:pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("v:pointer-events-none v:-mx-1 v:my-1 v:h-px v:bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "v:top-0 v:z-10 v:flex v:w-full v:cursor-default v:items-center v:justify-center v:bg-popover v:py-1 v:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    >
      <IconChevronUp
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "v:bottom-0 v:z-10 v:flex v:w-full v:cursor-default v:items-center v:justify-center v:bg-popover v:py-1 v:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    >
      <IconChevronDown
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
