import { useEffect, useState } from "react";
import { Badge, Button, Card, Stack, Table, Text, Title } from "@mantine/core";
import { Navigate, Link } from "react-router-dom";
import type { CustomerAccountOverviewResponse } from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { buildMonitorPathWithTicket } from "../queuePaths";
import { getErrorMessage } from "../utils/errors";

type SortDirection = "asc" | "desc";
type SortState = { key: string; direction: SortDirection };

export default function CustomerAccountPage() {
  const { token, user, loading } = useAuth();
  const [account, setAccount] = useState<CustomerAccountOverviewResponse | null>(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "createdAt", direction: "desc" });

  useEffect(() => {
    if (!token) {
      return;
    }

    apiRequest<CustomerAccountOverviewResponse>(
      `/account/overview?sort=${encodeURIComponent(sort.key)}&direction=${sort.direction}`,
      { token }
    )
      .then(setAccount)
      .catch((loadError) => setError(getErrorMessage(loadError)));
  }, [sort.direction, sort.key, token]);

  function handleSortChange(key: string) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  function renderSortHeader(key: string, label: string) {
    return (
      <button className="sortable-table-header" type="button" onClick={() => handleSortChange(key)}>
        <span>{label}</span>
        <span>{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    );
  }

  if (loading) {
    return <Card className="finazze-auth-card">Loading account...</Card>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
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
        </Stack>
      </Card>

      <Card className="finazze-auth-card customer-account-card" p="xl">
        <Stack gap="md">
          <div>
            <Text className="finazze-section-label">My tickets</Text>
            <Title order={2}>Recent queue activity</Title>
          </div>
          {error ? <Text c="red">{error}</Text> : null}
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{renderSortHeader("ticketNumber", "Ticket")}</Table.Th>
                  <Table.Th>{renderSortHeader("tenantName", "Vendor")}</Table.Th>
                  <Table.Th>{renderSortHeader("locationName", "Location")}</Table.Th>
                  <Table.Th>{renderSortHeader("status", "Status")}</Table.Th>
                  <Table.Th>{renderSortHeader("createdAt", "Joined")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {account?.tickets.length ? (
                  account.tickets.map((ticket) => (
                    <Table.Tr key={ticket.id}>
                      <Table.Td fw={700}>{ticket.ticketNumber}</Table.Td>
                      <Table.Td>{ticket.tenantName}</Table.Td>
                      <Table.Td>{ticket.locationName}</Table.Td>
                      <Table.Td><Badge variant="light">{ticket.status}</Badge></Table.Td>
                      <Table.Td>{new Date(ticket.createdAt).toLocaleString()}</Table.Td>
                      <Table.Td>
                        <Button
                          component={Link}
                          size="xs"
                          to={buildMonitorPathWithTicket(
                            ticket.tenantSlug,
                            ticket.lookupCode,
                            ticket.locationSlug
                          )}
                          variant="light"
                        >
                          Open board
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed">Tickets created while signed in will appear here.</Text>
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
