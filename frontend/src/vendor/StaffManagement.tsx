import { ManagedCollection } from "./ManagedCollection";
import type { ServiceCounterSummary, VendorStaffSummary } from "@shared";
import { ConfigurationSelect } from "./ConfigurationUi";
import { OperationEmpty } from "./OperationsUi";
import { IconUserCheck, IconUserOff, IconTrash } from "@tabler/icons-react";
import { EntityGrid, EntityCard, EntityIconAction } from "./EntityCards";
import { Badge } from "./components/ui/badge";

export function staffControls(
  member: VendorStaffSummary,
  actorId: string,
  owner: boolean,
  admin: boolean,
) {
  const protectedMember = member.role === "owner" || member.id === actorId;
  return {
    role: owner && !protectedMember,
    status: (owner || admin) && !protectedMember,
    remove: owner && !protectedMember,
  };
}

export function StaffManagement({
  members,
  actorId,
  owner,
  admin,
  counters,
  countersAvailable,
  busyAction = "",
  locationName = "Selected location",
  onRole,
  onStatus,
  onRemove,
}: {
  members: VendorStaffSummary[];
  actorId: string;
  owner: boolean;
  admin: boolean;
  counters: ServiceCounterSummary[];
  countersAvailable: boolean;
  busyAction?: string;
  locationName?: string;
  onRole: (member: VendorStaffSummary, role: "admin" | "staff") => void;
  onStatus: (member: VendorStaffSummary, active: boolean) => void;
  onRemove: (member: VendorStaffSummary) => void;
}) {
  if (!members.length)
    return (
      <OperationEmpty
        title="No staff accounts"
        text="Add someone with an existing GetPrio account to give them access to this business."
      />
    );
  return (
    <ManagedCollection items={members} label="staff accounts" searchText={(member) => [member.name, member.email, member.phone, member.role].filter(Boolean).join(" ")} statusOf={(member) => member.isActive === false ? "disabled" : "enabled"} statuses={[{value:"enabled",label:"Enabled"},{value:"disabled",label:"Disabled"}]}>{(visibleMembers) => (
    <EntityGrid label="Business staff accounts">{visibleMembers.map(member => {
      const controls = staffControls(member, actorId, owner, admin);
      const active = member.isActive !== false;
      const busy = Boolean(busyAction);
      const roleLabel = member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : "Staff";
      return <EntityCard key={member.id} title={`${member.name}${member.id === actorId ? " (you)" : ""}`}
        badges={<><Badge variant="secondary">{roleLabel}</Badge><Badge variant={active ? "success" : "secondary"}>{active ? "Enabled" : "Disabled"}</Badge></>}
        footer={<>
          {controls.status ? <EntityIconAction label={`${active ? "Disable" : "Enable"} access for ${member.name}`} disabled={busy} onClick={() => onStatus(member, !active)}>{active ? <IconUserOff aria-hidden="true"/> : <IconUserCheck aria-hidden="true"/>}</EntityIconAction> : <span className="ops-muted">{member.id === actorId ? "Your own access cannot be changed here." : member.role === "owner" ? "Owner access is protected." : "Access changes require an owner or admin."}</span>}
          {controls.remove ? <EntityIconAction label={`Remove ${member.name}`} disabled={busy} onClick={() => onRemove(member)}><IconTrash aria-hidden="true"/></EntityIconAction> : null}
        </>}>
        <p className="ops-muted">Account ID: {member.id}</p>
        <dl className="config-catalog-summary">
          <div><dt>Contact</dt><dd>{member.email || member.phone || "No contact details"}</dd></div>
          <div><dt>Counter assignments</dt><dd>{member.assignedCounterIds.length ? member.assignedCounterIds.map(id => countersAvailable ? counters.find(counter => counter.id === id)?.name || "Counter outside this location or unavailable" : "Counter details unavailable").join(", ") : "No counters assigned"}</dd></div>
        </dl>
        <p className="ops-muted">Counter names shown for {locationName}.</p>
        {controls.role ? <ConfigurationSelect label={`Role for ${member.name}`} disabled={busy}
          data={[{value:"admin",label:"Admin"},{value:"staff",label:"Staff"}]} value={member.role}
          onChange={value => { if ((value === "admin" || value === "staff") && value !== member.role) onRole(member,value); }}/>: null}
      </EntityCard>;
    })}</EntityGrid>
    )}</ManagedCollection>
  );
}
