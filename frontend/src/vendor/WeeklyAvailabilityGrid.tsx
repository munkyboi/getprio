import type { VendorAvailabilityBlockSummary } from "@shared";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { EntityGrid, EntityCard, EntityIconAction } from "./EntityCards";
import { Badge } from "./components/ui/badge";
import { Switch } from "./components/ui/switch";
import { OperationAlert } from "./OperationsUi";

type WeeklyAvailabilityGridProps = {
  items: VendorAvailabilityBlockSummary[];
  branchName: string;
  timezone: string;
  weekdayLabel: (weekday: number) => string;
  serviceLabel: (serviceId: string | null) => string;
  serviceAvailable: (serviceId: string) => boolean;
  canManage: boolean;
  busyAction: string;
  onToggle: (block: VendorAvailabilityBlockSummary, active: boolean) => void;
  onEdit: (block: VendorAvailabilityBlockSummary) => void;
  onRemove: (block: VendorAvailabilityBlockSummary) => void;
};

/** Presentation only: recurrence, capacity and mutations remain server-authoritative. */
export function WeeklyAvailabilityGrid({ items, branchName, timezone, weekdayLabel, serviceLabel, serviceAvailable, canManage, busyAction, onToggle, onEdit, onRemove }: WeeklyAvailabilityGridProps) {
  const disabled = !canManage || Boolean(busyAction);
  return <EntityGrid label="Weekly availability">{items.map(block => {
    const day = weekdayLabel(block.weekday);
    const window = `${block.startsAt} – ${block.endsAt}${block.endsNextDay ? " next day" : ""}`;
    const label = `${day} ${window} ${serviceLabel(block.serviceId)} weekly rule`;
    const unavailable = Boolean(block.serviceId && !serviceAvailable(block.serviceId));
    const saving = busyAction === `availability-block-status:${block.id}`;
    return <EntityCard key={block.id} title={day}
      badges={<Badge variant={block.isActive ? "success" : "secondary"}>{block.isActive ? "Enabled" : "Disabled"}</Badge>}
      footer={<>
        <div className="location-toggle"><Switch aria-label={`Enable ${label}`} checked={block.isActive} disabled={disabled || unavailable} aria-busy={saving} onCheckedChange={active => onToggle(block, active)}/><span role="status">{saving ? "Saving…" : block.isActive ? "On" : "Off"}</span></div>
        <div className="location-icon-actions"><EntityIconAction label={`Edit ${label}`} disabled={disabled || unavailable} onClick={() => onEdit(block)}><IconEdit aria-hidden="true"/></EntityIconAction><EntityIconAction label={`Remove ${label}`} disabled={disabled} onClick={() => onRemove(block)}><IconTrash aria-hidden="true"/></EntityIconAction></div>
      </>}>
      <p className="ops-strong">{window}</p>
      <p className="ops-muted">Every {day} · {timezone}</p>
      <dl className="config-catalog-summary">
        <div><dt>Branch</dt><dd>{branchName}</dd></div>
        <div><dt>Applies to</dt><dd>{serviceLabel(block.serviceId)}</dd></div>
        <div><dt>Bookings at the same time</dt><dd>{block.capacity}</dd></div>
      </dl>
      {block.notes ? <p className="ops-muted">{block.notes}</p> : null}
      {unavailable ? <OperationAlert title="Service unavailable">The assigned service could not be found. Reload the catalog before editing this rule.</OperationAlert> : null}
    </EntityCard>;
  })}</EntityGrid>;
}
