import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "v:peer v:group/switch v:relative v:inline-flex v:shrink-0 v:items-center v:rounded-full v:border v:border-transparent v:transition-all v:outline-none v:group-has-[:focus-visible]/field-label:border-transparent v:group-has-[:focus-visible]/field-label:ring-0 v:after:absolute v:after:-inset-x-3 v:after:-inset-y-2 v:focus-visible:border-ring v:focus-visible:ring-3 v:focus-visible:ring-ring/50 v:aria-invalid:border-destructive v:aria-invalid:ring-3 v:aria-invalid:ring-destructive/20 v:data-[size=default]:h-[18.4px] v:data-[size=default]:w-[32px] v:data-[size=sm]:h-[14px] v:data-[size=sm]:w-[24px] v:dark:aria-invalid:border-destructive/50 v:dark:aria-invalid:ring-destructive/40 v:data-checked:bg-primary v:data-unchecked:bg-input v:dark:data-unchecked:bg-input/80 v:data-disabled:cursor-not-allowed v:data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="v:pointer-events-none v:block v:rounded-full v:bg-background v:ring-0 v:transition-transform v:group-data-[size=default]/switch:size-4 v:group-data-[size=sm]/switch:size-3 v:group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] v:group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] v:dark:data-checked:bg-primary-foreground v:group-data-[size=default]/switch:data-unchecked:translate-x-0 v:group-data-[size=sm]/switch:data-unchecked:translate-x-0 v:dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
