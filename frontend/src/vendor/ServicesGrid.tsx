import type { VendorServiceSummary, LocationServiceSummary, StoreLocationWithHours } from "@shared";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { EntityGrid, EntityCard, EntityIconAction } from "./EntityCards";
import { Badge } from "./components/ui/badge";
import { Switch } from "./components/ui/switch";

export function ServicesGrid({items,assignments,locations,canManage,busyAction,assignmentsReady,onToggle,onEdit,onRemove}:{
  items:VendorServiceSummary[];assignments:LocationServiceSummary[];locations:StoreLocationWithHours[];
  canManage:boolean;busyAction:string;assignmentsReady:boolean;
  onToggle:(service:VendorServiceSummary,active:boolean)=>void;onEdit:(service:VendorServiceSummary)=>void;onRemove:(service:VendorServiceSummary)=>void;
}) {
  const disabled=!canManage || Boolean(busyAction) || !assignmentsReady;
  return <EntityGrid label="Service catalog">{items.map(service=>{
    const branches=assignments.filter(item=>item.serviceId===service.id && item.isActive);
    const saving=busyAction===`service-status:${service.slug}`;
    return <EntityCard key={service.id} title={service.name}
      badges={<Badge variant={service.isActive ? "success" : "secondary"}>{service.isActive ? "Business active" : "Business inactive"}</Badge>}
      footer={<><div className="location-toggle"><Switch aria-label={`Enable ${service.name} for the entire business`} checked={service.isActive} disabled={disabled} aria-busy={saving} onCheckedChange={active=>onToggle(service,active)}/><span role="status">{saving ? "Saving…" : service.isActive ? "Business on" : "Business off"}</span></div><div className="location-icon-actions"><EntityIconAction label={`Edit ${service.name} service`} disabled={disabled} onClick={()=>onEdit(service)}><IconEdit aria-hidden="true"/></EntityIconAction><EntityIconAction label={`Remove ${service.name} service from all locations`} disabled={disabled || !service.isActive} onClick={()=>onRemove(service)}><IconTrash aria-hidden="true"/></EntityIconAction></div></>}>
      <p className="ops-muted">{service.description || `/${service.slug}`}</p>
      <dl className="config-catalog-summary">
        <div><dt>Duration</dt><dd>{service.durationMinutes} min {service.allowBookingQuantity ? "per unit" : "per booking"}</dd></div>
        <div><dt>Price</dt><dd>{service.priceDisplay || `PHP ${(service.priceAmountCents/100).toLocaleString()}`}</dd></div>
        <div><dt>Quantity</dt><dd>{service.allowBookingQuantity ? `${service.bookingQuantityMin ?? 1}–${service.bookingQuantityMax ?? 24} ${service.bookingQuantityLabel || "Units"}` : "One per booking"}</dd></div>
        <div><dt>Booking limit</dt><dd>{service.bookingCapacityScope === "location" ? "All services at the branch" : "Only this service"}</dd></div>
        <div><dt>Payment</dt><dd>{service.manualPaymentRequired ? "Proof required" : "No proof required"}</dd></div>
        <div><dt>List order</dt><dd>{service.sortOrder}</dd></div>
        <div><dt>Enabled branch assignments</dt><dd>{!assignmentsReady ? "Loading branch settings…" : branches.map(item=>locations.find(location=>location.id===item.locationId)?.name || "Unavailable branch").join(", ") || "No enabled branches"}</dd></div>
      </dl>
    </EntityCard>;
  })}</EntityGrid>;
}
