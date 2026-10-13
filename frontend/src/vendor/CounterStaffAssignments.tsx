import { useState } from "react";
import type { VendorStaffSummary } from "@shared";
import { ConfigurationCheck, ConfigurationInput } from "./ConfigurationUi";

export function filterCounterStaff(
  staff: VendorStaffSummary[],
  search: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return staff.filter((member) =>
    `${member.name} ${member.email || ""}`.toLocaleLowerCase().includes(query),
  );
}
export function toggleCounterStaff(
  ids: string[],
  id: string,
  checked: boolean,
) {
  return checked
    ? [...new Set([...ids, id])]
    : ids.filter((assignedId) => assignedId !== id);
}
export function CounterStaffAssignments({
  staff,
  assignedUserIds,
  onChange,
}: {
  staff: VendorStaffSummary[];
  assignedUserIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = filterCounterStaff(staff, search);
  return (
    <>
      <ConfigurationInput
        type="search"
        label="Find staff"
        description="Search by name or email. Staff selections are kept when you change the search."
        data-vendor-draft-ignore
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing)
            event.preventDefault();
        }}
      />
      <p className="ops-muted" role="status">
        {filtered.length} of {staff.length} staff shown
      </p>
      {filtered.length ? (
        filtered.map((member) => (
          <ConfigurationCheck
            key={member.id}
            label={`${member.name} · ${member.email || ""}`}
            checked={assignedUserIds.includes(member.id)}
            onChange={(event) =>
              onChange(
                toggleCounterStaff(
                  assignedUserIds,
                  member.id,
                  event.currentTarget.checked,
                ),
              )
            }
          />
        ))
      ) : (
        <p className="ops-muted">
          {staff.length
            ? "No staff match this search."
            : "No staff are available to assign."}
        </p>
      )}
    </>
  );
}
