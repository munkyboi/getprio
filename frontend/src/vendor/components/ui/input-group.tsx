import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { Button } from "@vendor/components/ui/button"
import { Input } from "@vendor/components/ui/input"
import { Textarea } from "@vendor/components/ui/textarea"

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "v:group/input-group v:relative v:flex v:h-8 v:w-full v:min-w-0 v:items-center v:rounded-lg v:border v:border-input v:transition-colors v:outline-none v:in-data-[slot=combobox-content]:focus-within:border-inherit v:in-data-[slot=combobox-content]:focus-within:ring-0 v:has-disabled:bg-input/50 v:has-disabled:opacity-50 v:has-[[data-slot=input-group-control]:focus-visible]:border-ring v:has-[[data-slot=input-group-control]:focus-visible]:ring-3 v:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 v:has-[[data-slot][aria-invalid=true]]:border-destructive v:has-[[data-slot][aria-invalid=true]]:ring-3 v:has-[[data-slot][aria-invalid=true]]:ring-destructive/20 v:has-[>[data-align=block-end]]:h-auto v:has-[>[data-align=block-end]]:flex-col v:has-[>[data-align=block-start]]:h-auto v:has-[>[data-align=block-start]]:flex-col v:has-[>textarea]:h-auto v:dark:bg-input/30 v:dark:has-disabled:bg-input/80 v:dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 v:has-[>[data-align=block-end]]:[&>input]:pt-3 v:has-[>[data-align=block-start]]:[&>input]:pb-3 v:has-[>[data-align=inline-end]]:[&>input]:pr-1.5 v:has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        className
      )}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "v:flex v:h-auto v:cursor-text v:items-center v:justify-center v:gap-2 v:py-1.5 v:text-sm v:font-medium v:text-muted-foreground v:select-none v:group-data-[disabled=true]/input-group:opacity-50 v:[&>kbd]:rounded-[calc(var(--radius)-5px)] v:[&>svg:not([class*=size-])]:size-4",
  {
    variants: {
      align: {
        "inline-start":
          "v:order-first v:pl-2 v:has-[>button]:ml-[-0.3rem] v:has-[>kbd]:ml-[-0.15rem]",
        "inline-end":
          "v:order-last v:pr-2 v:has-[>button]:mr-[-0.3rem] v:has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "v:order-first v:w-full v:justify-start v:px-2.5 v:pt-2 v:group-has-[>input]/input-group:pt-2 v:[.border-b]:pb-2",
        "block-end":
          "v:order-last v:w-full v:justify-start v:px-2.5 v:pb-2 v:group-has-[>input]/input-group:pb-2 v:[.border-t]:pt-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
)

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva(
  "v:flex v:items-center v:gap-2 v:text-sm v:shadow-none",
  {
    variants: {
      size: {
        xs: "v:h-6 v:gap-1 v:rounded-[calc(var(--radius)-3px)] v:px-1.5 v:[&>svg:not([class*=size-])]:size-3.5",
        sm: "v:",
        "icon-xs":
          "v:size-6 v:rounded-[calc(var(--radius)-3px)] v:p-0 v:has-[>svg]:p-0",
        "icon-sm": "v:size-8 v:p-0 v:has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
)

const InputGroupButton = React.forwardRef<HTMLButtonElement, Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset"
  }>(function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}, ref) {
  return (
    <Button ref={ref}
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
});

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "v:flex v:items-center v:gap-2 v:text-sm v:text-muted-foreground v:[&_svg]:pointer-events-none v:[&_svg:not([class*=size-])]:size-4",
        className
      )}
      {...props}
    />
  )
}

const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function InputGroupInput({
  className,
  ...props
}, ref) {
  return (
    <Input ref={ref}
      data-slot="input-group-control"
      className={cn(
        "v:flex-1 v:rounded-none v:border-0 v:bg-transparent v:shadow-none v:ring-0 v:focus-visible:ring-0 v:disabled:bg-transparent v:aria-invalid:ring-0 v:dark:bg-transparent v:dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
});

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "v:flex-1 v:resize-none v:rounded-none v:border-0 v:bg-transparent v:py-2 v:shadow-none v:ring-0 v:focus-visible:ring-0 v:disabled:bg-transparent v:aria-invalid:ring-0 v:dark:bg-transparent v:dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
