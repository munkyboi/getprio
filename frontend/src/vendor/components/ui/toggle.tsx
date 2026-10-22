"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const toggleVariants = cva(
  "v:group/toggle v:inline-flex v:items-center v:justify-center v:gap-1 v:rounded-lg v:text-sm v:font-medium v:whitespace-nowrap v:transition-all v:outline-none v:hover:bg-muted v:hover:text-foreground v:focus-visible:border-ring v:focus-visible:ring-[3px] v:focus-visible:ring-ring/50 v:disabled:pointer-events-none v:disabled:opacity-50 v:aria-invalid:border-destructive v:aria-invalid:ring-destructive/20 v:aria-pressed:bg-muted v:data-[state=on]:bg-muted v:dark:aria-invalid:ring-destructive/40 v:[&_svg]:pointer-events-none v:[&_svg]:shrink-0 v:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "v:bg-transparent",
        workspace: "v:border-0 v:bg-transparent v:text-muted-foreground v:hover:text-foreground v:aria-pressed:bg-background v:aria-pressed:text-foreground v:aria-pressed:shadow-sm",
        outline: "v:border v:border-input v:bg-transparent v:hover:bg-muted",
      },
      size: {
        default:
          "v:h-11 v:min-w-8 v:px-2.5 v:has-data-[icon=inline-end]:pr-2 v:has-data-[icon=inline-start]:pl-2",
        sm: "v:h-11 v:min-w-7 v:rounded-[min(var(--radius-md),12px)] v:px-2.5 v:text-[0.8rem] v:has-data-[icon=inline-end]:pr-1.5 v:has-data-[icon=inline-start]:pl-1.5 v:[&_svg:not([class*=size-])]:size-3.5",
        lg: "v:h-12 v:min-w-9 v:px-2.5 v:has-data-[icon=inline-end]:pr-2 v:has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
