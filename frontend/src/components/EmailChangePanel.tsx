import { useState } from "react";
import { Alert, Button, Card, Group, PasswordInput, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

type EmailChangeStep = "start" | "current_email" | "new_email" | "complete";
type StartResponse = { challengeId: string; step: EmailChangeStep; deliveryTarget: string; expiresAt: string };

export default function EmailChangePanel({ token, currentEmail, onCompleted }: { token: string; currentEmail: string; onCompleted?: () => Promise<void> }) {
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"current_email" | "mfa">("current_email");
  const [step, setStep] = useState<EmailChangeStep>("start");
  const [challenge, setChallenge] = useState<StartResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function reset() {
    setStep("start");
    setChallenge(null);
    setCode("");
    setPassword("");
    setTotpCode("");
    setSuccess("");
    setError("");
  }

  async function startChange() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await apiRequest<StartResponse, Record<string, string>>("/account/email-change/start", {
        method: "POST",
        token,
        body: { newEmail, method, ...(method === "mfa" ? { password, totpCode } : {}) }
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

  async function verifyCurrent() {
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<StartResponse, { challengeId: string; code: string }>("/account/email-change/verify-current", {
        method: "POST",
        token,
        body: { challengeId: challenge.challengeId, code }
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
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/account/email-change/verify-new", {
        method: "POST",
        token,
        body: { challengeId: challenge.challengeId, code }
      });
      setStep("complete");
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
          <Text c="dimmed" size="sm">Your current email stays active until both verification steps are complete.</Text>
        </div>

        {success ? <Alert color="teal">{success}</Alert> : null}
        {error ? <Alert color="red">{error}</Alert> : null}

        {step === "start" ? <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput label="Current email" value={currentEmail || "Not set"} disabled />
            <TextInput autoComplete="email" label="New email address" placeholder="you@example.com" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
          </SimpleGrid>

          <Group gap="xs">
            <Button aria-pressed={method === "current_email"} className={method === "current_email" ? "email-change-option is-selected" : "email-change-option"} onClick={() => setMethod("current_email")} variant="light">
              I can access my current email
            </Button>
            <Button aria-pressed={method === "mfa"} className={method === "mfa" ? "email-change-option is-selected" : "email-change-option"} onClick={() => setMethod("mfa")} variant="light">
              I can’t access it
            </Button>
          </Group>

          {method === "mfa" ? <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <PasswordInput autoComplete="current-password" label="Current password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <TextInput autoComplete="one-time-code" inputMode="numeric" label="Authenticator code" maxLength={6} placeholder="6 digits" required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} />
          </SimpleGrid> : <Alert color="blue" variant="light">We’ll send a one-time code to your current email first.</Alert>}

          <Button disabled={!newEmail.trim() || (method === "mfa" && (password.length === 0 || totpCode.length !== 6))} loading={busy} onClick={() => void startChange()}>Continue</Button>
        </> : null}

        {step === "current_email" && challenge ? <>
          <Alert color="blue" variant="light">Enter the 6-digit code sent to {challenge.deliveryTarget}. It expires in 10 minutes.</Alert>
          <TextInput autoComplete="one-time-code" inputMode="numeric" label="Current email code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          <Group justify="space-between"><Button variant="subtle" onClick={reset}>Start over</Button><Button disabled={code.length !== 6} loading={busy} onClick={() => void verifyCurrent()}>Verify current email</Button></Group>
        </> : null}

        {step === "new_email" && challenge ? <>
          <Alert color="blue" variant="light">Enter the 6-digit code sent to {challenge.deliveryTarget}. Your email will be replaced only after this code is verified.</Alert>
          <TextInput autoComplete="one-time-code" inputMode="numeric" label="New email code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          <Group justify="space-between"><Button variant="subtle" onClick={reset}>Cancel</Button><Button disabled={code.length !== 6} loading={busy} onClick={() => void verifyNew()}>Confirm new email</Button></Group>
        </> : null}

        {step === "complete" ? <Button variant="light" onClick={reset}>Change it again</Button> : null}
      </Stack>
    </Card>
  );
}
