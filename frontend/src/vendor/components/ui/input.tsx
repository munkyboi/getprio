import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "v:min-h-11 v:w-full v:min-w-0 v:rounded-lg v:border v:border-input v:bg-transparent v:px-2.5 v:py-1 v:text-base v:transition-colors v:outline-none v:file:inline-flex v:file:h-6 v:file:border-0 v:file:bg-transparent v:file:text-sm v:file:font-medium v:file:text-foreground v:placeholder:text-muted-foreground v:focus-visible:border-ring v:focus-visible:ring-3 v:focus-visible:ring-ring/50 v:disabled:pointer-events-none v:disabled:cursor-not-allowed v:disabled:bg-input/50 v:disabled:opacity-50 v:aria-invalid:border-destructive v:aria-invalid:ring-3 v:aria-invalid:ring-destructive/20 v:md:text-sm v:dark:bg-input/30 v:dark:disabled:bg-input/80 v:dark:aria-invalid:border-destructive/50 v:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
