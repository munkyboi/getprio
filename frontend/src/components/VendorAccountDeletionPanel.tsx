import { useState } from "react";
import { Alert, Button, Card, Group, Modal, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";

type DeletionOptions = { passwordRequired: boolean };
type DeletionReceipt = { status: "accepted"; requestId: string; dueAt: string };

function messageFor(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "We could not submit the deletion request. Please try again.";
}

export function VendorAccountDeletionPanel() {
  const { token, logout } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(true);
  const [password, setPassword] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
      <Card className="neura-card vendor-security-card" padding="lg">
        <Stack gap="md">
          <div>
            <Text className="neura-label">Danger zone</Text>
            <Title order={3}>Delete your account</Title>
            <Text c="dimmed" mt="xs">
              Request permanent deletion of your GetPrio account and personal data. This applies across your vendor workspaces, not just the selected business.
            </Text>
          </div>
          <Alert color="orange" title="Business records may need review" variant="light">
            Access is revoked when a request is accepted. Waiting queue tickets are cancelled; bookings and payments are not automatically cancelled or refunded. Deletion follows required cleanup and documented retention checks.
          </Alert>
          {error && !dialogOpen ? <Alert color="red" title="Could not start deletion" variant="light">{error}</Alert> : null}
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
            This permanently removes your GetPrio account after required cleanup. Your access ends immediately, and this request may affect every vendor workspace connected to your account.
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
            Submitted requests immediately revoke active sessions. Only records with a documented legal or operational retention basis may remain; the Platform team reviews the required cleanup before the worker completes erasure.
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
