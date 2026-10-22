import * as React from "react"
import { cn } from "cn"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "v:group/card v:flex v:flex-col v:gap-(--card-spacing) v:overflow-hidden v:rounded-xl v:bg-card v:py-(--card-spacing) v:text-sm v:text-card-foreground v:ring-1 v:ring-foreground/10 v:[--card-spacing:--spacing(4)] v:has-data-[slot=card-footer]:pb-0 v:has-[>img:first-child]:pt-0 v:data-[size=sm]:[--card-spacing:--spacing(3)] v:data-[size=sm]:has-data-[slot=card-footer]:pb-0 v:*:[img:first-child]:rounded-t-xl v:*:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "v:group/card-header v:@container/card-header v:grid v:auto-rows-min v:items-start v:gap-1 v:rounded-t-xl v:px-(--card-spacing) v:has-data-[slot=card-action]:grid-cols-[1fr_auto] v:has-data-[slot=card-description]:grid-rows-[auto_auto] v:[.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "v:text-base v:leading-snug v:font-medium v:group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("v:text-sm v:text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "v:col-start-2 v:row-span-2 v:row-start-1 v:self-start v:justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("v:px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "v:flex v:items-center v:rounded-b-xl v:border-t v:bg-muted/50 v:p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
