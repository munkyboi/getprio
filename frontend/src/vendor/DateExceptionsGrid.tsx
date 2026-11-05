import type { VendorAvailabilityExceptionSummary } from "@shared";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { EntityGrid, EntityCard, EntityIconAction } from "./EntityCards";
import { Badge } from "./components/ui/badge";
import { Switch } from "./components/ui/switch";
import { OperationAlert } from "./OperationsUi";

type Props = {
  items: VendorAvailabilityExceptionSummary[];
  branchName: string;
  timezone: string;
  dateLabel: (date: string | Date) => string;
  serviceLabel: (id: string | null) => string;
  serviceAvailable: (id: string) => boolean;
  canManage: boolean;
  busyAction: string;
  onToggle: (item: VendorAvailabilityExceptionSummary, available: boolean) => void;
  onEdit: (item: VendorAvailabilityExceptionSummary) => void;
  onRemove: (item: VendorAvailabilityExceptionSummary) => void;
};

export function DateExceptionsGrid({items, branchName, timezone, dateLabel, serviceLabel, serviceAvailable, canManage, busyAction, onToggle, onEdit, onRemove}: Props) {
  const disabled = !canManage || Boolean(busyAction);
  return <EntityGrid label="Date exceptions">{items.map(item => {
    const date = dateLabel(item.exceptionDate);
    const window = item.startsAt && item.endsAt ? `${item.startsAt} – ${item.endsAt}` : "Whole day";
    const label = `${date} ${window} ${serviceLabel(item.serviceId)} date exception`;
    const unavailable = Boolean(item.serviceId && !serviceAvailable(item.serviceId));
    const saving = busyAction === `availability-exception-status:${item.id}`;
    return <EntityCard key={item.id} title={date}
      badges={<Badge variant={item.isAvailable ? "success" : "destructive"}>{item.isAvailable ? "Bookings allowed" : "Blocked"}</Badge>}
      footer={<>
        <div className="location-toggle"><Switch aria-label={`Allow bookings for ${label}`} checked={item.isAvailable} disabled={disabled || unavailable} aria-busy={saving} onCheckedChange={available => onToggle(item, available)}/><span role="status">{saving ? "Saving…" : item.isAvailable ? "Allowed" : "Blocked"}</span></div>
        <div className="location-icon-actions"><EntityIconAction label={`Edit ${label}`} disabled={disabled || unavailable} onClick={() => onEdit(item)}><IconEdit aria-hidden="true"/></EntityIconAction><EntityIconAction label={`Remove ${label}`} disabled={disabled} onClick={() => onRemove(item)}><IconTrash aria-hidden="true"/></EntityIconAction></div>
      </>}>
      <p className="ops-strong">{window}</p>
      <p className="ops-muted">One-off · {timezone}</p>
      <dl className="config-catalog-summary">
        <div><dt>Branch</dt><dd>{branchName}</dd></div>
        <div><dt>Applies to</dt><dd>{serviceLabel(item.serviceId)}</dd></div>
        <div><dt>Bookings at the same time</dt><dd>{item.capacity ?? "Usual limit"}</dd></div>
      </dl>
      {item.reason ? <p className="ops-muted">{item.reason}</p> : null}
      {unavailable ? <OperationAlert title="Service unavailable">The assigned service could not be found. Reload the catalog before editing this exception.</OperationAlert> : null}
    </EntityCard>;
  })}</EntityGrid>;
}
