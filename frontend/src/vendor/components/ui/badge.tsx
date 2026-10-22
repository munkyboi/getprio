import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "v:group/badge v:inline-flex v:h-5 v:w-fit v:shrink-0 v:items-center v:justify-center v:gap-1 v:overflow-hidden v:rounded-4xl v:border v:border-transparent v:px-2 v:py-0.5 v:text-xs v:font-medium v:whitespace-nowrap v:transition-all v:focus-visible:border-ring v:focus-visible:ring-[3px] v:focus-visible:ring-ring/50 v:has-data-[icon=inline-end]:pr-1.5 v:has-data-[icon=inline-start]:pl-1.5 v:aria-invalid:border-destructive v:aria-invalid:ring-destructive/20 v:dark:aria-invalid:ring-destructive/40 v:[&>svg]:pointer-events-none v:[&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "v:bg-primary v:text-primary-foreground v:[a]:hover:bg-primary/80",
        secondary:
          "v:bg-secondary v:text-secondary-foreground v:[a]:hover:bg-secondary/80",
        destructive:
          "v:bg-destructive/10 v:text-destructive v:focus-visible:ring-destructive/20 v:dark:bg-destructive/20 v:dark:focus-visible:ring-destructive/40 v:[a]:hover:bg-destructive/20",
        outline:
          "v:border-border v:text-foreground v:[a]:hover:bg-muted v:[a]:hover:text-muted-foreground",
        ghost:
          "v:hover:bg-muted v:hover:text-muted-foreground v:dark:hover:bg-muted/50",
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
