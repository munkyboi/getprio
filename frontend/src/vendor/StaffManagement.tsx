import type { ServiceCounterSummary, VendorStaffSummary } from "@shared";
import { ConfigurationSelect } from "./ConfigurationUi";
import { OperationButton, OperationEmpty } from "./OperationsUi";
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
    <div className="ops-table">
      <table className="ops-data-table" aria-label="Business staff accounts">
        <thead>
          <tr>
            <th scope="col">Member</th>
            <th scope="col">Contact</th>
            <th scope="col">Role</th>
            <th scope="col">Access</th>
            <th scope="col">Counter assignments</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const controls = staffControls(member, actorId, owner, admin);
            const active = member.isActive !== false;
            return (
              <tr key={member.id}>
                <td data-label="Member">
                  <div className="config-catalog-content">
                    <span className="ops-strong">
                      {member.name}
                      {member.id === actorId ? " (you)" : ""}
                    </span>
                    <span className="ops-muted">Account ID: {member.id}</span>
                  </div>
                </td>
                <td data-label="Contact">
                  {member.email || member.phone || "No contact details"}
                </td>
                <td data-label="Role">
                  {controls.role ? (
                    <ConfigurationSelect
                      label={`Role for ${member.name}`}
                      data={[
                        { value: "admin", label: "Admin" },
                        { value: "staff", label: "Staff" },
                      ]}
                      value={member.role}
                      onChange={(value) => {
                        if (
                          (value === "admin" || value === "staff") &&
                          value !== member.role
                        )
                          onRole(member, value);
                      }}
                    />
                  ) : (
                    <Badge variant="secondary">
                      {member.role === "owner"
                        ? "Owner"
                        : member.role === "admin"
                          ? "Admin"
                          : "Staff"}
                    </Badge>
                  )}
                </td>
                <td data-label="Access">
                  <Badge variant={active ? "secondary" : "outline"}>
                    {active ? "Enabled" : "Disabled"}
                  </Badge>
                </td>
                <td data-label="Counters">
                  {member.assignedCounterIds.length
                    ? member.assignedCounterIds
                        .map((id) =>
                          countersAvailable
                            ? counters.find((counter) => counter.id === id)
                                ?.name ||
                              "Counter outside this location or unavailable"
                            : "Counter details unavailable",
                        )
                        .join(", ")
                    : "No counters assigned"}
                </td>
                <td data-label="Actions">
                  <div className="config-catalog-actions">
                    {controls.status ? (
                      <OperationButton
                        variant="outline"
                        aria-label={`${active ? "Disable" : "Enable"} access for ${member.name}`}
                        onClick={() => onStatus(member, !active)}
                      >
                        {active ? "Disable access" : "Enable access"}
                      </OperationButton>
                    ) : (
                      <span className="ops-muted">
                        {member.id === actorId
                          ? "Your own access cannot be changed here."
                          : "Owner access is protected."}
                      </span>
                    )}
                    {controls.remove ? (
                      <OperationButton
                        variant="destructive"
                        aria-label={`Remove ${member.name}`}
                        onClick={() => onRemove(member)}
                      >
                        Remove staff
                      </OperationButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
