import { useId } from "react";
import type { QueueSnapshot } from "@shared";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/ui/card";
import { Field, FieldLabel } from "./components/ui/field";
import { Input } from "./components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "./components/ui/empty";
import { IconCopy } from "@tabler/icons-react";

type Option = { value: string; label: string };
export function QueueCounterPicker({
  data,
  value,
  disabled,
  onChange,
  label,
  placeholder,
  className,
}: {
  data: Option[];
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={data}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      >
        <SelectTrigger id={id}>
          <SelectValue
            placeholder={placeholder || `Select ${label.toLowerCase()}`}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {data.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
export function QueueViewPicker({
  data,
  value,
  onChange,
}: {
  data: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Queue list"
      value={[value]}
      onValueChange={(values) => {
        if (values[0]) onChange(values[0]);
      }}
      variant="outline"
      className="queue-view-picker"
    >
      {data.map((item) => (
        <ToggleGroupItem key={item.value} value={item.value}>
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
export function QueueCopyField({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="queue-copy-field">
        <Input
          id={id}
          value={value}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          disabled={!value}
          onClick={onClick}
        >
          <IconCopy />
        </Button>
      </div>
    </Field>
  );
}
export function QueueEmptyState({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
export function LiveQueueIntake({
  waitingCount,
  threshold,
  resumeWaitingCount,
  autoResumeEnabled,
  stateLabel,
  state,
}: {
  waitingCount: number;
  threshold: number;
  resumeWaitingCount: number | null;
  autoResumeEnabled: boolean;
  stateLabel: string;
  state: "open" | "near_limit" | "paused";
}) {
  return (
    <div className="queue-stack">
      <p className="vendor-eyebrow">Queue intake</p>
      <h3 className="queue-heading">{stateLabel}</h3>
      <p>
        {waitingCount} of {threshold} waiting tickets
      </p>
      <meter
        aria-label="Waiting tickets before auto-pause"
        min={0}
        max={threshold}
        value={Math.min(waitingCount, threshold)}
      />
      <p className="queue-muted queue-small">
        {state === "paused"
          ? autoResumeEnabled && resumeWaitingCount !== null
            ? `Intake resumes automatically at ${resumeWaitingCount} waiting tickets or fewer.`
            : "A staff member must resume intake."
          : `${Math.max(threshold - waitingCount, 0)} tickets before auto-pause.`}
      </p>
    </div>
  );
}
export function LiveQueueSummary({
  snapshot,
}: {
  snapshot: QueueSnapshot | null;
}) {
  const tickets = snapshot?.calledTickets || [];
  const metrics = [
    {
      label: "Counter tickets",
      value: tickets.length,
      detail: `${tickets.filter((ticket) => ticket.serviceStartedAt).length} with service started`,
    },
    {
      label: "Waiting",
      value: snapshot?.stats?.waitingCount ?? "—",
      detail:
        snapshot?.stats?.estimatedWaitMinutes == null
          ? "Estimate unavailable"
          : `${snapshot.stats.estimatedWaitMinutes} min estimated wait`,
    },
    {
      label: "Served today",
      value: snapshot?.stats?.servedToday ?? "—",
      detail: "Queue activity for this location",
    },
  ];
  return (
    <div className="queue-metrics">
      {metrics.map((metric) => (
        <Card key={metric.label}>
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="queue-metric-value">{metric.value}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="queue-muted queue-small">{metric.detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
export function CounterTickets({
  snapshot,
  selectedTicketId,
  disabled,
  onSelect,
  onEnd,
}: {
  snapshot: QueueSnapshot | null;
  selectedTicketId?: string;
  disabled: boolean;
  onSelect: (counterSlug: string) => void;
  onEnd: (
    ticket: NonNullable<QueueSnapshot["calledTickets"]>[number],
    action: "complete" | "interrupt",
  ) => void;
}) {
  const tickets = snapshot?.calledTickets || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Called and in-service tickets</CardTitle>
        <CardDescription>
          Manage each counter’s ticket independently.
        </CardDescription>
      </CardHeader>
      <CardContent className="queue-stack">
        {tickets.length ? (
          tickets.map((ticket) => {
            const lane = snapshot?.counterDispatch?.find(
              (item) => item.currentTicketId === ticket.id,
            );
            const started = Boolean(ticket.serviceStartedAt);
            return (
              <article
                key={ticket.id}
                className="queue-counter-ticket"
                data-selected={selectedTicketId === ticket.id}
              >
                <div className="queue-stack">
                  <div className="queue-row">
                    <strong>{ticket.ticketNumber}</strong>
                    <Badge variant="outline">
                      {started ? "In service" : "Called"}
                    </Badge>
                  </div>
                  <p>{ticket.customerName || "Customer"}</p>
                  <p className="queue-muted queue-small">
                    {lane?.counterName || "Unassigned counter"}
                  </p>
                  {ticket.serviceStartedAt ? (
                    <p className="queue-muted queue-small">
                      Started{" "}
                      {new Date(ticket.serviceStartedAt).toLocaleString(
                        "en-PH",
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="queue-row">
                  <Button
                    variant="outline"
                    disabled={disabled || !lane}
                    aria-label={`Manage ${ticket.ticketNumber}`}
                    onClick={() => {
                      if (lane) onSelect(lane.counterSlug ?? "__unassigned__");
                    }}
                  >
                    Manage ticket
                  </Button>
                  {started ? (
                    <>
                      <Button
                        disabled={disabled}
                        onClick={() => onEnd(ticket, "complete")}
                      >
                        Complete service
                        <span className="v:sr-only">
                          {" "}
                          for {ticket.ticketNumber}
                        </span>
                      </Button>
                      <Button
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onEnd(ticket, "interrupt")}
                      >
                        Interrupt service
                        <span className="v:sr-only">
                          {" "}
                          for {ticket.ticketNumber}
                        </span>
                      </Button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <QueueEmptyState
            title="No counter tickets"
            text="Called tickets appear here. Select a counter and call its next eligible ticket."
          />
        )}
      </CardContent>
    </Card>
  );
}
