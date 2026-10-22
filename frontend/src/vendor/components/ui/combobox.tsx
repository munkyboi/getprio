"use client";

import * as React from "react";
import { VendorPortal } from "../../portal";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { cn } from "cn";

import { Button } from "@vendor/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@vendor/components/ui/input-group";
import { IconChevronDown, IconX, IconCheck } from "@tabler/icons-react";

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

const ComboboxTrigger = React.forwardRef<
  HTMLButtonElement,
  ComboboxPrimitive.Trigger.Props
>(function ComboboxTrigger({ className, children, ...props }, ref) {
  return (
    <ComboboxPrimitive.Trigger
      ref={ref}
      data-slot="combobox-trigger"
      className={cn("v:[&_svg:not([class*=size-])]:size-4", className)}
      {...props}
    >
      {children}
      <IconChevronDown className="v:pointer-events-none v:size-4 v:text-muted-foreground" />
    </ComboboxPrimitive.Trigger>
  );
});

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <IconX className="v:pointer-events-none" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <InputGroup className={cn("v:w-auto", className)}>
      <ComboboxPrimitive.Input
        render={<InputGroupInput disabled={disabled} />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="v:group-has-data-[slot=combobox-clear]/input-group:hidden v:data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >) {
  const container = React.useContext(VendorPortal);
  return (
    <ComboboxPrimitive.Portal container={container || undefined}>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="v:isolate v:z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn(
            "v: v: v:group/combobox-content v:relative v:max-h-(--available-height) v:w-(--anchor-width) v:max-w-(--available-width) v:min-w-[calc(var(--anchor-width)+--spacing(7))] v:origin-(--transform-origin) v:overflow-hidden v:rounded-lg v:bg-popover v:text-popover-foreground v:shadow-md v:ring-1 v:ring-foreground/10 v:duration-100 v:data-[chips=true]:min-w-(--anchor-width) v:data-[side=bottom]:slide-in-from-top-2 v:data-[side=inline-end]:slide-in-from-left-2 v:data-[side=inline-start]:slide-in-from-right-2 v:data-[side=left]:slide-in-from-right-2 v:data-[side=right]:slide-in-from-left-2 v:data-[side=top]:slide-in-from-bottom-2 v:*:data-[slot=input-group]:m-1 v:*:data-[slot=input-group]:mb-0 v:*:data-[slot=input-group]:h-8 v:*:data-[slot=input-group]:border-input/30 v:*:data-[slot=input-group]:bg-input/30 v:*:data-[slot=input-group]:shadow-none v:data-open:animate-in v:data-open:fade-in-0 v:data-open:zoom-in-95 v:data-closed:animate-out v:data-closed:fade-out-0 v:data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "v:no-scrollbar v:max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] v:scroll-py-1 v:overflow-y-auto v:overscroll-contain v:p-1 v:data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "v:relative v:flex v:w-full v:cursor-default v:items-center v:gap-2 v:rounded-md v:py-1 v:pr-8 v:pl-1.5 v:text-sm v:outline-hidden v:select-none v:data-highlighted:bg-accent v:data-highlighted:text-accent-foreground v:not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground v:data-disabled:pointer-events-none v:data-disabled:opacity-50 v:[&_svg]:pointer-events-none v:[&_svg]:shrink-0 v:[&_svg:not([class*=size-])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="v:pointer-events-none v:absolute v:right-2 v:flex v:size-4 v:items-center v:justify-center" />
        }
      >
        <IconCheck className="v:pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn(className)}
      {...props}
    />
  );
}

function ComboboxLabel({
  className,
  ...props
}: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn(
        "v:px-2 v:py-1.5 v:text-xs v:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "v:hidden v:w-full v:justify-center v:py-2 v:text-center v:text-sm v:text-muted-foreground v:group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({
  className,
  ...props
}: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("v:-mx-1 v:my-1 v:h-px v:bg-border", className)}
      {...props}
    />
  );
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
  ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "v:flex v:min-h-8 v:flex-wrap v:items-center v:gap-1 v:rounded-lg v:border v:border-input v:bg-transparent v:bg-clip-padding v:px-2.5 v:py-1 v:text-sm v:transition-colors v:focus-within:border-ring v:focus-within:ring-3 v:focus-within:ring-ring/50 v:has-aria-invalid:border-destructive v:has-aria-invalid:ring-3 v:has-aria-invalid:ring-destructive/20 v:has-data-[slot=combobox-chip]:px-1 v:dark:bg-input/30 v:dark:has-aria-invalid:border-destructive/50 v:dark:has-aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  removeLabel,
  removeClassName,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
  removeLabel?: string;
  removeClassName?: string;
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "v:flex v:h-[calc(--spacing(5.25))] v:w-fit v:items-center v:justify-center v:gap-1 v:rounded-sm v:bg-muted v:px-1.5 v:text-xs v:font-medium v:whitespace-nowrap v:text-foreground v:has-disabled:pointer-events-none v:has-disabled:cursor-not-allowed v:has-disabled:opacity-50 v:has-data-[slot=combobox-chip-remove]:pr-0",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className={cn(
            "v:-ml-1 v:opacity-50 v:hover:opacity-100",
            removeClassName,
          )}
          aria-label={removeLabel}
          data-slot="combobox-chip-remove"
        >
          <IconX className="v:pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn("v:min-w-16 v:flex-1 v:outline-none", className)}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
};
