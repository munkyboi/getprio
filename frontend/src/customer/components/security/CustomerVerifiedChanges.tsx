import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../shadcn/input-group";
import { ToggleGroup, ToggleGroupItem } from "../shadcn/toggle-group";
import { Field, FieldLabel } from "../shadcn/field";
import { useId, useState } from "react";
import { usePersonalInfoCommand } from "./PersonalInfoDrawer";
import type { EmailChangePresentationModel } from "../../../components/EmailChangePanel";
import type { PhoneChangePresentationModel } from "../../../components/PhoneChangePanel";
import type { EmailMfaPresentationModel } from "../../../components/EmailMfaSettingsPanel";
import type { AccountDeletionPresentationModel } from "../../../components/AccountDeletionPanel";
import {
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Info as IconInfoCircle,
} from "lucide-react";
import { Alert, Button, Input } from "../ui";
import { ControlledDrawer } from "../details/ControlledDrawer";
import { CustomerOtpField } from "./CustomerOtpField";
export function PasswordField({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <Field className="customer-shadcn-field"><FieldLabel htmlFor={id}>
      {label}
    </FieldLabel>
      <InputGroup className="customer-password-input">
        <InputGroupInput
          id={id}
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={value}
          required={required}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <InputGroupAddon align="inline-end"><InputGroupButton
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={show ? "Hide password" : "Show password"}
          onClick={() => setShow(!show)}
        >
          {show ? <IconEyeOff /> : <IconEye />}
        </InputGroupButton></InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
function Messages({ error, success }: { error: string; success?: string }) {
  return (
    <>
      {error ? (
        <Alert data-intent="error">
          <IconInfoCircle />
          {error}
        </Alert>
      ) : null}
      {success ? (
        <Alert data-intent="success">
          <IconInfoCircle />
          {success}
        </Alert>
      ) : null}
    </>
  );
}
export function CustomerEmailChangeView({
  model: m,
}: {
  model: EmailChangePresentationModel;
}) {
  usePersonalInfoCommand(
    "email",
    m.busy,
    Boolean(m.newEmail || m.password || m.totpCode || m.code || m.challenge),
    m.reset,
  );
  return (
    <section className="customer-page-stack">
      <h2>Change email address</h2>
      <p>
        Your current email stays active until both verification steps are
        complete.
      </p>
      <Messages error={m.error} success={m.success} />
      {m.step === "start" ? (
        <>
          <p>Current email: {m.currentEmail || "Not set"}</p>
          <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
            New email address
            <Input
              type="email"
              autoComplete="email"
              required
              disabled={m.busy}
              value={m.newEmail}
              onChange={(e) => m.setNewEmail(e.target.value)}
            />
          </FieldLabel></Field>
          <ToggleGroup className="customer-action-row" value={[m.method]} onValueChange={(values) => { const value=values[0]; if (value === "current_email" || value === "mfa") m.setMethod(value); }}>
            <ToggleGroupItem variant="outline" className="customer-button customer-button-outline customer-button-default" value="current_email" disabled={m.busy}>
              I can access my current email
            </ToggleGroupItem>
            <ToggleGroupItem variant="outline" className="customer-button customer-button-outline customer-button-default" value="mfa" disabled={m.busy}>
              I can’t access it
            </ToggleGroupItem>
          </ToggleGroup>
          {m.method === "mfa" ? (
            <>
              <PasswordField
                label="Current password"
                value={m.password}
                onChange={m.setPassword}
                disabled={m.busy}
                required
              />
              <CustomerOtpField
                label="Authenticator code"
                value={m.totpCode}
                onChange={m.setTotpCode}
                disabled={m.busy}
                onVerify={m.startChange}
                autoVerifyEnabled={Boolean(m.newEmail.trim() && m.password)}
                required
              />
            </>
          ) : (
            <Alert data-intent="info">
              <IconInfoCircle />
              We’ll send a one-time code to your current email first.
            </Alert>
          )}
          <Button
            disabled={
              m.busy ||
              !m.newEmail.trim() ||
              (m.method === "mfa" && (!m.password || m.totpCode.length !== 6))
            }
            onClick={() => void m.startChange()}
          >
            Continue
          </Button>
        </>
      ) : null}
      {m.challenge && (m.step === "current_email" || m.step === "new_email") ? (
        <>
          <p>
            Enter the code sent to {m.challenge.deliveryTarget}. It expires in
            10 minutes.
          </p>
          <CustomerOtpField
            label={
              m.step === "current_email"
                ? "Current email code"
                : "New email code"
            }
            value={m.code}
            onChange={m.setCode}
            disabled={m.busy}
            onVerify={
              m.step === "current_email" ? m.verifyCurrent : m.verifyNew
            }
            verificationKey={`${m.challenge.challengeId}:${m.step === "current_email" ? "current" : "new"}`}
          />
          <div className="customer-action-row">
            <Button variant="outline" disabled={m.busy} onClick={m.reset}>
              Cancel
            </Button>
            <Button
              disabled={m.busy || m.code.length !== 6}
              onClick={() =>
                void (m.step === "current_email"
                  ? m.verifyCurrent()
                  : m.verifyNew())
              }
            >
              {m.step === "current_email"
                ? "Verify current email"
                : "Verify new email"}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
export function CustomerPhoneChangeView({
  model: m,
}: {
  model: PhoneChangePresentationModel;
}) {
  usePersonalInfoCommand(
    "phone",
    m.busy,
    Boolean(m.newPhone || m.password || m.totpCode || m.code || m.challenge),
    m.reset,
  );
  return (
    <section className="customer-page-stack">
      <h2>Change phone number</h2>
      <p>
        Verify the change with your authenticator or your email and password.
      </p>
      <Messages error={m.error} success={m.success} />
      {!m.challenge ? (
        <>
          <p>Current phone: {m.currentPhone || "Not set"}</p>
          <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
            New phone number
            <Input
              type="tel"
              autoComplete="tel"
              required
              disabled={m.busy}
              value={m.newPhone}
              onChange={(e) => m.setNewPhone(e.target.value)}
            />
          </FieldLabel></Field>
          <ToggleGroup className="customer-action-row" value={[m.method]} onValueChange={(values) => { const value=values[0]; if (value === "totp" || value === "email") m.setMethod(value); }}>
            <ToggleGroupItem variant="outline" className="customer-button customer-button-outline customer-button-default" value="totp" disabled={m.busy}>
              Use authenticator
            </ToggleGroupItem>
            <ToggleGroupItem variant="outline" className="customer-button customer-button-outline customer-button-default" value="email" disabled={m.busy}>
              Use email and password
            </ToggleGroupItem>
          </ToggleGroup>
          {m.method === "totp" ? (
            <CustomerOtpField
              label="Authenticator code"
              value={m.totpCode}
              onChange={m.setTotpCode}
              disabled={m.busy}
              onVerify={m.startChange}
              autoVerifyEnabled={Boolean(m.newPhone.trim())}
            />
          ) : (
            <p>
              We’ll email a code to your current email. Your password is
              required when you confirm it.
            </p>
          )}
          <Button
            disabled={
              m.busy ||
              !m.newPhone.trim() ||
              (m.method === "totp" && m.totpCode.length !== 6)
            }
            onClick={() => void m.startChange()}
          >
            Continue
          </Button>
        </>
      ) : (
        <>
          <p>Enter the code sent to {m.challenge.deliveryTarget}.</p>
          <PasswordField
            label="Current password"
            value={m.password}
            onChange={m.setPassword}
            disabled={m.busy}
          />
          <CustomerOtpField
            label="Email verification code"
            value={m.code}
            onChange={m.setCode}
            disabled={m.busy}
            onVerify={m.verifyEmail}
            autoVerifyEnabled={Boolean(m.password)}
            verificationKey={m.challenge.challengeId}
          />
          <div className="customer-action-row">
            <Button variant="outline" disabled={m.busy} onClick={m.reset}>
              Cancel
            </Button>
            <Button
              disabled={m.busy || m.code.length !== 6 || !m.password}
              onClick={() => void m.verifyEmail()}
            >
              Confirm phone number
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
export function CustomerEmailMfaView({
  model: m,
}: {
  model: EmailMfaPresentationModel;
}) {
  usePersonalInfoCommand(
    "email-mfa",
    m.busy,
    Boolean(m.disableOpened || m.password),
    m.closeDisable,
  );
  return (
    <>
      <section className="customer-security-task">
        <h3>Email verification at sign-in</h3>
        <p>Receive a sign-in code at your verified email address.</p>
        <Messages error={m.error} />
        {m.requiredMethodCannotBeRemoved && m.isEnabled ? (
          <Alert data-intent="info">
            <IconInfoCircle />
            Keep at least one verification method enabled. Set up an
            authenticator before disabling email codes.
          </Alert>
        ) : null}
        {m.isEnabled ? (
          <Button
            variant="outline"
            disabled={m.busy || m.requiredMethodCannotBeRemoved}
            onClick={() => m.setDisableOpened(true)}
          >
            Disable Email OTP
          </Button>
        ) : (
          <Button
            disabled={m.busy || !m.isVerified}
            onClick={() => void m.updateEmailMfa(true)}
          >
            Enable Email OTP
          </Button>
        )}
        {!m.isVerified ? <p>Verify your email address first.</p> : null}
      </section>
      <ControlledDrawer
        title="Disable Email OTP"
        open={m.disableOpened}
        busy={m.busy}
        onOpenChange={(v) => {
          if (!v) m.closeDisable();
        }}
        footer={
          <Button
            disabled={m.busy || (m.hasPassword && !m.password)}
            onClick={() => void m.updateEmailMfa(false)}
          >
            Disable Email OTP
          </Button>
        }
      >
        <div className="customer-page-stack">
          <Alert data-intent="warning">
            <IconInfoCircle />
            {m.totpEnabled
              ? "Email codes will stop working. Your authenticator app will stay enabled."
              : "Email codes are your only active sign-in verification method. Disabling them will leave your account without two-step verification."}
          </Alert>
          {m.hasPassword ? (
            <PasswordField
              label="Current password"
              value={m.password}
              onChange={m.setPassword}
              disabled={m.busy}
              required
            />
          ) : (
            <Alert data-intent="info">
              <IconInfoCircle />
              You signed in with a provider. To disable email codes, sign in
              again with that provider if more than five minutes have passed.
            </Alert>
          )}
          <Messages error={m.error} />
          <Button variant="outline" disabled={m.busy} onClick={m.closeDisable}>
            Keep Email OTP
          </Button>
        </div>
      </ControlledDrawer>
    </>
  );
}
export function CustomerDeletionView({
  model: m,
}: {
  model: AccountDeletionPresentationModel;
}) {
  usePersonalInfoCommand(
    "delete-account",
    m.preparing || m.submitting,
    Boolean(m.dialogOpen || m.password),
    m.closeDeletion,
  );
  return (
    <>
      <section className="customer-security-task">
        <p>{m.accountDescription}</p>
        <p>{m.activityWarning}</p>
        <Messages error={m.error} />
        <Button
          variant="outline"
          disabled={m.preparing || m.submitting}
          onClick={() => void m.prepareRequest()}
        >
          {m.preparing ? "Checking account…" : "Request account deletion"}
        </Button>
      </section>
      <ControlledDrawer
        title="Request account deletion"
        open={m.dialogOpen}
        onOpenChange={(v) => {
          if (!v) m.closeDeletion();
        }}
        busy={m.submitting}
        footer={
          <Button
            disabled={m.submitting || (m.passwordRequired && !m.password)}
            onClick={() => void m.submitRequest()}
          >
            {m.submitting ? "Submitting…" : "Submit deletion request"}
          </Button>
        }
      >
        <div className="customer-page-stack">
          <Alert data-intent="warning">
            <IconInfoCircle />
            {m.activityWarning}
          </Alert>
          {m.passwordRequired ? (
            <PasswordField
              label="Current password"
              value={m.password}
              onChange={m.setPassword}
              disabled={m.submitting}
              required
            />
          ) : (
            <Alert data-intent="info">
              <IconInfoCircle />
              You signed in with a provider. If more than five minutes have
              passed, sign in again with that provider before requesting
              deletion.
            </Alert>
          )}
          <Messages error={m.error} />
          <Button
            variant="outline"
            disabled={m.submitting}
            onClick={m.closeDeletion}
          >
            Keep account
          </Button>
        </div>
      </ControlledDrawer>
    </>
  );
}
