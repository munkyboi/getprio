"use client"

import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { toggleVariants } from "@vendor/components/ui/toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }
>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "v:group/toggle-group v:flex v:w-fit v:flex-row v:items-center v:gap-[--spacing(var(--gap))] v:rounded-lg v:data-[size=sm]:rounded-[min(var(--radius-md),10px)] v:data-vertical:flex-col v:data-vertical:items-stretch",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ variant, size, spacing, orientation }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "v:shrink-0 v:group-data-[spacing=0]/toggle-group:rounded-none v:group-data-[spacing=0]/toggle-group:px-2 v:focus:z-10 v:focus-visible:z-10 v:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 v:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 v:group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg v:group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg v:group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg v:group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg v:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 v:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 v:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l v:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }
