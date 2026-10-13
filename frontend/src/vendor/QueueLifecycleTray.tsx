import { useEffect, useState } from "react";
import type { QueueSnapshot } from "@shared";
import { countCalledTicketsForQueueDay } from "../utils/counterDispatch";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
import { TaskDialog } from "./TaskDialog";
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
    timeZoneName: "short",
  }).format(new Date(value));
}

function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function QueueLifecycleTray({
  snapshot,
  locationName,
  canOperate,
  busyAction,
  onRefresh,
  onExtend,
  onCloseNow,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<"extend" | "close" | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  const queueDay = snapshot?.queueDay;
  const deadline = queueDay?.currentClosesAt
    ? new Date(queueDay.currentClosesAt).getTime()
    : null;
  useEffect(() => {
    const serverNow = queueDay?.serverNow
      ? new Date(queueDay.serverNow).getTime()
      : NaN;
    setServerOffset(Number.isFinite(serverNow) ? serverNow - Date.now() : 0);
  }, [queueDay?.serverNow]);
  const remaining = deadline == null ? 0 : deadline - (now + serverOffset);
  const isWarning =
    queueDay?.state === "open" && queueDay.autoClosePhase === "warning";
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
    ...(snapshot?.overflow || []),
  ];
  const carriedCount = waitingTickets.filter(
    (ticket) => ticket.isCarriedOver,
  ).length;
  const firstCarryCount = Math.max(0, waitingTickets.length - carriedCount);
  const calledCount = countCalledTicketsForQueueDay(snapshot);
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

  const deadlineLabel = formatDeadline(
    queueDay?.currentClosesAt,
    queueDay?.timezone,
  );
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
    const succeeded =
      confirmation === "extend" ? await onExtend() : await onCloseNow();
    if (succeeded) {
      setConfirmation(null);
      setDetailsOpen(false);
    }
  }

  return (
    <>
      <Alert
        className="queue-lifecycle-banner"
        role="region"
        aria-label="Queue auto-close status"
      >
        <AlertTitle
          role="status"
          aria-live={isFinalWarning ? "assertive" : "polite"}
        >
          {trayTitle}
        </AlertTitle>
        <AlertDescription>
          <p>{trayMessage}</p>
          <Button
            variant="outline"
            disabled={Boolean(busyAction)}
            onClick={() =>
              reconciliationError ? void onRefresh() : setDetailsOpen(true)
            }
          >
            {reconciliationError ? "Retry status" : "Review auto-close"}
          </Button>
        </AlertDescription>
      </Alert>
      <TaskDialog
        opened={detailsOpen}
        busy={Boolean(busyAction)}
        onClose={() => setDetailsOpen(false)}
        eyebrow="QUEUE AUTO-CLOSE"
        title={
          confirmation === "extend"
            ? `Extend ${locationName} by 30 minutes?`
            : confirmation === "close"
              ? `Close ${locationName} now?`
              : `${locationName} closes in ${formatRemaining(remaining)}`
        }
        footer={
          confirmation ? (
            <>
              <Button
                variant="outline"
                disabled={isBusy}
                onClick={() => setConfirmation(null)}
              >
                Back
              </Button>
              <Button
                variant={confirmation === "close" ? "destructive" : "default"}
                disabled={isBusy || !canOperate}
                aria-busy={isBusy}
                onClick={() => void confirmAction()}
              >
                {isBusy
                  ? "Working…"
                  : confirmation === "extend"
                    ? "Confirm 30-minute extension"
                    : "Close queue and reconcile"}
              </Button>
            </>
          ) : (
            <>
              <p className="queue-muted queue-small">
                Extending adds 30 minutes and records your action.
              </p>
              <Button
                variant="outline"
                disabled={!canOperate || Boolean(busyAction)}
                onClick={() => setConfirmation("close")}
              >
                Close queue now
              </Button>
              <Button
                disabled={!canOperate || Boolean(busyAction)}
                onClick={() => setConfirmation("extend")}
              >
                Extend by 30 minutes
              </Button>
            </>
          )
        }
      >
        <div className="queue-stack">
          {confirmation ? (
            <Alert>
              <AlertTitle>
                {confirmation === "extend"
                  ? "One audited extension"
                  : "Ticket outcomes are final"}
              </AlertTitle>
              <AlertDescription>
                {confirmation === "extend"
                  ? `Confirming adds exactly 30 minutes to the current ${deadlineLabel} deadline and records your action. Auto-close is not disabled; another warning begins 15 minutes before the new deadline.`
                  : "Closing immediately reconciles unresolved tickets. Reopening later will not reverse carry-over, expiration, skipped, or unserved outcomes."}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <AlertDescription>
                  The server deadline is <strong>{deadlineLabel}</strong>.
                  Joining remains available while intake is accepting, but
                  service before closing is not guaranteed.
                </AlertDescription>
              </Alert>
              <h3 className="queue-heading">What will happen at close</h3>
              <div className="queue-outcomes">
                {[
                  {
                    count: firstCarryCount,
                    title: "First-time waiting",
                    text: "Saved for one later eligible Queue Day, with no live position until staff opens it.",
                  },
                  {
                    count: carriedCount,
                    title: "Already carried",
                    text: "Expires if still waiting when this Queue Day closes.",
                  },
                  {
                    count: calledCount,
                    title: "Currently called",
                    text: "Becomes unserved unless completed before close.",
                  },
                  {
                    count: skippedCount,
                    title: "Skipped recovery",
                    text: "Recovery ends when this Queue Day closes.",
                  },
                ].map((outcome) => (
                  <article
                    className="queue-surface queue-stack"
                    key={outcome.title}
                  >
                    <Badge variant="outline">{outcome.count}</Badge>
                    <strong>{outcome.title}</strong>
                    <p className="queue-muted queue-small">{outcome.text}</p>
                  </article>
                ))}
              </div>
              <p className="queue-muted queue-small">
                Closing the queue does not record a service end. Existing
                unfinished services still need completion or interruption.
              </p>
            </>
          )}
          {!canOperate ? (
            <p>
              An authorized queue operator for this location must extend or
              close the Queue Day.
            </p>
          ) : null}
        </div>
      </TaskDialog>
    </>
  );
}
