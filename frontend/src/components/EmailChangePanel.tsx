import {
  useAccountTask,
  useVendorAccount,
  discardAccountTask,
} from "../vendor/AccountPresentation";
import { OtpInputField } from "./OtpInputField";
import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "../vendor/AccountFields";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

type EmailChangeStep = "start" | "current_email" | "new_email" | "complete";
type StartResponse = {
  challengeId: string;
  step: EmailChangeStep;
  deliveryTarget: string;
  expiresAt: string;
};

export default function EmailChangePanel({
  token,
  currentEmail,
  onCompleted,
}: {
  token: string;
  currentEmail: string;
  onCompleted?: () => Promise<void>;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"current_email" | "mfa">(
    "current_email",
  );
  const [step, setStep] = useState<EmailChangeStep>("start");
  const [challenge, setChallenge] = useState<StartResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const vendor = useVendorAccount();
  useAccountTask(
    busy,
    step !== "complete" &&
      Boolean(newEmail || password || totpCode || code || challenge),
  );

  function reset() {
    if (
      busy ||
      !discardAccountTask(
        vendor,
        Boolean(newEmail || password || totpCode || code),
      )
    )
      return;
    setStep("start");
    setChallenge(null);
    setCode("");
    setPassword("");
    setTotpCode("");
    setSuccess("");
    setError("");
  }

  async function startChange() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiRequest<StartResponse, Record<string, string>>(
        "/account/email-change/start",
        {
          method: "POST",
          token,
          body: {
            newEmail,
            method,
            ...(method === "mfa" ? { password, totpCode } : {}),
          },
        },
      );
      setChallenge(response);
      setStep(response.step);
      setCode("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCurrent() {
    if (busy) return;
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<
        StartResponse,
        { challengeId: string; code: string }
      >("/account/email-change/verify-current", {
        method: "POST",
        token,
        body: { challengeId: challenge.challengeId, code },
      });
      setChallenge(response);
      setStep(response.step);
      setCode("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function verifyNew() {
    if (busy) return;
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/account/email-change/verify-new", {
        method: "POST",
        token,
        body: { challengeId: challenge.challengeId, code },
      });
      setStep("complete");
      if (vendor) {
        setPassword("");
        setTotpCode("");
        setCode("");
        setChallenge(null);
      }
      setSuccess("Your email address has been changed successfully.");
      if (onCompleted) await onCompleted();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="email-change-panel" withBorder padding="lg">
      <Stack gap="md">
        <div>
          <Text fw={700}>Change email address</Text>
          <Text c="dimmed" size="sm">
            Your current email stays active until both verification steps are
            complete.
          </Text>
        </div>

        {success ? <Alert color="teal">{success}</Alert> : null}
        {error ? <Alert color="red">{error}</Alert> : null}

        {step === "start" ? (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="Current email"
                value={currentEmail || "Not set"}
                disabled
              />
              <TextInput
                type="email"
                autoComplete="email"
                label="New email address"
                placeholder="you@example.com"
                required
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </SimpleGrid>

            <Group gap="xs">
              <Button
                aria-pressed={method === "current_email"}
                className={
                  method === "current_email"
                    ? "email-change-option is-selected"
                    : "email-change-option"
                }
                disabled={busy}
                onClick={() => setMethod("current_email")}
                variant="light"
              >
                I can access my current email
              </Button>
              <Button
                aria-pressed={method === "mfa"}
                className={
                  method === "mfa"
                    ? "email-change-option is-selected"
                    : "email-change-option"
                }
                disabled={busy}
                onClick={() => setMethod("mfa")}
                variant="light"
              >
                I can’t access it
              </Button>
            </Group>

            {method === "mfa" ? (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <PasswordInput
                  autoComplete="current-password"
                  label="Current password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <OtpInputField
                  label="Authenticator code"
                  value={totpCode}
                  onChange={setTotpCode}
                  disabled={busy}
                  onVerify={startChange}
                  autoVerifyEnabled={Boolean(newEmail.trim() && password)}
                  required
                />
              </SimpleGrid>
            ) : (
              <Alert color="blue" variant="light">
                We’ll send a one-time code to your current email first.
              </Alert>
            )}

            <Button
              disabled={
                !newEmail.trim() ||
                (method === "mfa" &&
                  (password.length === 0 || totpCode.length !== 6))
              }
              loading={busy}
              onClick={() => void startChange()}
            >
              Continue
            </Button>
          </>
        ) : null}

        {step === "current_email" && challenge ? (
          <>
            <Alert color="blue" variant="light">
              Enter the 6-digit code sent to {challenge.deliveryTarget}. It
              expires in 10 minutes.
            </Alert>
            <OtpInputField
              label="Current email code"
              value={code}
              onChange={setCode}
              disabled={busy}
              onVerify={verifyCurrent}
              verificationKey={`${challenge?.challengeId}:current`}
            />
            <Group justify="space-between">
              <Button variant="subtle" onClick={reset}>
                Start over
              </Button>
              <Button
                disabled={code.length !== 6}
                loading={busy}
                onClick={() => void verifyCurrent()}
              >
                Verify current email
              </Button>
            </Group>
          </>
        ) : null}

        {step === "new_email" && challenge ? (
          <>
            <Alert color="blue" variant="light">
              Enter the 6-digit code sent to {challenge.deliveryTarget}. Your
              email will be replaced only after this code is verified.
            </Alert>
            <OtpInputField
              label="New email code"
              value={code}
              onChange={setCode}
              disabled={busy}
              onVerify={verifyNew}
              verificationKey={`${challenge?.challengeId}:new`}
            />
            <Group justify="space-between">
              <Button variant="subtle" onClick={reset}>
                Cancel
              </Button>
              <Button
                disabled={code.length !== 6}
                loading={busy}
                onClick={() => void verifyNew()}
              >
                Confirm new email
              </Button>
            </Group>
          </>
        ) : null}

        {step === "complete" ? (
          <Button variant="light" onClick={reset}>
            Change it again
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
