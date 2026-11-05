import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const alertVariants = cva(
  "v:group/alert v:relative v:grid v:w-full v:gap-0.5 v:rounded-lg v:border v:border-border v:px-2.5 v:py-2 v:text-left v:text-sm v:has-data-[slot=alert-action]:relative v:has-data-[slot=alert-action]:pr-18 v:has-[>svg]:grid-cols-[auto_1fr] v:has-[>svg]:gap-x-2 v:*:[svg]:row-span-2 v:*:[svg]:translate-y-0.5 v:*:[svg]:text-current v:*:[svg:not([class*=size-])]:size-4",
  {
    variants: {
      variant: {
        default: "v:bg-card v:text-card-foreground",
        info: "v:bg-info-surface v:border-info-border v:text-info v:*:data-[slot=alert-description]:text-info v:*:[svg]:text-current",
        success:
          "v:bg-success-surface v:border-success-border v:text-success v:*:data-[slot=alert-description]:text-success v:*:[svg]:text-current",
        warning:
          "v:bg-warning-surface v:border-warning-border v:text-warning v:*:data-[slot=alert-description]:text-warning v:*:[svg]:text-current",
        error:
          "v:bg-error-surface v:border-error-border v:text-error v:*:data-[slot=alert-description]:text-error v:*:[svg]:text-current",
        destructive:
          "v:bg-error-surface v:border-error-border v:text-destructive v:*:data-[slot=alert-description]:text-destructive v:*:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={
        variant === "info" || variant === "success" || variant === "warning"
          ? "status"
          : "alert"
      }
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "v:font-medium v:group-has-[>svg]/alert:col-start-2 v:[&_a]:underline v:[&_a]:underline-offset-3 v:[&_a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "v:text-sm v:text-balance v:text-muted-foreground v:md:text-pretty v:[&_a]:underline v:[&_a]:underline-offset-3 v:[&_a]:hover:text-foreground v:[&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  );
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("v:absolute v:top-2 v:right-2", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, AlertAction };
