import { createElement } from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "cn";

// Base shadcn composition, adapted to the project's prefix and Tabler library.
function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("v:flex v:w-full v:flex-col", className)}
      {...props}
    />
  );
}
function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("v:not-last:border-b", className)}
      {...props}
    />
  );
}
function AccordionTrigger({
  className,
  children,
  iconPosition = "end",
  headingLevel = 3,
  ...props
}: AccordionPrimitive.Trigger.Props & {
  iconPosition?: "start" | "end";
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}) {
  return (
    <AccordionPrimitive.Header
      render={createElement(`h${headingLevel}`)}
      className="v:m-0 v:flex v:min-w-0 v:flex-1 v:font-sans"
    >
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "v:group/accordion-trigger v:flex v:min-h-11 v:min-w-0 v:flex-1 v:items-center v:gap-3 v:rounded-lg v:border v:border-transparent v:px-4 v:py-3 v:text-left v:text-sm v:font-sans v:font-medium v:outline-none v:focus-visible:border-ring v:focus-visible:ring-3 v:focus-visible:ring-ring/50 v:disabled:pointer-events-none v:disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {iconPosition === "start" ? (
          <IconChevronDown
            data-slot="accordion-trigger-icon"
            aria-hidden="true"
            className="v:size-4 v:shrink-0 v:transition-transform v:group-aria-expanded/accordion-trigger:rotate-180"
          />
        ) : null}
        {children}
        {iconPosition === "end" ? (
          <IconChevronDown
            data-slot="accordion-trigger-icon"
            aria-hidden="true"
            className="v:ml-auto v:size-4 v:shrink-0 v:transition-transform v:group-aria-expanded/accordion-trigger:rotate-180"
          />
        ) : null}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}
function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="v:overflow-hidden"
      {...props}
    >
      <div className={cn("v:p-4 v:pt-2", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
