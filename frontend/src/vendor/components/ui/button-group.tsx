import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { Separator } from "@vendor/components/ui/separator"

const buttonGroupVariants = cva(
  "v:flex v:w-fit v:items-stretch v:*:focus-visible:relative v:*:focus-visible:z-10 v:has-[>[data-slot=button-group]]:gap-2 v:has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg v:[&>[data-slot=select-trigger]:not([class*=w-])]:w-fit v:[&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "v:*:data-slot:rounded-r-none v:[&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! v:[&>[data-slot]~[data-slot]]:rounded-l-none v:[&>[data-slot]~[data-slot]]:border-l-0",
        vertical:
          "v:flex-col v:*:data-slot:rounded-b-none v:[&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg! v:[&>[data-slot]~[data-slot]]:rounded-t-none v:[&>[data-slot]~[data-slot]]:border-t-0",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
)

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  )
}

function ButtonGroupText({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "v:flex v:items-center v:gap-2 v:rounded-lg v:border v:bg-muted v:px-2.5 v:text-sm v:font-medium v:[&_svg]:pointer-events-none v:[&_svg:not([class*='size-'])]:size-4",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "button-group-text",
    },
  })
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "v:relative v:self-stretch v:bg-input v:data-horizontal:mx-px v:data-horizontal:w-auto v:data-vertical:my-px v:data-vertical:h-auto",
        className
      )}
      {...props}
    />
  )
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
}
