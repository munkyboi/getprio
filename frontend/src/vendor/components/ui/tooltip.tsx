import { useContext } from "react";
import { VendorPortal } from "../../portal";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "cn"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const container=useContext(VendorPortal);
  return (
    <TooltipPrimitive.Portal container={container || undefined}>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="v:isolate v:z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "v:z-50 v:inline-flex v:w-fit v:max-w-xs v:origin-(--transform-origin) v:items-center v:gap-1.5 v:rounded-md v:bg-foreground v:px-3 v:py-1.5 v:text-xs v:text-background v:has-data-[slot=kbd]:pr-1.5 v:data-[side=bottom]:slide-in-from-top-2 v:data-[side=inline-end]:slide-in-from-left-2 v:data-[side=inline-start]:slide-in-from-right-2 v:data-[side=left]:slide-in-from-right-2 v:data-[side=right]:slide-in-from-left-2 v:data-[side=top]:slide-in-from-bottom-2 v:**:data-[slot=kbd]:relative v:**:data-[slot=kbd]:isolate v:**:data-[slot=kbd]:z-50 v:**:data-[slot=kbd]:rounded-sm v:data-[state=delayed-open]:animate-in v:data-[state=delayed-open]:fade-in-0 v:data-[state=delayed-open]:zoom-in-95 v:data-open:animate-in v:data-open:fade-in-0 v:data-open:zoom-in-95 v:data-closed:animate-out v:data-closed:fade-out-0 v:data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="v:z-50 v:size-2.5 v:translate-y-[calc(-50%-2px)] v:rotate-45 v:rounded-[2px] v:bg-foreground v:fill-foreground v:data-[side=bottom]:top-1 v:data-[side=inline-end]:top-1/2! v:data-[side=inline-end]:-left-1 v:data-[side=inline-end]:-translate-y-1/2 v:data-[side=inline-start]:top-1/2! v:data-[side=inline-start]:-right-1 v:data-[side=inline-start]:-translate-y-1/2 v:data-[side=left]:top-1/2! v:data-[side=left]:-right-1 v:data-[side=left]:-translate-y-1/2 v:data-[side=right]:top-1/2! v:data-[side=right]:-left-1 v:data-[side=right]:-translate-y-1/2 v:data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
