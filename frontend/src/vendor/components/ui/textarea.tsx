import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "v:flex v:field-sizing-content v:min-h-16 v:w-full v:rounded-lg v:border v:border-input v:bg-transparent v:px-2.5 v:py-2 v:text-base v:transition-colors v:outline-none v:placeholder:text-muted-foreground v:focus-visible:border-ring v:focus-visible:ring-3 v:focus-visible:ring-ring/50 v:disabled:cursor-not-allowed v:disabled:bg-input/50 v:disabled:opacity-50 v:aria-invalid:border-destructive v:aria-invalid:ring-3 v:aria-invalid:ring-destructive/20 v:md:text-sm v:dark:bg-input/30 v:dark:disabled:bg-input/80 v:dark:aria-invalid:border-destructive/50 v:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
