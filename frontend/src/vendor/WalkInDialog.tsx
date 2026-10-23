import type { FormEvent } from "react";
import type { CreateWalkInTicketRequest } from "@shared";
import { TaskDialog } from "./TaskDialog";
import { Button } from "./components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "./components/ui/field";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Checkbox } from "./components/ui/checkbox";
import { Alert, AlertDescription } from "./components/ui/alert";
import { QueueCounterPicker } from "./LiveQueueWidgets";
import {
  formatPhilippineMobileNumber,
  normalizePhilippineMobileNumber,
} from "../utils/phones";

type Props = {
  linearMode?: boolean;
  opened: boolean;
  busy: boolean;
  unavailable: boolean;
  closed: boolean;
  form: CreateWalkInTicketRequest;
  options: { id: string; name: string; durationMinutes: number }[];
  optionsLoading: boolean;
  optionsError: boolean;
  onChange: (change: Partial<CreateWalkInTicketRequest>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};
export function WalkInDialog({
  opened,
  linearMode=false,
  busy,
  unavailable,
  closed,
  form,
  options,
  optionsLoading,
  optionsError,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  const selectedService=options.find(service=>service.id===form.serviceId);
  return (
    <TaskDialog
      opened={opened}
      busy={busy}
      onClose={onClose}
      eyebrow="WALK-IN CUSTOMER"
      title="Add customer at counter"
      description="Create a same-day queue ticket for a customer who is already at this location."
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="vendor-walk-in"
            disabled={unavailable || busy}
            aria-busy={busy}
          >
            {busy ? "Issuing…" : linearMode && selectedService ? "Publish ticket" : "Issue ticket"}
          </Button>
        </>
      }
    >
      <form id="vendor-walk-in" onSubmit={onSubmit}>
        <FieldGroup>
          {unavailable ? (
            <Alert>
              <AlertDescription>
                {closed
                  ? "Open the queue before adding a walk-in customer."
                  : "Resume intake before adding a walk-in customer."}
              </AlertDescription>
            </Alert>
          ) : null}
          <Field>
            <FieldLabel htmlFor="walk-in-name">Customer name</FieldLabel>
            <Input
              id="walk-in-name"
              autoFocus
              name="walkInCustomerName"
              required
              value={form.customerName}
              disabled={unavailable || busy}
              onChange={(event) =>
                onChange({ customerName: event.currentTarget.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="walk-in-email">Email (optional)</FieldLabel>
            <Input
              id="walk-in-email"
              type="email"
              name="walkInCustomerEmail"
              value={form.customerEmail}
              disabled={unavailable || busy}
              onChange={(event) =>
                onChange({ customerEmail: event.currentTarget.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="walk-in-phone">Phone (optional)</FieldLabel>
            <Input
              id="walk-in-phone"
              type="tel"
              inputMode="numeric"
              placeholder="(0917) 123-4567"
              name="walkInCustomerPhone"
              value={formatPhilippineMobileNumber(form.customerPhone)}
              disabled={unavailable || busy}
              onChange={(event) =>
                onChange({
                  customerPhone: normalizePhilippineMobileNumber(
                    event.currentTarget.value,
                  ),
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="walk-in-notes">Notes (optional)</FieldLabel>
            <Textarea
              id="walk-in-notes"
              name="walkInNotes"
              value={form.notes}
              disabled={unavailable || busy}
              onChange={(event) =>
                onChange({ notes: event.currentTarget.value })
              }
            />
          </Field>
          {optionsError ? (
            <Alert>
              <AlertDescription>
                Service choices could not be loaded. Retry opening this form, or
                issue a ticket without a service.
              </AlertDescription>
            </Alert>
          ) : null}
          <QueueCounterPicker
            label="Service (optional)"
            placeholder="No service specified"
            data={[
              { value: "__none__", label: "No service specified" },
              ...options.map((service) => ({
                value: service.id,
                label: `${service.name} · ${service.durationMinutes} min`,
              })),
            ]}
            value={form.serviceId || "__none__"}
            disabled={unavailable || busy || optionsLoading}
            onChange={(serviceId) =>
              onChange({
                serviceId: serviceId === "__none__" ? "" : serviceId || "",
              })
            }
          />
          {linearMode && selectedService ? <Field><FieldLabel>Service review</FieldLabel><p>{selectedService.name} · {selectedService.durationMinutes} minutes</p><FieldDescription>The configured service duration is captured when you publish. The ticket joins Waiting; calling and starting service check resource availability.</FieldDescription></Field> : null}
          <Field orientation="horizontal">
            <Checkbox
              id="walk-in-alerts"
              checked={form.notifyByEmail}
              disabled={unavailable || busy}
              onCheckedChange={(checked) =>
                onChange({ notifyByEmail: checked })
              }
            />
            <FieldLabel htmlFor="walk-in-alerts">Send email alerts</FieldLabel>
            <FieldDescription>
              Uses the customer’s email address when provided.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </TaskDialog>
  );
}
