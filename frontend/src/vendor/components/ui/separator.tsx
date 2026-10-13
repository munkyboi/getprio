import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import { cn } from "cn"

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "v:shrink-0 v:bg-border v:data-horizontal:h-px v:data-horizontal:w-full v:data-vertical:w-px v:data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
