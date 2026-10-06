import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { QueueSnapshot } from "@shared";
import { cancelWaitingTicket, getWaitingTickets, type WaitingCancellationTicket } from "../api/vendorDashboardQueue";
import { ConfirmActionModal } from "./ConfirmActionModal";

export function VendorWaitingTicketCancellation({ token, tenantSlug, locationQuery, locationName, onCancelled }: Readonly<{
  token: string; tenantSlug: string; locationQuery: string; locationName: string;
  onCancelled: (snapshot?: QueueSnapshot) => void;
}>) {
  const [opened, setOpened] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WaitingCancellationTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const waiting = useQuery({
    queryKey: ["vendor-waiting-cancellation", token, tenantSlug, locationQuery, page],
    queryFn: () => getWaitingTickets(token, tenantSlug, locationQuery, page),
    enabled: opened, refetchInterval: opened && !busy ? 10000 : false
  });
  useEffect(() => {
    if (waiting.data?.tickets.length === 0 && page > 1) setPage(value => value - 1);
  }, [waiting.data, page]);

  async function confirmCancellation() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await cancelWaitingTicket(token, tenantSlug, locationQuery, selected.id);
      onCancelled(result.snapshot);
      setSelected(null);
      await waiting.refetch();
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not cancel the ticket. Refresh and try again.");
      setSelected(null);
      await waiting.refetch();
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Button variant="light" mih={44} onClick={() => { setPage(1); setError(""); setOpened(true); }}>Manage waiting tickets</Button>
    <Modal opened={opened} title="Waiting tickets" centered onClose={() => { if (!busy) setOpened(false); }}
      closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy} zIndex={1050}>
      <Stack>
        <Text size="sm" c="dimmed">{locationName} · All waiting tickets, including activated carry-over tickets. Each page shows up to 25 tickets.</Text>
        {error || waiting.error ? <Alert color="red">{error || "Could not load waiting tickets."}</Alert> : null}
        {waiting.isPending ? <Text>Loading waiting tickets…</Text> : null}
        {!waiting.isPending && !waiting.isError && waiting.data?.tickets.length === 0 ? <Text>No waiting tickets.</Text> : null}
        {waiting.data?.tickets.map(ticket => <Group key={ticket.id} justify="space-between" wrap="wrap">
          <div><Text fw={700}>{ticket.ticketNumber}</Text><Text size="sm">{ticket.customerName}</Text>
            {ticket.isCarriedOver ? <Badge color="orange">Carry-over</Badge> : null}
            {ticket.linkedBookingReference ? <Text size="xs" c="dimmed">Booking {ticket.linkedBookingReference}</Text> : null}</div>
          <Button color="red" variant="light" mih={44} disabled={busy || waiting.isFetching}
            aria-label={`Cancel waiting ticket ${ticket.ticketNumber}`} onClick={() => setSelected(ticket)}>Cancel ticket</Button>
        </Group>)}
        <Group justify="space-between">
          <Button variant="default" disabled={page === 1 || busy || waiting.isFetching} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <Text size="sm">Page {page}</Text>
          <Button variant="default" disabled={!waiting.data?.hasNextPage || busy || waiting.isFetching} onClick={() => setPage(value => value + 1)}>Next</Button>
        </Group>
      </Stack>
    </Modal>
    <ConfirmActionModal opened={Boolean(selected)} title={`Cancel ticket ${selected?.ticketNumber || ""}?`}
      description={selected?.linkedBookingReference
        ? "Remove this waiting ticket. This does not cancel its booking or issue a refund. The ticket cannot be restored."
        : "Remove this waiting ticket. The ticket cannot be restored; issue a new ticket if the customer returns."}
      confirmLabel="Cancel ticket" cancelLabel="Keep ticket" loading={busy}
      onClose={() => { if (!busy) setSelected(null); }} onConfirm={() => { void confirmCancellation(); }} />
  </>;
}
