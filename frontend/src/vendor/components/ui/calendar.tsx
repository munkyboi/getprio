import * as React from "react"
import { cn } from "cn"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type Locale,
} from "react-day-picker"

import { Button, buttonVariants } from "@vendor/components/ui/button"
import { IconChevronLeft, IconChevronRight, IconChevronDown } from "@tabler/icons-react"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "v:group/calendar v:bg-background v:p-2 v:[--cell-radius:var(--radius-md)] v:[--cell-size:--spacing(7)] v:in-data-[slot=card-content]:bg-transparent v:in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("v:w-fit", defaultClassNames.root),
        months: cn(
          "v:relative v:flex v:flex-col v:gap-4 v:md:flex-row",
          defaultClassNames.months
        ),
        month: cn("v:flex v:w-full v:flex-col v:gap-4", defaultClassNames.month),
        nav: cn(
          "v:absolute v:inset-x-0 v:top-0 v:flex v:w-full v:items-center v:justify-between v:gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "v:size-(--cell-size) v:p-0 v:select-none v:aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "v:size-(--cell-size) v:p-0 v:select-none v:aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "v:flex v:h-(--cell-size) v:w-full v:items-center v:justify-center v:px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "v:flex v:h-(--cell-size) v:w-full v:items-center v:justify-center v:gap-1.5 v:text-sm v:font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "v:relative v:rounded-(--cell-radius)",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "v:absolute v:inset-0 v:bg-popover v:opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "v:font-medium v:select-none",
          captionLayout === "label"
            ? "v:text-sm"
            : "v:flex v:items-center v:gap-1 v:rounded-(--cell-radius) v:text-sm v:[&>svg]:size-3.5 v:[&>svg]:text-muted-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: cn("v:w-full v:border-collapse", defaultClassNames.month_grid),
        weekdays: cn("v:flex", defaultClassNames.weekdays),
        weekday: cn(
          "v:flex-1 v:rounded-(--cell-radius) v:text-[0.8rem] v:font-normal v:text-muted-foreground v:select-none",
          defaultClassNames.weekday
        ),
        week: cn("v:mt-2 v:flex v:w-full", defaultClassNames.week),
        week_number_header: cn(
          "v:w-(--cell-size) v:select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "v:text-[0.8rem] v:text-muted-foreground v:select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "v:group/day v:relative v:aspect-square v:h-full v:w-full v:rounded-(--cell-radius) v:p-0 v:text-center v:select-none v:[&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          props.showWeekNumber
            ? "v:[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "v:[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day
        ),
        range_start: cn(
          "v:relative v:isolate v:z-0 v:rounded-l-(--cell-radius) v:bg-muted v:after:absolute v:after:inset-y-0 v:after:right-0 v:after:w-4 v:after:bg-muted",
          defaultClassNames.range_start
        ),
        range_middle: cn("v:rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "v:relative v:isolate v:z-0 v:rounded-r-(--cell-radius) v:bg-muted v:after:absolute v:after:inset-y-0 v:after:left-0 v:after:w-4 v:after:bg-muted",
          defaultClassNames.range_end
        ),
        today: cn(
          "v:rounded-(--cell-radius) v:bg-muted v:text-foreground v:data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "v:text-muted-foreground v:aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "v:text-muted-foreground v:opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("v:invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <IconChevronLeft className={cn("v:size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <IconChevronRight className={cn("v:size-4", className)} {...props} />
            )
          }

          return (
            <IconChevronDown className={cn("v:size-4", className)} {...props} />
          )
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="v:flex v:size-(--cell-size) v:items-center v:justify-center v:text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "v:relative v:isolate v:z-10 v:flex v:aspect-square v:size-auto v:w-full v:min-w-(--cell-size) v:flex-col v:gap-1 v:border-0 v:leading-none v:font-normal v:group-data-[focused=true]/day:relative v:group-data-[focused=true]/day:z-10 v:group-data-[focused=true]/day:border-ring v:group-data-[focused=true]/day:ring-[3px] v:group-data-[focused=true]/day:ring-ring/50 v:data-[range-end=true]:rounded-(--cell-radius) v:data-[range-end=true]:rounded-r-(--cell-radius) v:data-[range-end=true]:bg-primary v:data-[range-end=true]:text-primary-foreground v:data-[range-middle=true]:rounded-none v:data-[range-middle=true]:bg-muted v:data-[range-middle=true]:text-foreground v:data-[range-start=true]:rounded-(--cell-radius) v:data-[range-start=true]:rounded-l-(--cell-radius) v:data-[range-start=true]:bg-primary v:data-[range-start=true]:text-primary-foreground v:data-[selected-single=true]:bg-primary v:data-[selected-single=true]:text-primary-foreground v:dark:hover:text-foreground v:[&>span]:text-xs v:[&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
