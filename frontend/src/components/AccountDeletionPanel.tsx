import { useState } from "react";
import { Alert, Button, Card, Group, Modal, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";

type AccountType = "customer" | "vendor";
type DeletionOptions = { passwordRequired: boolean };
type DeletionReceipt = { status: "accepted"; requestId: string; dueAt: string };

function messageFor(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "We could not submit the deletion request. Please try again.";
}

export function AccountDeletionPanel({ accountType }: { accountType: AccountType }) {
  const { token, logout } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(true);
  const [password, setPassword] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isVendor = accountType === "vendor";
  const accountDescription = isVendor
    ? "This applies across your vendor workspaces, not just the selected business."
    : "This applies to your customer account and personal data.";
  const activityWarning = isVendor
    ? "Access is revoked when a request is accepted. Waiting queue tickets are cancelled; bookings and payments are not automatically cancelled or refunded. Deletion follows required cleanup and documented retention checks."
    : "Access is revoked when a request is accepted. Waiting queue tickets may be cancelled; bookings and payments are not automatically cancelled or refunded. Some records may be retained where there is a documented legal or operational need.";

  async function prepareRequest() {
    if (preparing || submitting) return;
    setPreparing(true);
    setError("");
    try {
      const options = await apiRequest<DeletionOptions>("/account/deletion-options", { token });
      setPasswordRequired(options.passwordRequired);
      setPassword("");
      setDialogOpen(true);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setPreparing(false);
    }
  }

  async function submitRequest() {
    if (submitting || (passwordRequired && !password)) return;
    setSubmitting(true);
    setError("");
    try {
      const receipt = await apiRequest<DeletionReceipt, { password: string }>("/account/delete", {
        method: "POST",
        body: { password: passwordRequired ? password : "" },
        token
      });
      setDialogOpen(false);
      notifications.show({
        title: "Deletion request accepted",
        message: `Reference ${receipt.requestId}. Your session will close now; deletion is due by ${new Date(receipt.dueAt).toLocaleDateString()}.`,
        color: "orange",
        autoClose: false
      });
      await logout();
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Card className={isVendor ? "neura-card vendor-security-card" : "finazze-auth-card customer-account-card"} padding="lg">
        <Stack gap="md">
          <div>
            <Text className={isVendor ? "neura-label" : "finazze-section-label"}>Danger zone</Text>
            <Title order={3}>Delete your account</Title>
            <Text c="dimmed" mt="xs">
              Request permanent deletion of your GetPrio account and personal data. {accountDescription}
            </Text>
          </div>
          <Alert color="orange" title={isVendor ? "Business records may need review" : "Outstanding activity may need review"} variant="light">
            {activityWarning}
          </Alert>
          {error ? <Alert color="red" title="Could not start deletion" variant="light">{error}</Alert> : null}
          <Button
            color="red"
            loading={preparing}
            onClick={() => void prepareRequest()}
            w={{ base: "100%", sm: "fit-content" }}
          >
            Request account deletion
          </Button>
        </Stack>
      </Card>

      <Modal
        centered
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        onClose={() => { if (!submitting) { setDialogOpen(false); setError(""); } }}
        opened={dialogOpen}
        title="Request permanent deletion?"
      >
        <Stack gap="md">
          <Text size="sm">
            Your access ends immediately after this request is accepted. {isVendor
              ? "The request covers every vendor workspace connected to your account."
              : "Waiting queue tickets may be cancelled; bookings and payments are not automatically cancelled or refunded."}
          </Text>
          {passwordRequired ? (
            <PasswordInput
              autoComplete="current-password"
              label="Current password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              value={password}
            />
          ) : (
            <Alert color="blue" variant="light">
              This account uses provider sign-in. If this session is older than five minutes, sign in again with your original provider and retry.
            </Alert>
          )}
          <Alert color="red" title="This cannot be undone" variant="light">
            Only records with a documented legal or operational retention basis may remain. The Platform team reviews required cleanup before the worker completes erasure.
          </Alert>
          {error ? <Alert color="red" title="Request not submitted" variant="light">{error}</Alert> : null}
          <Group justify="flex-end">
            <Button disabled={submitting} onClick={() => { setDialogOpen(false); setError(""); }} variant="default">
              Keep my account
            </Button>
            <Button color="red" disabled={submitting || (passwordRequired && !password)} loading={submitting} onClick={() => void submitRequest()}>
              Request permanent deletion
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
