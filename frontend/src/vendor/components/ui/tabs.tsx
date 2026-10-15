import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "v:group/tabs v:flex v:gap-2 v:data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "v:group/tabs-list v:inline-flex v:w-fit v:items-center v:justify-center v:rounded-lg v:p-[3px] v:text-muted-foreground v:group-data-[orientation=horizontal]/tabs:h-8 v:group-data-[orientation=vertical]/tabs:h-fit v:group-data-[orientation=vertical]/tabs:flex-col v:data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "v:bg-muted",
        line: "v:gap-1 v:bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "v:relative v:inline-flex v:h-[calc(100%-1px)] v:flex-1 v:items-center v:justify-center v:gap-1.5 v:rounded-md v:border v:border-transparent v:px-1.5 v:py-0.5 v:text-sm v:font-medium v:whitespace-nowrap v:text-foreground/60 v:transition-all v:group-data-[orientation=vertical]/tabs:w-full v:group-data-[orientation=vertical]/tabs:justify-start v:hover:text-foreground v:focus-visible:border-ring v:focus-visible:ring-[3px] v:focus-visible:ring-ring/50 v:focus-visible:outline-1 v:focus-visible:outline-ring v:disabled:pointer-events-none v:disabled:opacity-50 v:has-data-[icon=inline-end]:pr-1 v:has-data-[icon=inline-start]:pl-1 v:aria-disabled:pointer-events-none v:aria-disabled:opacity-50 v:dark:text-muted-foreground v:dark:hover:text-foreground v:group-data-[variant=default]/tabs-list:data-active:shadow-sm v:group-data-[variant=line]/tabs-list:data-active:shadow-none v:[&_svg]:pointer-events-none v:[&_svg]:shrink-0 v:[&_svg:not([class*=size-])]:size-4",
        "v:group-data-[variant=line]/tabs-list:bg-transparent v:group-data-[variant=line]/tabs-list:data-active:bg-transparent v:dark:group-data-[variant=line]/tabs-list:data-active:border-transparent v:dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "v:data-active:bg-background v:data-active:text-foreground v:dark:data-active:border-input v:dark:data-active:bg-input/30 v:dark:data-active:text-foreground",
        "v:after:absolute v:after:bg-foreground v:after:opacity-0 v:after:transition-opacity v:group-data-[orientation=horizontal]/tabs:after:inset-x-0 v:group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] v:group-data-[orientation=horizontal]/tabs:after:h-0.5 v:group-data-[orientation=vertical]/tabs:after:inset-y-0 v:group-data-[orientation=vertical]/tabs:after:-right-1 v:group-data-[orientation=vertical]/tabs:after:w-0.5 v:group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("v:flex-1 v:text-sm v:outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
