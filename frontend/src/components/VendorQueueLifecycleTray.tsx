import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconAlertTriangle,
  IconClock,
  IconRefresh,
  IconShieldLock
} from "@tabler/icons-react";
import type { QueueSnapshot } from "@shared";

type Props = {
  snapshot: QueueSnapshot | null;
  locationName: string;
  canOperate: boolean;
  busyAction: string;
  onRefresh: () => Promise<void>;
  onExtend: () => Promise<boolean>;
  onCloseNow: () => Promise<boolean>;
};

function formatDeadline(value?: string | Date | null, timezone?: string) {
  if (!value) return "the scheduled close time";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || "Asia/Manila",
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function VendorQueueLifecycleTray({
  snapshot,
  locationName,
  canOperate,
  busyAction,
  onRefresh,
  onExtend,
  onCloseNow
}: Props) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<"extend" | "close" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const queueDay = snapshot?.queueDay;
  const deadline = queueDay?.currentClosesAt ? new Date(queueDay.currentClosesAt).getTime() : null;
  useEffect(() => {
    const serverNow = queueDay?.serverNow ? new Date(queueDay.serverNow).getTime() : NaN;
    setServerOffset(Number.isFinite(serverNow) ? serverNow - Date.now() : 0);
  }, [queueDay?.serverNow]);
  const remaining = deadline == null ? 0 : deadline - (now + serverOffset);
  const isWarning = queueDay?.state === "open" && queueDay.autoClosePhase === "warning";
  const isReconciling =
    busyAction === "queue-close" ||
    queueDay?.availabilityReason === "reconciling" ||
    queueDay?.autoClosePhase === "overdue";
  const reconciliationError = queueDay?.reconciliationError;
  const showTray = Boolean(isWarning || isReconciling || reconciliationError);
  const isFinalWarning = isWarning && remaining <= 5 * 60_000;
  const isBusy = busyAction === "queue-extend" || busyAction === "queue-close";
  const waitingTickets = [
    ...(snapshot?.nextUp || []),
    ...(snapshot?.overflow || [])
  ];
  const carriedCount = waitingTickets.filter((ticket) => ticket.isCarriedOver).length;
  const firstCarryCount = Math.max(0, waitingTickets.length - carriedCount);
  const calledCount = snapshot?.current ? 1 : 0;
  const skippedCount = snapshot?.recovery?.length || 0;

  useEffect(() => {
    if (!showTray) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [showTray]);

  useEffect(() => {
    const synchronize = () => {
      setNow(Date.now());
      void onRefresh();
    };
    window.addEventListener("focus", synchronize);
    window.addEventListener("online", synchronize);
    return () => {
      window.removeEventListener("focus", synchronize);
      window.removeEventListener("online", synchronize);
    };
  }, [onRefresh]);

  useEffect(() => {
    if (!detailsOpen) setConfirmation(null);
  }, [detailsOpen]);

  if (!showTray) return null;

  const deadlineLabel = formatDeadline(queueDay?.currentClosesAt, queueDay?.timezone);
  const trayTitle = reconciliationError
    ? "Queue status needs attention"
    : isReconciling
      ? "Queue is closing"
      : `Auto-close in ${formatRemaining(remaining)}`;
  const trayMessage = reconciliationError
    ? "Automatic reconciliation could not confirm a trustworthy queue state. Queue actions are locked."
    : isReconciling
      ? "Ticket outcomes are being reconciled. This is a short-lived operation, not a draining state."
      : `${locationName} closes at ${deadlineLabel}. Every unresolved ticket will receive an outcome.`;

  async function confirmAction() {
    const succeeded = confirmation === "extend" ? await onExtend() : await onCloseNow();
    if (succeeded) {
      setConfirmation(null);
      setDetailsOpen(false);
    }
  }

  return (
    <>
      <Paper
        className={`queue-lifecycle-tray${isFinalWarning ? " queue-lifecycle-tray--final" : ""}${reconciliationError ? " queue-lifecycle-tray--error" : ""}`}
        role="region"
        aria-label="Queue auto-close status"
        shadow="lg"
      >
        <Group align="center" justify="space-between" wrap="nowrap">
          <Group align="center" gap="sm" wrap="nowrap">
            <span className="queue-lifecycle-tray__icon" aria-hidden="true">
              {reconciliationError ? <IconShieldLock size={22} /> : <IconAlertTriangle size={22} />}
            </span>
            <div>
              <Text fw={900} role="status" aria-live={isFinalWarning ? "assertive" : "polite"}>
                {trayTitle}
              </Text>
              <Text className="queue-lifecycle-tray__message" size="sm">
                {trayMessage}
              </Text>
            </div>
          </Group>
          <Button
            className="queue-lifecycle-tray__action"
            color={reconciliationError ? "red" : "dark"}
            leftSection={reconciliationError ? <IconRefresh size={17} /> : <IconClock size={17} />}
            loading={busyAction === "queue-refresh"}
            onClick={() => reconciliationError ? void onRefresh() : setDetailsOpen(true)}
            variant={reconciliationError ? "white" : "filled"}
          >
            {reconciliationError ? "Retry status" : "Review & extend"}
          </Button>
        </Group>
      </Paper>

      <Modal
        centered={!isMobile}
        className="task-modal queue-auto-close-modal"
        closeOnClickOutside={!isBusy}
        closeOnEscape={!isBusy}
        onClose={() => !isBusy && setDetailsOpen(false)}
        opened={detailsOpen}
        size="lg"
        title={
          <div className="getprio-modal-title">
            <Text className="getprio-modal-eyebrow">QUEUE AUTO-CLOSE</Text>
            <Text className="getprio-modal-heading">
              {confirmation === "extend"
                ? `Extend ${locationName} by 30 minutes?`
                : confirmation === "close"
                  ? `Close ${locationName} now?`
                  : `${locationName} closes in ${formatRemaining(remaining)}`}
            </Text>
          </div>
        }
      >
        <Stack className="task-modal__shell" gap={0}>
          <div className="task-modal__main queue-auto-close-modal__main">
            <Stack gap="md">
              {confirmation ? (
                <Alert
                  color={confirmation === "close" ? "red" : "orange"}
                  icon={<IconAlertTriangle size={18} />}
                  title={confirmation === "extend" ? "One audited extension" : "Ticket outcomes are final"}
                >
                  {confirmation === "extend"
                    ? `Confirming adds exactly 30 minutes to the current ${deadlineLabel} deadline and records your action. Auto-close is not disabled; another warning begins 15 minutes before the new deadline.`
                    : "Closing immediately reconciles unresolved tickets. Reopening later will not reverse carry-over, expiration, skipped, or unserved outcomes."}
                </Alert>
              ) : (
                <>
                  <Alert color={isFinalWarning ? "red" : "orange"} icon={<IconClock size={18} />}>
                    The server deadline is <strong>{deadlineLabel}</strong>. Joining remains available while
                    intake is accepting, but service before closing is not guaranteed.
                  </Alert>
                  <div>
                    <Text className="getprio-modal-eyebrow">TICKET CONSEQUENCES</Text>
                    <Title order={3}>What will happen at close</Title>
                  </div>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Paper className="queue-auto-close-modal__outcome" withBorder>
                      <Badge color="blue" variant="light">{firstCarryCount}</Badge>
                      <Text fw={800}>First-time waiting</Text>
                      <Text c="dimmed" size="sm">Saved for one later eligible Queue Day, with no live position until staff opens it.</Text>
                    </Paper>
                    <Paper className="queue-auto-close-modal__outcome" withBorder>
                      <Badge color="red" variant="light">{carriedCount}</Badge>
                      <Text fw={800}>Already carried</Text>
                      <Text c="dimmed" size="sm">Expires if still waiting when this Queue Day closes.</Text>
                    </Paper>
                    <Paper className="queue-auto-close-modal__outcome" withBorder>
                      <Badge color="orange" variant="light">{calledCount}</Badge>
                      <Text fw={800}>Currently called</Text>
                      <Text c="dimmed" size="sm">Becomes unserved unless completed before close.</Text>
                    </Paper>
                    <Paper className="queue-auto-close-modal__outcome" withBorder>
                      <Badge color="yellow" variant="light">{skippedCount}</Badge>
                      <Text fw={800}>Skipped recovery</Text>
                      <Text c="dimmed" size="sm">Recovery ends when this Queue Day closes.</Text>
                    </Paper>
                  </SimpleGrid>
                </>
              )}
            </Stack>
          </div>
          <div className="task-modal__footer queue-auto-close-modal__footer">
            {confirmation ? (
              <Group justify="flex-end" w="100%">
                <Button disabled={isBusy} onClick={() => setConfirmation(null)} variant="default">
                  Back
                </Button>
                <Button
                  color={confirmation === "close" ? "red" : "orange"}
                  loading={isBusy}
                  onClick={() => void confirmAction()}
                >
                  {confirmation === "extend" ? "Confirm 30-minute extension" : "Close queue and reconcile"}
                </Button>
              </Group>
            ) : (
              <Group justify="space-between" w="100%">
                <Text c="dimmed" size="sm">Adds 30 minutes and records your action.</Text>
                <Group>
                  <Button
                    color="red"
                    disabled={!canOperate}
                    onClick={() => setConfirmation("close")}
                    variant="light"
                  >
                    Close queue now
                  </Button>
                  <Button
                    color="orange"
                    disabled={!canOperate}
                    onClick={() => setConfirmation("extend")}
                  >
                    Cancel auto-close
                  </Button>
                </Group>
              </Group>
            )}
            {!canOperate ? (
              <Text c="red" size="sm" w="100%">
                An authorized queue operator for this location must extend or close the Queue Day.
              </Text>
            ) : null}
          </div>
        </Stack>
      </Modal>
    </>
  );
}
