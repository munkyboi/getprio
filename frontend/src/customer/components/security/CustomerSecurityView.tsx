import { Field, FieldLabel } from "../shadcn/field";
import { CustomerDrawerActions } from "../vendor/ResponsiveDrawer";
import { createContext, useContext, useState } from "react";
import { usePersonalInfoCommand } from "./PersonalInfoDrawer";
export const CustomerSecurityTask = createContext<
  "all" | "password" | "mfa" | "deletion"
>("all");
import type { CustomerSecurityPresentationModel } from "../../../pages/CustomerAccountPage";
import { EmailMfaSettingsPanel } from "../../../components/EmailMfaSettingsPanel";
import { AccountDeletionPanel } from "../../../components/AccountDeletionPanel";
import StyledQRCode from "../../../components/StyledQRCode";
import { Checkbox } from "../shadcn/checkbox";
import { Alert, Button, Input, Badge } from "../ui";
import { Info as IconInfoCircle } from "lucide-react";
import { ControlledDrawer } from "../details/ControlledDrawer";
import { CustomerOtpField } from "./CustomerOtpField";
import {
  PasswordField,
  CustomerEmailMfaView,
  CustomerDeletionView,
} from "./CustomerVerifiedChanges";
export function CustomerSecurityView({
  model: m,
}: {
  model: CustomerSecurityPresentationModel;
}) {
  const task = useContext(CustomerSecurityTask);
  const [confirmation, setConfirmation] = useState("");
  const [confirmationError, setConfirmationError] = useState("");
  usePersonalInfoCommand(
    "security",
    m.changingPassword || m.mfaBusy || m.mfaRemovalBusy,
    Boolean(
      confirmation ||
      m.passwordForm.currentPassword ||
        m.passwordForm.newPassword ||
        m.mfaSecret ||
        m.mfaCode ||
        m.mfaRemovalOpened,
    ),
    () => {
      m.setPasswordForm({ currentPassword: "", newPassword: "" });
      setConfirmation("");
      setConfirmationError("");
      m.resetEnrollmentDraft();
      m.closeMfaRemoval();
    },
  );
  return (
    <div className="customer-page-stack">
      {task === "all" || task === "password" ? (
        <section className="customer-security-task">
          <form
            id="customer-password-form"
            className="customer-page-stack"
            onSubmit={(event) => {
              if (confirmation !== m.passwordForm.newPassword) { event.preventDefault(); setConfirmationError("Your new passwords do not match."); return; }
              setConfirmationError("");
              void m.handlePasswordChange(event);
            }}
          >
            <PasswordField
              label="Current password"
              value={m.passwordForm.currentPassword}
              disabled={m.changingPassword}
              required
              onChange={(v) =>
                m.setPasswordForm((f) => ({ ...f, currentPassword: v }))
              }
            />
            <PasswordField
              label="New password"
              value={m.passwordForm.newPassword}
              disabled={m.changingPassword}
              required
              onChange={(v) =>
                m.setPasswordForm((f) => ({ ...f, newPassword: v }))
              }
            />
            <PasswordField label="Confirm new password" value={confirmation} disabled={m.changingPassword} required onChange={setConfirmation} />
            <p className="customer-muted">Updating your password signs out your active sessions.</p>
            {confirmationError ? <Alert role="alert">{confirmationError}</Alert> : null}
            <CustomerDrawerActions>
              <Button
                form="customer-password-form"
                type="submit"
                disabled={m.changingPassword}
              >
                Change password
              </Button>
            </CustomerDrawerActions>
          </form>
        </section>
      ) : null}
      {task === "all" || task === "mfa" ? (
        <>
          <section className="customer-security-task">
            <p>
              {m.required
                ? "Keep an authenticator or email verification enabled for this account."
                : "Add an extra sign-in check with an authenticator or email code."}
            </p>
            {m.mfaRecoveryCodes.length ? (
              <Alert data-intent="success">
                <IconInfoCircle />
                <div>
                  <strong>Save these one-time recovery codes</strong>
                  {m.mfaRecoveryCodes.map((code) => (
                    <pre key={code}>{code}</pre>
                  ))}
                </div>
              </Alert>
            ) : null}
            <div className="customer-inline-between"><h3>Authenticator app</h3><Badge data-intent={m.totpMfaEnabled ? "success" : "neutral"}>{m.totpMfaEnabled ? "Enabled" : "Not enabled"}</Badge></div>
            {!m.totpMfaEnabled && !m.mfaSecret ? (
              <Button
                disabled={m.mfaBusy}
                onClick={() => void m.startMfaEnrollment()}
              >
                Set up authenticator
              </Button>
            ) : null}
            {m.mfaSecret ? (
              <div className="customer-page-stack">
                <p>Scan this code with your authenticator app.</p>
                <StyledQRCode size={192} value={m.mfaUri} />
                <p>Or enter this secret manually:</p>
                <code className="customer-sensitive-code">{m.mfaSecret}</code>
                <a href={m.mfaUri}>Open authenticator setup</a>
                <CustomerOtpField
                  label="6-digit authenticator code"
                  value={m.mfaCode}
                  onChange={m.setMfaCode}
                  disabled={m.mfaBusy}
                  onVerify={m.confirmMfaEnrollment}
                  autoVerifyEnabled={Boolean(m.mfaSecret)}
                  verificationKey={m.mfaSecret}
                />
                <Button
                  disabled={m.mfaBusy || m.mfaCode.length !== 6}
                  onClick={() => void m.confirmMfaEnrollment()}
                >
                  Verify and enable
                </Button>
              </div>
            ) : null}
            {m.totpMfaEnabled && !m.mfaRecoveryCodes.length ? (
              <>
                <p>Your authenticator is active.</p>
                {!m.required ? (
                  <Button
                    variant="outline"
                    onClick={() => m.setMfaRemovalOpened(true)}
                  >
                    Remove authenticator
                  </Button>
                ) : null}
              </>
            ) : null}
          </section>
          <EmailMfaSettingsPanel
            variant="customer"
            onUpdated={m.refresh}
            renderPresentation={(model) => (
              <CustomerEmailMfaView model={model} />
            )}
          />
        </>
      ) : null}
      {task === "all" || task === "deletion" ? (
        <AccountDeletionPanel
          accountType="customer"
          renderPresentation={(model) => <CustomerDeletionView model={model} />}
        />
      ) : null}
      <ControlledDrawer
        title="Remove authenticator app"
        open={m.mfaRemovalOpened}
        busy={m.mfaRemovalBusy}
        onOpenChange={(v) => {
          if (!v) m.closeMfaRemoval();
        }}
        footer={
          <Button
            disabled={
              m.mfaRemovalBusy ||
              !m.mfaRemovalPassword ||
              (!m.mfaRemovalRecoveryCode.trim() &&
                m.mfaRemovalCode.length !== 6) ||
              !m.mfaRemovalAcknowledged
            }
            onClick={() => void m.removeMfa()}
          >
            Remove authenticator
          </Button>
        }
      >
        <div className="customer-page-stack">
          <Alert data-intent="warning">
            <IconInfoCircle />
            <p>
              This revokes your authenticator and recovery codes.{" "}
              {m.emailMfaEnabled
                ? "Email codes will remain enabled."
                : "Your account will no longer have multi-factor authentication."}{" "}
              Other sessions will close.
            </p>
          </Alert>
          <PasswordField
            label="Current password"
            value={m.mfaRemovalPassword}
            onChange={m.setMfaRemovalPassword}
            required
            disabled={m.mfaRemovalBusy}
          />
          <CustomerOtpField
            label="Current authenticator code"
            value={m.mfaRemovalCode}
            onChange={m.setMfaRemovalCode}
            disabled={m.mfaRemovalBusy}
            onVerify={m.removeMfa}
            autoVerifyEnabled={
              Boolean(m.mfaRemovalPassword) &&
              m.mfaRemovalAcknowledged &&
              !m.mfaRemovalRecoveryCode
            }
            description="Use this or an unused recovery code below."
          />
          <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
            Recovery code
            <Input
              autoComplete="off"
              value={m.mfaRemovalRecoveryCode}
              disabled={m.mfaRemovalBusy}
              onChange={(e) => m.setMfaRemovalRecoveryCode(e.target.value)}
            />
          </FieldLabel></Field>
          <FieldLabel className="customer-resource-choice">
            <Checkbox
              className="customer-booking-checkbox"
              checked={m.mfaRemovalAcknowledged}
              disabled={m.mfaRemovalBusy}
              onCheckedChange={m.setMfaRemovalAcknowledged}
             />
            I understand that removing MFA reduces my account security.
          </FieldLabel>
          <Button
            variant="outline"
            disabled={m.mfaRemovalBusy}
            onClick={m.closeMfaRemoval}
          >
            Keep MFA
          </Button>
        </div>
      </ControlledDrawer>
    </div>
  );
}
