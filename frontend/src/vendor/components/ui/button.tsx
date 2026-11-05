import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "v:group/button v:inline-flex v:shrink-0 v:items-center v:justify-center v:rounded-lg v:border v:border-transparent v:bg-clip-padding v:text-sm v:font-medium v:whitespace-nowrap v:transition-all v:outline-none v:select-none v:focus-visible:border-ring v:focus-visible:ring-3 v:focus-visible:ring-ring/50 v:active:not-aria-[haspopup]:translate-y-px v:disabled:pointer-events-none v:disabled:opacity-50 v:aria-invalid:border-destructive v:aria-invalid:ring-3 v:aria-invalid:ring-destructive/20 v:dark:aria-invalid:border-destructive/50 v:dark:aria-invalid:ring-destructive/40 v:[&_svg]:pointer-events-none v:[&_svg]:shrink-0 v:[&_svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "v:bg-primary v:text-primary-foreground v:hover:bg-primary/80",
        outline:
          "v:border-border v:bg-background v:hover:bg-muted v:hover:text-foreground v:aria-expanded:bg-muted v:aria-expanded:text-foreground v:dark:border-input v:dark:bg-input/30 v:dark:hover:bg-input/50",
        secondary:
          "v:bg-secondary v:text-secondary-foreground v:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] v:aria-expanded:bg-secondary v:aria-expanded:text-secondary-foreground",
        ghost:
          "v:hover:bg-muted v:hover:text-foreground v:aria-expanded:bg-muted v:aria-expanded:text-foreground v:dark:hover:bg-muted/50",
        destructive:
          "v:bg-destructive/10 v:text-destructive v:hover:bg-destructive/20 v:focus-visible:border-destructive/40 v:focus-visible:ring-destructive/20 v:dark:bg-destructive/20 v:dark:hover:bg-destructive/30 v:dark:focus-visible:ring-destructive/40",
        link: "v:text-primary v:underline-offset-4 v:hover:underline",
      },
      size: {
        default:
          "v:h-11 v:gap-1.5 v:px-2.5 v:has-data-[icon=inline-end]:pr-2 v:has-data-[icon=inline-start]:pl-2",
        xs: "v:h-11 v:gap-1 v:rounded-[min(var(--radius-md),10px)] v:px-2 v:text-xs v:in-data-[slot=button-group]:rounded-lg v:has-data-[icon=inline-end]:pr-1.5 v:has-data-[icon=inline-start]:pl-1.5 v:[&_svg:not([class*=size-])]:size-3",
        sm: "v:h-11 v:gap-1 v:rounded-[min(var(--radius-md),12px)] v:px-2.5 v:text-[0.8rem] v:in-data-[slot=button-group]:rounded-lg v:has-data-[icon=inline-end]:pr-1.5 v:has-data-[icon=inline-start]:pl-1.5 v:[&_svg:not([class*=size-])]:size-3.5",
        lg: "v:h-12 v:gap-1.5 v:px-2.5 v:has-data-[icon=inline-end]:pr-2 v:has-data-[icon=inline-start]:pl-2",
        icon: "v:size-11",
        "icon-xs":
          "v:size-11 v:rounded-[min(var(--radius-md),10px)] v:in-data-[slot=button-group]:rounded-lg v:[&_svg:not([class*=size-])]:size-3",
        "icon-sm":
          "v:size-11 v:rounded-[min(var(--radius-md),12px)] v:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "v:size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<HTMLButtonElement, ButtonPrimitive.Props & VariantProps<typeof buttonVariants>>(function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}, ref) {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
