import type { ServiceCounterSummary, VendorStaffSummary } from "@shared";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { Badge } from "./components/ui/badge";
import { Switch } from "./components/ui/switch";
import { EntityGrid, EntityCard, EntityIconAction } from "./EntityCards";

export function CountersGrid({items,staff,canManage,busyAction,onToggle,onEdit,onRemove}:{
  items:ServiceCounterSummary[];staff:VendorStaffSummary[];canManage:boolean;busyAction:string;
  onToggle:(counter:ServiceCounterSummary,active:boolean)=>void;onEdit:(counter:ServiceCounterSummary)=>void;onRemove:(counter:ServiceCounterSummary)=>void;
}) {
  return <EntityGrid label="Counters">{items.map(counter => {
    const saving=busyAction===`counter-status:${counter.slug}`;
    return <EntityCard key={counter.id} title={counter.name} badges={<Badge variant={counter.isActive ? "success" : "secondary"}>{counter.isActive ? "Enabled" : "Disabled"}</Badge>} footer={<>
      <div className="location-toggle"><Switch aria-label={`Enable ${counter.name} counter`} checked={counter.isActive} disabled={!canManage || Boolean(busyAction)} aria-busy={saving} onCheckedChange={active=>onToggle(counter,active)}/><span role="status">{saving ? "Saving…" : counter.isActive ? "On" : "Off"}</span></div>
      <div className="location-icon-actions"><EntityIconAction label={`Edit ${counter.name} counter`} disabled={!canManage || Boolean(busyAction)} onClick={()=>onEdit(counter)}><IconEdit aria-hidden="true"/></EntityIconAction><EntityIconAction label={`Remove ${counter.name} counter`} disabled={!canManage || Boolean(busyAction)} onClick={()=>onRemove(counter)}><IconTrash aria-hidden="true"/></EntityIconAction></div>
    </>}>
      <p className="ops-muted">/{counter.slug}</p><p className="ops-strong">Assigned staff</p><p className="ops-muted">{counter.assignedUserIds.map(id=>staff.find(member=>member.id===id)?.name || "Unavailable staff member").join(", ") || "No staff assigned"}</p>
    </EntityCard>;
  })}</EntityGrid>;
}
