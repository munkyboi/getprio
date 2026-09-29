import { useState } from "react";
import { Alert, Badge, Button, Card, Group, Modal, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { UserSummary } from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

type Props = {
  variant: "customer" | "vendor";
  onUpdated?: (user: UserSummary | null) => void | Promise<void>;
};

export function EmailMfaSettingsPanel({ variant, onUpdated }: Props) {
  const { token, user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [disableOpened, setDisableOpened] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const isEnabled = Boolean(user?.emailMfaEnabled);
  const isVerified = Boolean(user?.emailVerified);
  const hasPassword = user?.hasPassword !== false;
  const totpEnabled = Boolean(user?.totpMfaEnabled);
  const requiredMethodCannotBeRemoved = Boolean(user?.mfaRequired && !totpEnabled);
  const cardClass = variant === "vendor"
    ? "neura-card vendor-security-card"
    : "finazze-auth-card customer-account-card";

  async function updateEmailMfa(enabled: boolean) {
    if (!token || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest<{ success: boolean; message: string }, { password?: string }>(
        enabled ? "/auth/mfa/email/enable" : "/auth/mfa/email/disable",
        { method: "POST", token, body: enabled ? {} : { password: hasPassword ? password : "" } }
      );
      setDisableOpened(false);
      setPassword("");
      const updatedUser = await refreshUser();
      await onUpdated?.(updatedUser);
      notifications.show({
        title: enabled ? "Email OTP enabled" : "Email OTP disabled",
        message: enabled
          ? "Sign-ins can now be verified with a code sent to your verified email address."
          : "Email codes will no longer be used to verify sign-ins.",
        color: enabled ? "teal" : "gray"
      });
    } catch (updateError) {
      setError(getErrorMessage(updateError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className={cardClass} padding="lg">
        <Stack gap="md">
          <div>
            <Text className={variant === "vendor" ? "neura-label" : "finazze-section-label"}>Sign-in method</Text>
            <Title order={3}>Email OTP</Title>
            <Text c="dimmed" mt="xs">
              Receive a six-digit sign-in code at {user?.email || "your account email"}. Your email must be verified first.
            </Text>
          </div>
          <Group gap="sm">
            <Badge color={isEnabled ? "teal" : isVerified ? "gray" : "yellow"} variant="light">
              {isEnabled ? "Enabled" : isVerified ? "Optional" : "Verify email first"}
            </Badge>
            {user?.mfaRequired ? <Badge color="orange" variant="light">MFA required</Badge> : null}
          </Group>
          {requiredMethodCannotBeRemoved && isEnabled ? (
            <Alert color="blue" variant="light">
              Keep at least one MFA method enabled for this account. Set up an authenticator before disabling Email OTP.
            </Alert>
          ) : null}
          {error ? <Alert color="red" title="Email OTP settings not updated" variant="light">{error}</Alert> : null}
          {isEnabled ? (
            <Button
              color="red"
              disabled={busy || requiredMethodCannotBeRemoved}
              loading={busy}
              onClick={() => setDisableOpened(true)}
              variant="light"
              w={{ base: "100%", sm: "fit-content" }}
            >
              Disable Email OTP
            </Button>
          ) : (
            <Button
              className={variant === "vendor" ? "neura-primary-button" : "customer-primary-action"}
              color="dark"
              disabled={busy || !isVerified}
              loading={busy}
              onClick={() => void updateEmailMfa(true)}
              w={{ base: "100%", sm: "fit-content" }}
            >
              Enable Email OTP
            </Button>
          )}
        </Stack>
      </Card>
      <Modal
        centered
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        opened={disableOpened}
        onClose={() => { if (!busy) { setDisableOpened(false); setPassword(""); setError(""); } }}
        title="Disable Email OTP?"
      >
        <Stack gap="md">
          <Alert color="orange" title="Your sign-in security will change" variant="light">
            {totpEnabled
              ? "Email codes will stop working, but your authenticator app will remain enabled."
              : "Email OTP is your only active sign-in verification method. Disabling it will leave your account without MFA."}
          </Alert>
          {hasPassword ? (
            <PasswordInput
              autoComplete="current-password"
              label="Current password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          ) : (
            <Alert color="blue" variant="light">
              Provider-only accounts can disable Email OTP only within five minutes of signing in with the original provider. Sign in again first if this session is older.
            </Alert>
          )}
          {error ? <Alert color="red" title="Email OTP was not disabled" variant="light">{error}</Alert> : null}
          <Group justify="flex-end">
            <Button disabled={busy} onClick={() => { setDisableOpened(false); setPassword(""); setError(""); }} variant="default">Keep Email OTP</Button>
            <Button color="red" disabled={busy || Boolean(hasPassword && !password)} loading={busy} onClick={() => void updateEmailMfa(false)}>
              Disable Email OTP
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
