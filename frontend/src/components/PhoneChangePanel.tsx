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
  Stack,
  Text,
  TextInput,
} from "../vendor/AccountFields";
import { apiRequest } from "../api/client";
import { getErrorMessage } from "../utils/errors";

type StartResponse = {
  challengeId?: string;
  step?: "email_otp";
  deliveryTarget?: string;
  expiresAt?: string;
  user?: { phone: string | null };
};

export default function PhoneChangePanel({
  token,
  currentPhone,
  onCompleted,
}: {
  token: string;
  currentPhone?: string | null;
  onCompleted?: () => Promise<void>;
}) {
  const [newPhone, setNewPhone] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"totp" | "email">("totp");
  const [challenge, setChallenge] = useState<StartResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const vendor = useVendorAccount();
  useAccountTask(
    busy,
    Boolean(newPhone || password || totpCode || code || challenge),
  );

  function reset() {
    if (
      busy ||
      !discardAccountTask(vendor, Boolean(password || totpCode || code))
    )
      return;
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
        "/account/phone-change/start",
        {
          method: "POST",
          token,
          body: {
            newPhone,
            method,
            ...(method === "totp" ? { totpCode } : {}),
          },
        },
      );
      if (response.user) {
        if (vendor) {
          setNewPhone("");
          setPassword("");
          setTotpCode("");
          setCode("");
        }
        setSuccess("Phone number updated successfully.");
        if (onCompleted) await onCompleted();
      } else setChallenge(response);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail() {
    if (busy) return;
    if (!challenge?.challengeId) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/account/phone-change/verify-email", {
        method: "POST",
        token,
        body: { challengeId: challenge.challengeId, code, password },
      });
      setSuccess("Phone number updated successfully.");
      setChallenge(null);
      if (vendor) {
        setNewPhone("");
        setPassword("");
        setTotpCode("");
        setCode("");
      }
      if (onCompleted) await onCompleted();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="phone-change-panel" withBorder padding="lg" mt="md">
      <Stack gap="md">
        <div>
          <Text fw={700}>Change phone number</Text>
          <Text c="dimmed" size="sm">
            Verify the change with your authenticator or your email and
            password.
          </Text>
        </div>
        {success ? <Alert color="teal">{success}</Alert> : null}
        {error ? <Alert color="red">{error}</Alert> : null}
        {!challenge ? (
          <>
            <TextInput
              label="Current phone"
              value={currentPhone || "Not set"}
              disabled
            />
            <TextInput
              label="New phone number"
              placeholder="09XXXXXXXXX"
              inputMode="tel"
              autoComplete="tel"
              required
              value={newPhone}
              onChange={(event) => setNewPhone(event.target.value)}
            />
            <Group gap="xs">
              <Button
                variant={method === "totp" ? "filled" : "light"}
                disabled={busy}
                aria-pressed={method === "totp"}
                onClick={() => setMethod("totp")}
              >
                Use authenticator
              </Button>
              <Button
                variant={method === "email" ? "filled" : "light"}
                disabled={busy}
                aria-pressed={method === "email"}
                onClick={() => setMethod("email")}
              >
                Use email and password
              </Button>
            </Group>
            {method === "totp" ? (
              <OtpInputField
                label="Authenticator code"
                value={totpCode}
                onChange={setTotpCode}
                disabled={busy}
                onVerify={startChange}
                autoVerifyEnabled={Boolean(newPhone.trim())}
              />
            ) : (
              <Alert color="blue" variant="light">
                We’ll email a one-time code to your current email. Your password
                is required when you confirm it.
              </Alert>
            )}
            <Button
              loading={busy}
              disabled={
                !newPhone.trim() || (method === "totp" && totpCode.length !== 6)
              }
              onClick={() => void startChange()}
            >
              Continue
            </Button>
          </>
        ) : (
          <>
            <Alert color="blue" variant="light">
              Enter the code sent to {challenge.deliveryTarget}. It expires in
              10 minutes.
            </Alert>
            <PasswordInput
              label="Current password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <OtpInputField
              label="Email verification code"
              value={code}
              onChange={setCode}
              disabled={busy}
              onVerify={verifyEmail}
              autoVerifyEnabled={Boolean(password)}
              verificationKey={challenge?.challengeId}
            />
            <Group justify="space-between">
              <Button variant="subtle" onClick={reset}>
                Cancel
              </Button>
              <Button
                loading={busy}
                disabled={code.length !== 6 || !password}
                onClick={() => void verifyEmail()}
              >
                Confirm phone number
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}
