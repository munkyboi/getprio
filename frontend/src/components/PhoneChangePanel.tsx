import { useState } from "react";
import { Alert, Button, Card, Group, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

type StartResponse = { challengeId?: string; step?: "email_otp"; deliveryTarget?: string; expiresAt?: string; user?: { phone: string | null } };

export default function PhoneChangePanel({ token, currentPhone, onCompleted }: { token: string; currentPhone?: string | null; onCompleted?: () => Promise<void> }) {
  const [newPhone, setNewPhone] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"totp" | "email">("totp");
  const [challenge, setChallenge] = useState<StartResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function reset() {
    setChallenge(null); setCode(""); setPassword(""); setTotpCode(""); setSuccess(""); setError("");
  }

  async function startChange() {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await apiRequest<StartResponse, Record<string, string>>("/account/phone-change/start", {
        method: "POST", token, body: { newPhone, method, ...(method === "totp" ? { totpCode } : {}) }
      });
      if (response.user) { setSuccess("Phone number updated successfully."); if (onCompleted) await onCompleted(); }
      else setChallenge(response);
    } catch (requestError) { setError(getErrorMessage(requestError)); } finally { setBusy(false); }
  }

  async function verifyEmail() {
    if (!challenge?.challengeId) return;
    setBusy(true); setError("");
    try {
      await apiRequest("/account/phone-change/verify-email", {
        method: "POST", token, body: { challengeId: challenge.challengeId, code, password }
      });
      setSuccess("Phone number updated successfully."); setChallenge(null);
      if (onCompleted) await onCompleted();
    } catch (requestError) { setError(getErrorMessage(requestError)); } finally { setBusy(false); }
  }

  return <Card className="phone-change-panel" withBorder padding="lg" mt="md">
    <Stack gap="md">
      <div><Text fw={700}>Change phone number</Text><Text c="dimmed" size="sm">Verify the change with your authenticator or your email and password.</Text></div>
      {success ? <Alert color="teal">{success}</Alert> : null}
      {error ? <Alert color="red">{error}</Alert> : null}
      {!challenge ? <>
        <TextInput label="Current phone" value={currentPhone || "Not set"} disabled />
        <TextInput label="New phone number" placeholder="09XXXXXXXXX" inputMode="tel" autoComplete="tel" required value={newPhone} onChange={(event) => setNewPhone(event.target.value)} />
        <Group gap="xs"><Button variant={method === "totp" ? "filled" : "light"} onClick={() => setMethod("totp")}>Use authenticator</Button><Button variant={method === "email" ? "filled" : "light"} onClick={() => setMethod("email")}>Use email and password</Button></Group>
        {method === "totp" ? <TextInput label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} /> : <Alert color="blue" variant="light">We’ll email a one-time code to your current email. Your password is required when you confirm it.</Alert>}
        <Button loading={busy} disabled={!newPhone.trim() || (method === "totp" && totpCode.length !== 6)} onClick={() => void startChange()}>Continue</Button>
      </> : <>
        <Alert color="blue" variant="light">Enter the code sent to {challenge.deliveryTarget}. It expires in 10 minutes.</Alert>
        <TextInput label="Email verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
        <PasswordInput label="Current password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Group justify="space-between"><Button variant="subtle" onClick={reset}>Cancel</Button><Button loading={busy} disabled={code.length !== 6 || !password} onClick={() => void verifyEmail()}>Confirm phone number</Button></Group>
      </>}
    </Stack>
  </Card>;
}
