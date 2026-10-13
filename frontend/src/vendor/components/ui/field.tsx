"use client"

import { useMemo } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { Label } from "@vendor/components/ui/label"
import { Separator } from "@vendor/components/ui/separator"

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        "v:flex v:flex-col v:gap-4 v:has-[>[data-slot=checkbox-group]]:gap-3 v:has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "v:mb-1.5 v:font-medium v:data-[variant=label]:text-sm v:data-[variant=legend]:text-base",
        className
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        "v:group/field-group v:@container/field-group v:flex v:w-full v:flex-col v:gap-5 v:data-[slot=checkbox-group]:gap-3 v:*:data-[slot=field-group]:gap-4",
        className
      )}
      {...props}
    />
  )
}

const fieldVariants = cva(
  "v:group/field v:flex v:w-full v:gap-2 v:data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "v:flex-col v:*:w-full v:[&>.sr-only]:w-auto",
        horizontal:
          "v:flex-row v:items-center v:has-[>[data-slot=field-content]]:items-start v:*:data-[slot=field-label]:flex-auto v:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "v:flex-col v:*:w-full v:@md/field-group:flex-row v:@md/field-group:items-center v:@md/field-group:*:w-auto v:@md/field-group:has-[>[data-slot=field-content]]:items-start v:@md/field-group:*:data-[slot=field-label]:flex-auto v:[&>.sr-only]:w-auto v:@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn(
        "v:group/field-content v:flex v:flex-1 v:flex-col v:gap-0.5 v:leading-snug",
        className
      )}
      {...props}
    />
  )
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        "v:group/field-label v:peer/field-label v:flex v:w-fit v:gap-2 v:leading-snug v:group-data-[disabled=true]/field:opacity-50 v:has-data-checked:border-primary/30 v:has-data-checked:bg-primary/5 v:has-[>[data-slot=field]]:rounded-lg v:has-[>[data-slot=field]]:border v:has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 v:has-[>[data-slot=field]]:has-[:focus-visible]:border-ring v:has-[>[data-slot=field]]:has-[:focus-visible]:ring-3 v:has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring/50 v:*:data-[slot=field]:p-2.5 v:dark:has-data-checked:border-primary/20 v:dark:has-data-checked:bg-primary/10",
        "v:has-[>[data-slot=field]]:w-full v:has-[>[data-slot=field]]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "v:flex v:w-fit v:items-center v:gap-2 v:text-sm v:font-medium v:group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        "v:text-left v:text-sm v:leading-normal v:font-normal v:text-muted-foreground v:group-has-data-horizontal/field:text-balance v:[[data-variant=legend]+&]:-mt-1.5",
        "v:last:mt-0 v:nth-last-2:-mt-1",
        "v:[&>a]:underline v:[&>a]:underline-offset-4 v:[&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "v:relative v:-my-2 v:h-5 v:text-sm v:group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="v:absolute v:inset-0 v:top-1/2" />
      {children && (
        <span
          className="v:relative v:mx-auto v:block v:w-fit v:bg-background v:px-2 v:text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="v:ml-4 v:flex v:list-disc v:flex-col v:gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("v:text-sm v:font-normal v:text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
