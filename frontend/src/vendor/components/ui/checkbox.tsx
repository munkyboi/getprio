import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { cn } from "cn"
import { IconCheck } from "@tabler/icons-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "v:peer v:relative v:flex v:size-4 v:shrink-0 v:items-center v:justify-center v:rounded-[4px] v:border v:border-input v:transition-colors v:outline-none v:group-has-disabled/field:opacity-50 v:group-has-[:focus-visible]/field-label:ring-0 v:group-has-[:focus-visible]/field-label:not-data-checked:border-input v:after:absolute v:after:-inset-x-3 v:after:-inset-y-2 v:focus-visible:border-ring v:focus-visible:ring-3 v:focus-visible:ring-ring/50 v:disabled:cursor-not-allowed v:disabled:opacity-50 v:aria-invalid:border-destructive v:aria-invalid:ring-3 v:aria-invalid:ring-destructive/20 v:aria-invalid:aria-checked:border-primary v:dark:bg-input/30 v:dark:aria-invalid:border-destructive/50 v:dark:aria-invalid:ring-destructive/40 v:data-checked:border-primary v:data-checked:bg-primary v:data-checked:text-primary-foreground v:group-has-[:focus-visible]/field-label:data-checked:border-primary v:dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="v:grid v:place-content-center v:text-current v:transition-none v:[&>svg]:size-3.5"
      >
        <IconCheck
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
