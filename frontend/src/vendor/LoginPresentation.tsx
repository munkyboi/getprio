import {
  createContext,
  useContext,
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import * as Mantine from "@mantine/core";
import { Link } from "react-router-dom";
import { ConfigurationScope, ConfigurationInput } from "./ConfigurationUi";
import { ConfigurationPassword } from "./AccountFields";
import {
  OperationAlert,
  OperationButton,
  OperationPanel,
} from "./OperationsUi";
import { VendorAuthLayout } from "./VendorAuthLayout";
const VendorLogin = createContext(false);
const LoginBusy = createContext(false);
export function LoginPresentation({
  vendor,
  busy,
  children,
}: {
  vendor: boolean;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <VendorLogin.Provider value={vendor}><LoginBusy.Provider value={busy}>
      {vendor ? (
        <div className="vendor-login-container"><VendorAuthLayout>
          <ConfigurationScope busy={busy}><div className="vendor-auth-layout vendor-login-layout">{children}<aside className="vendor-auth-guide vendor-login-guide"><img src="/illustrations/generated/vendor-onboarding.png" alt="GetPrio business workspace illustration" /><h2>Your business, in one place</h2><p className="ops-muted">Manage bookings, your queue, services and your team from your workspace.</p></aside></div></ConfigurationScope>
        </VendorAuthLayout></div>
      ) : (
        children
      )}
    </LoginBusy.Provider></VendorLogin.Provider>
  );
}
export function Paper(props: Mantine.PaperProps & { children: ReactNode }) {
  return useContext(VendorLogin) ? (
    <OperationPanel>{props.children}</OperationPanel>
  ) : (
    <Mantine.Paper {...props} />
  );
}
export function Stack(props: Mantine.StackProps) {
  return useContext(VendorLogin) ? (
    <div className="queue-stack">{props.children}</div>
  ) : (
    <Mantine.Stack {...props} />
  );
}
export function Text(props: Mantine.TextProps & { children?: ReactNode }) {
  return useContext(VendorLogin) ? (
    <p className={props.c === "dimmed" ? "ops-muted" : "vendor-eyebrow"}>
      {props.children}
    </p>
  ) : (
    <Mantine.Text {...props} />
  );
}
export function Title(props: Mantine.TitleProps & { children?: ReactNode }) {
  return useContext(VendorLogin) ? (
    <h1>{props.children}</h1>
  ) : (
    <Mantine.Title {...props} />
  );
}
export function Alert(props: Mantine.AlertProps) {
  return useContext(VendorLogin) ? (
    <OperationAlert color={props.color === "red" ? "red" : undefined}>
      {props.children}
    </OperationAlert>
  ) : (
    <Mantine.Alert {...props} />
  );
}
export function Button(
  props: Mantine.ButtonProps & ComponentPropsWithoutRef<"button">,
) {
  return useContext(VendorLogin) ? (
    <OperationButton
      type={props.type || "button"}
      loading={props.loading}
      disabled={props.disabled}
      onClick={props.onClick}
      variant={props.variant === "light" ? "outline" : "default"}
    >
      {props.children}
    </OperationButton>
  ) : (
    <Mantine.Button {...props} />
  );
}
type AnchorProps = Mantine.AnchorProps & {
  children?: ReactNode;
  component?: "button" | typeof Link;
  type?: "button";
  to?: string;
  disabled?: boolean;
  onClick?: () => void;
};
export function Anchor(props: AnchorProps) {
  const busy=useContext(LoginBusy);
  if (!useContext(VendorLogin)) {
    const {component, ...rest} = props;
    if(component === "button") return <Mantine.Anchor component="button" {...rest}/>;
    if(component === Link) return <Mantine.Anchor component={Link} {...rest} to={props.to || "/login"}/>;
    return <Mantine.Anchor {...rest}/>;
  }
  return props.component === "button" ? (
    <OperationButton
      type="button"
      variant="ghost"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </OperationButton>
  ) : (
    <Link className="vendor-auth-link" aria-disabled={busy} tabIndex={busy ? -1 : undefined} onClick={event=>{if(busy)event.preventDefault();}} to={props.to || "/login"}>
      {props.children}
    </Link>
  );
}
export const TextInput = forwardRef<HTMLInputElement, Mantine.TextInputProps>(
  function TextInput(props, ref) {
    const vendor = useContext(VendorLogin);
    return vendor ? (
      <ConfigurationInput
        ref={ref}
        label={props.label}
        description={props.description}
        error={props.error}
        name={props.name}
        value={props.value}
        defaultValue={props.defaultValue}
        onChange={props.onChange}
        onBlur={props.onBlur}
        required={props.required}
        disabled={props.disabled}
        autoComplete={props.autoComplete}
        autoFocus={props.autoFocus}
        type={props.type}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
      />
    ) : (
      <Mantine.TextInput ref={ref} {...props} />
    );
  },
);
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Mantine.PasswordInputProps
>(function PasswordInput(props, ref) {
  const vendor = useContext(VendorLogin);
  return vendor ? (
    <ConfigurationPassword
      ref={ref}
      label={props.label}
      value={props.value}
      defaultValue={props.defaultValue}
      onChange={props.onChange}
      onBlur={props.onBlur}
      name={props.name}
      required={props.required}
      error={props.error}
      autoComplete={props.autoComplete}
      disabled={props.disabled}
    />
  ) : (
    <Mantine.PasswordInput ref={ref} {...props} />
  );
});
