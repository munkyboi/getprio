import {
  useState,
  forwardRef,
  type ComponentProps,
  type CSSProperties,
  type ComponentPropsWithoutRef,
} from "react";
import * as Mantine from "@mantine/core";
import { accountGridColumns } from "./accountGridState";
import { useVendorAccount } from "./AccountPresentation";
import { ConfigurationInput } from "./ConfigurationUi";
import {
  OperationAlert,
  OperationButton,
  OperationPanel,
} from "./OperationsUi";
import { Badge as VendorBadge } from "./components/ui/badge";
import { TaskDialog } from "./TaskDialog";
import type { ReactNode } from "react";

export const ConfigurationPassword = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof ConfigurationInput>
>(function ConfigurationPassword(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="queue-stack">
      <ConfigurationInput
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
      />
      <OperationButton
        variant="ghost"
        disabled={props.disabled}
        aria-pressed={visible}
        aria-label={`${visible ? "Hide" : "Show"} ${String(props.label).toLowerCase()}`}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? "Hide password" : "Show password"}
      </OperationButton>
    </div>
  );
});

// Narrow presentation adapters let shared account tasks retain their existing handlers.
export function Card(
  props: Mantine.CardProps & ComponentPropsWithoutRef<"div">,
) {
  const vendor = useVendorAccount();
  return vendor ? (
    <OperationPanel>{props.children}</OperationPanel>
  ) : (
    <Mantine.Card {...props} />
  );
}
export function Stack(props: ComponentProps<typeof Mantine.Stack>) {
  const vendor = useVendorAccount();
  return vendor ? (
    <div
      className={`queue-stack ${props.align === "center" ? "account-centered" : ""} ${props.className || ""}`}
    >
      {props.children}
    </div>
  ) : (
    <Mantine.Stack {...props} />
  );
}
export function Group(props: ComponentProps<typeof Mantine.Group>) {
  const vendor = useVendorAccount();
  return vendor ? (
    <div
      className={`ops-row config-actions ${props.justify === "space-between" ? "ops-between" : ""}`}
    >
      {props.children}
    </div>
  ) : (
    <Mantine.Group {...props} />
  );
}
export function SimpleGrid(props: ComponentProps<typeof Mantine.SimpleGrid>) {
  const vendor = useVendorAccount();
  return vendor ? (
    <div className="account-responsive-grid" style={accountGridColumns(props.cols) as CSSProperties}>{props.children}</div>
  ) : (
    <Mantine.SimpleGrid {...props} />
  );
}
export function Text(props: Mantine.TextProps & ComponentPropsWithoutRef<"p">) {
  const vendor = useVendorAccount();
  return vendor ? (
    <p
      style={props.style}
      className={`${props.c === "dimmed" ? "ops-muted" : props.fw ? "ops-strong" : ""} ${props.ff === "monospace" ? "account-secret" : ""} ${props.className || ""}`}
    >
      {props.children}
    </p>
  ) : (
    <Mantine.Text {...props} />
  );
}
export function Title(props: ComponentProps<typeof Mantine.Title>) {
  const vendor = useVendorAccount();
  return vendor ? (
    <h2 className="account-panel-title">{props.children}</h2>
  ) : (
    <Mantine.Title {...props} />
  );
}
export function Alert(props: ComponentProps<typeof Mantine.Alert>) {
  const vendor = useVendorAccount();
  return vendor ? (
    <OperationAlert
      title={typeof props.title === "string" ? props.title : undefined}
      color={props.color === "red" ? "red" : undefined}
    >
      {props.children}
    </OperationAlert>
  ) : (
    <Mantine.Alert {...props} />
  );
}
export function Badge(
  props: Mantine.BadgeProps & ComponentPropsWithoutRef<"div">,
) {
  const vendor = useVendorAccount();
  return vendor ? (
    <VendorBadge variant={props.color === "red" ? "destructive" : props.color === "green" || props.color === "teal" ? "success" : props.color === "orange" || props.color === "yellow" ? "warning" : props.color === "blue" ? "info" : "secondary"}>{props.children}</VendorBadge>
  ) : (
    <Mantine.Badge {...props} />
  );
}
export function Button(
  props: Mantine.ButtonProps & ComponentPropsWithoutRef<"button">,
) {
  const vendor = useVendorAccount();
  return vendor ? (
    <OperationButton
      type={props.type || "button"}
      disabled={props.disabled}
      loading={props.loading}
      onClick={props.onClick}
      aria-pressed={props["aria-pressed"]}
      variant={
        props.color === "red"
          ? "destructive"
          : props["aria-pressed"] === true
            ? "default"
            : props.variant === "default" || props.variant === "light"
              ? "outline"
              : props.variant === "subtle"
                ? "ghost"
                : "default"
      }
    >
      {props.children}
    </OperationButton>
  ) : (
    <Mantine.Button {...props} />
  );
}
export function TextInput(props: ComponentProps<typeof Mantine.TextInput>) {
  const vendor = useVendorAccount();
  return vendor ? (
    <ConfigurationInput
      label={props.label}
      description={props.description}
      error={props.error}
      name={props.name}
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      required={props.required}
      type={props.type}
      autoComplete={props.autoComplete}
      inputMode={props.inputMode}
      placeholder={props.placeholder}
      maxLength={props.maxLength}
    />
  ) : (
    <Mantine.TextInput {...props} />
  );
}
export function PasswordInput(
  props: ComponentProps<typeof Mantine.PasswordInput>,
) {
  const vendor = useVendorAccount();
  return vendor ? (
    <ConfigurationPassword
      label={props.label}
      description={props.description}
      error={props.error}
      name={props.name}
      value={props.value}
      onChange={props.onChange}
      disabled={props.disabled}
      required={props.required}
      autoComplete={props.autoComplete}
    />
  ) : (
    <Mantine.PasswordInput {...props} />
  );
}
export function Modal({
  vendorFooter,
  eyebrow = "ACCOUNT SECURITY",
  busy = false,
  ...props
}: ComponentProps<typeof Mantine.Modal> & {
  vendorFooter?: ReactNode;
  eyebrow?: string;
  busy?: boolean;
}) {
  const vendor = useVendorAccount();
  return vendor ? (
    <TaskDialog
      opened={props.opened}
      onClose={props.onClose}
      busy={busy}
      eyebrow={eyebrow}
      title={
        typeof props.title === "string" ? props.title : "Confirm account change"
      }
      footer={vendorFooter}
    >
      {props.children}
    </TaskDialog>
  ) : (
    <Mantine.Modal {...props} />
  );
}
