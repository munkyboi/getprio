import * as React from "react"
import { cn } from "cn"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "v:flex v:items-center v:gap-2 v:text-sm v:leading-none v:font-medium v:select-none v:group-data-[disabled=true]:pointer-events-none v:group-data-[disabled=true]:opacity-50 v:peer-disabled:cursor-not-allowed v:peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
