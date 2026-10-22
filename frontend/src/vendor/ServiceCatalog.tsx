import { useState } from "react";
import type { LocationServiceSummary, StoreLocationWithHours, VendorServiceSummary } from "@shared";
import { ManagedCollection } from "./ManagedCollection";
import { ServicesGrid } from "./ServicesGrid";
import { OperationButton, OperationEmpty } from "./OperationsUi";
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group";

export type ServiceCatalogScope = "location" | "business";

/** Location offerings are explicit assignments, independent of business-wide active status. */
export function serviceCatalogItems<T extends Pick<VendorServiceSummary, "id">>(
  services: T[], assignments: LocationServiceSummary[],
  locationId: string | undefined, scope: ServiceCatalogScope, assignmentsReady: boolean,
) {
  if (scope === "business") return services;
  if (!assignmentsReady || !locationId) return [];
  const offered = new Set(assignments.filter(item => item.locationId === locationId && item.isActive).map(item => item.serviceId));
  return services.filter(service => offered.has(service.id));
}

type Props = {
  services: VendorServiceSummary[];
  assignments: LocationServiceSummary[];
  locations: StoreLocationWithHours[];
  selectedLocationSlug: string;
  catalogReady: boolean;
  assignmentsReady: boolean;
  assignmentsLoading?: boolean;
  canManage: boolean;
  busyAction: string;
  onAdd: () => void;
  onToggle: (service: VendorServiceSummary, active: boolean) => void;
  onEdit: (service: VendorServiceSummary) => void;
  onRemove: (service: VendorServiceSummary) => void;
};

/** Scope state stays outside the dashboard's draft hooks. Parent keys it by business/location. */
export function ServiceCatalog(props: Props) {
  const [scope, setScope] = useState<ServiceCatalogScope>("location");
  // Never use a previous dashboard snapshot as the selected location during a switch.
  const location = props.locations.find(item => item.slug === props.selectedLocationSlug);
  const items = serviceCatalogItems(props.services, props.assignments, location?.id, scope, props.assignmentsReady);
  const ready = props.catalogReady && (scope === "business" || (props.assignmentsReady && Boolean(location)));
  return <div className="ops-stack">
    <div className="ops-list-heading">
      <div>
        <h2>Service catalog</h2>
        <p className="ops-muted">{scope === "business" ? "Manage shared services and choose the locations where each is offered." : location ? `Services offered at ${location.name}.` : "Choose a location to review its offered services."}</p>
      </div>
      <OperationButton disabled={!props.canManage || !props.catalogReady || !props.assignmentsReady || Boolean(props.busyAction)} onClick={props.onAdd}>Add service</OperationButton>
    </div>
    <ToggleGroup className="queue-view-picker" aria-label="Service catalog scope" variant="outline" value={[scope]} onValueChange={values => {
      if (values[0] === "location" || values[0] === "business") setScope(values[0]);
    }} disabled={Boolean(props.busyAction)}>
      <ToggleGroupItem value="location">Selected location</ToggleGroupItem>
      <ToggleGroupItem value="business">All business services</ToggleGroupItem>
    </ToggleGroup>
    <p className="ops-muted">Service details, business availability and removal affect the shared service across all locations. Change location offerings in the service editor’s Locations tab.</p>
    {!props.catalogReady ? null : scope === "location" && !location ? <OperationEmpty title="Choose a location" text="Select a location above, or choose All business services to manage the shared catalog." />
      : scope === "location" && !props.assignmentsReady ? <p className="ops-muted">{props.assignmentsLoading ? "Loading location offerings…" : "Location assignments are unavailable. Refresh the branch settings above to review this location’s catalog."}</p>
      : ready && !items.length ? <OperationEmpty title={scope === "business" ? "No business services yet" : `No services offered at ${location!.name}`} text={scope === "business" ? "Add a service, then choose where customers can book it." : "Choose All business services, edit a service and enable this location in its Locations tab."} />
      : ready ? <ManagedCollection key={scope} items={items} label="services" defaultStatus="active" statusTabs searchText={service => `${service.name} ${service.slug}`} statusOf={service => service.isActive ? "active" : "inactive"} statuses={[{value:"active",label:"Active"},{value:"inactive",label:"Inactive"}]}>{visible => <ServicesGrid items={visible} assignments={props.assignments} locations={props.locations} canManage={props.canManage} busyAction={props.busyAction} assignmentsReady={props.assignmentsReady} onToggle={props.onToggle} onEdit={props.onEdit} onRemove={props.onRemove} />}</ManagedCollection> : null}
  </div>;
}
