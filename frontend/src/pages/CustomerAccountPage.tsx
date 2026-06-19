import { useEffect, useState, type FormEvent } from "react";
import { Alert, Badge, Button, Card, Group, PasswordInput, Stack, Table, Text, Title } from "@mantine/core";
import { Navigate, Link, useNavigate } from "react-router-dom";
import type {
  CustomerAccountHistoryResponse,
  CustomerAccountOverviewResponse,
  PasswordChangeRequest,
  TicketStatus
} from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildJoinPath, buildJoinedQueuePathWithTicket } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";

function getTicketBadgeColor(status: TicketStatus): "gray" | "red" | "yellow" | "orange" | "teal" | "blue" {
  switch (status) {
    case "waiting":
      return "teal";
    case "called":
      return "blue";
    case "served":
      return "gray";
    case "skipped":
      return "yellow";
    case "cancelled":
      return "red";
    case "unserved":
      return "orange";
    default:
      return "gray";
  }
}

export default function CustomerAccountPage() {
  const navigate = useNavigate();
  const { changePassword, token, user, loading } = useAuth();
  const isCustomer = user?.roles?.includes("customer") ?? false;
  const [account, setAccount] = useState<CustomerAccountOverviewResponse | null>(null);
  const [history, setHistory] = useState<CustomerAccountHistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordForm, setPasswordForm] = useState<PasswordChangeRequest>({
    currentPassword: "",
    newPassword: ""
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const tickets = history?.tickets || account?.tickets || [];

  useEffect(() => {
    if (!token) {
      return;
    }

    Promise.all([
      apiRequest<CustomerAccountOverviewResponse>("/account/overview", { token }),
      apiRequest<CustomerAccountHistoryResponse>("/account/history", { token })
    ])
      .then(([overview, ticketHistory]) => {
        setAccount(overview);
        setHistory(ticketHistory);
      })
      .catch((loadError) => setError(getErrorMessage(loadError)));
  }, [token]);

  if (loading) {
    return <Card className="finazze-auth-card">Loading account...</Card>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setChangingPassword(true);

    try {
      await changePassword(passwordForm);
      setPasswordForm({
        currentPassword: "",
        newPassword: ""
      });
      navigate("/login?passwordChanged=1", { replace: true });
    } catch (changeError) {
      setPasswordError(getErrorMessage(changeError));
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <Stack className="customer-account-page" gap="lg">
      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="sm">
          <Text className="finazze-section-label">Customer account</Text>
          <Title order={1}>{account?.user.name || user.name}</Title>
          <Text c="dimmed">{account?.user.email || user.email || "No email on file"}</Text>
          <Text c="dimmed">{account?.user.phone || user.phone || "No phone on file"}</Text>
          <Badge color={account?.user.emailVerified ? "teal" : "yellow"} w="fit-content">
            {account?.user.emailVerified ? "Email verified" : "Email not verified"}
          </Badge>
          {isCustomer ? (
            <Alert color="teal" variant="light">
              This customer profile is reused on join pages so you do not need to retype your contact details.
            </Alert>
          ) : null}
        </Stack>
      </Card>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="sm">
          <Text className="finazze-section-label">Saved details</Text>
          <Title order={2}>Used for faster queue joins</Title>
          <Text c="dimmed">
            These contact details are reused when you join a queue while signed in, so you do not need to retype them each time.
          </Text>
          <Group gap="xl" align="flex-start">
            <Stack gap={2}>
              <Text fw={700}>Name</Text>
              <Text c="dimmed">{account?.user.name || user.name}</Text>
            </Stack>
            <Stack gap={2}>
              <Text fw={700}>Email</Text>
              <Text c="dimmed">{account?.user.email || user.email || "No email on file"}</Text>
            </Stack>
            <Stack gap={2}>
              <Text fw={700}>Phone</Text>
              <Text c="dimmed">{account?.user.phone || user.phone || "No phone on file"}</Text>
            </Stack>
          </Group>
        </Stack>
      </Card>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">Security</Text>
            <Title order={2}>Change password</Title>
            <Text c="dimmed" mt="xs">
              Updating your password signs out this session and any other active sessions.
            </Text>
          </div>
          <form onSubmit={handlePasswordChange}>
            <Stack gap="md">
              <PasswordInput
                name="currentPassword"
                label="Current password"
                required
                value={passwordForm.currentPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    currentPassword: event.target.value
                  }))
                }
              />
              <PasswordInput
                name="newPassword"
                label="New password"
                required
                value={passwordForm.newPassword}
                onChange={(event) =>
                  setPasswordForm((current) => ({
                    ...current,
                    newPassword: event.target.value
                  }))
                }
              />
              {passwordError ? <Alert color="red">{passwordError}</Alert> : null}
              <Button color="dark" disabled={changingPassword} type="submit">
                {changingPassword ? "Updating password..." : "Change password"}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">My tickets</Text>
            <Title order={2}>Recent queue activity</Title>
          </div>
          {isCustomer ? (
            <Alert color="blue" variant="light">
              Open a ticket to revisit its live board, or use Join again to reuse the same saved account details.
            </Alert>
          ) : null}
          {error ? <Text c="red">{error}</Text> : null}
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Ticket</Table.Th>
                  <Table.Th>Vendor</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Joined</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tickets.length ? (
                  tickets.map((ticket) => (
                    <Table.Tr key={ticket.id}>
                      <Table.Td fw={700}>{ticket.ticketNumber}</Table.Td>
                      <Table.Td>{ticket.tenantName}</Table.Td>
                      <Table.Td>{ticket.locationName}</Table.Td>
                      <Table.Td>
                        <Badge color={getTicketBadgeColor(ticket.status)} variant="light">
                          {ticket.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{new Date(ticket.createdAt).toLocaleString()}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button
                            component={Link}
                            size="xs"
                            to={buildJoinedQueuePathWithTicket(
                              ticket.tenantSlug,
                              ticket.lookupCode,
                              ticket.locationSlug
                            )}
                            variant="light"
                          >
                            Open ticket
                          </Button>
                          <Button
                            component={Link}
                            size="xs"
                            to={buildJoinPath(ticket.tenantSlug, ticket.locationSlug)}
                            variant="subtle"
                          >
                            Join again
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed">
                        Tickets created while signed in will appear here, alongside the account details used for the next join.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Card>
    </Stack>
  );
}
