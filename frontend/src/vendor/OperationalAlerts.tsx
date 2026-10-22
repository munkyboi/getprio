import type { ReactNode } from "react";
import { IconBellRinging, IconX } from "@tabler/icons-react";
import { OperationButton, OperationPanel } from "./OperationsUi";

export type OperationalAlert = {
  id: string;
  kind: "queue" | "booking";
  title: string;
  body: ReactNode;
  actionLabel: string;
};

export function OperationalAlerts({ alerts, onDismiss, onOpen }: {
  alerts: OperationalAlert[];
  onDismiss: (alert: OperationalAlert) => void;
  onOpen: (alert: OperationalAlert) => void;
}) {
  return <section className="vendor-operational-alerts" aria-label="Queue and booking alerts">
    {alerts.map(alert => <OperationPanel key={`${alert.kind}:${alert.id}`}>
      <div className="queue-stack">
        <div className="ops-row ops-between">
          <div className="ops-row"><IconBellRinging aria-hidden size={20} /><strong>{alert.title}</strong></div>
          <OperationButton variant="ghost" aria-label={`Dismiss ${alert.title}`} onClick={() => onDismiss(alert)}><IconX aria-hidden size={18} /></OperationButton>
        </div>
        <p className="ops-muted" role="status">{alert.body}</p>
        <OperationButton onClick={() => onOpen(alert)}>{alert.actionLabel}</OperationButton>
      </div>
    </OperationPanel>)}
  </section>;
}
