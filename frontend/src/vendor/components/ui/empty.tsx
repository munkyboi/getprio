import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "v:flex v:w-full v:min-w-0 v:flex-1 v:flex-col v:items-center v:justify-center v:gap-4 v:rounded-xl v:border-dashed v:p-6 v:text-center v:text-balance",
        className
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("v:flex v:max-w-sm v:flex-col v:items-center v:gap-2", className)}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  "v:mb-2 v:flex v:shrink-0 v:items-center v:justify-center v:[&_svg]:pointer-events-none v:[&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "v:bg-transparent",
        icon: "v:flex v:size-8 v:shrink-0 v:items-center v:justify-center v:rounded-lg v:bg-muted v:text-foreground v:[&_svg:not([class*=size-])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn(
        "v: v:text-sm v:font-medium v:tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "v:text-sm/relaxed v:text-muted-foreground v:[&>a]:underline v:[&>a]:underline-offset-4 v:[&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "v:flex v:w-full v:max-w-sm v:min-w-0 v:flex-col v:items-center v:gap-2.5 v:text-sm v:text-balance",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}
