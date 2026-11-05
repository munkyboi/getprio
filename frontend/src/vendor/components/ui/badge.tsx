import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "v:group/badge v:inline-flex v:h-5 v:w-fit v:shrink-0 v:items-center v:justify-center v:gap-1 v:overflow-hidden v:rounded-4xl v:border v:border-transparent v:px-2 v:py-0.5 v:text-xs v:font-medium v:whitespace-nowrap v:transition-all v:focus-visible:border-ring v:focus-visible:ring-[3px] v:focus-visible:ring-ring/50 v:has-data-[icon=inline-end]:pr-1.5 v:has-data-[icon=inline-start]:pl-1.5 v:aria-invalid:border-destructive v:aria-invalid:ring-destructive/20 v:dark:aria-invalid:ring-destructive/40 v:[&>svg]:pointer-events-none v:[&>svg]:size-3!",
  {
    variants: {
      variant: {
        success: "v:bg-transparent v:border-[var(--status-success-foreground)] v:text-[var(--status-success-foreground)]",
        warning: "v:bg-transparent v:border-[var(--status-warning-foreground)] v:text-[var(--status-warning-foreground)]",
        info: "v:bg-transparent v:border-[var(--status-info-foreground)] v:text-[var(--status-info-foreground)]",
        default: "v:bg-transparent v:border-primary v:text-primary",
        secondary:
          "v:bg-transparent v:border-muted-foreground v:text-muted-foreground",
        destructive:
          "v:bg-transparent v:border-destructive v:text-destructive v:focus-visible:ring-destructive/20",
        critical: "v:bg-destructive v:border-destructive v:text-background",
        outline:
          "v:border-border v:text-foreground v:bg-transparent",
        ghost:
          "v:bg-transparent v:border-muted-foreground v:text-muted-foreground",
        link: "v:text-primary v:underline-offset-4 v:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
