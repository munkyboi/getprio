import { useId, useState } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "./components/ui/combobox";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "./components/ui/field";

/** Presentation input only. Eligibility must come from the authoritative extra options. */
export interface NamedExtraMemberOption {
  id: string;
  name: string;
  eligible: boolean;
  availability: "available" | "unavailable" | "unknown";
  reason?: string;
}
export function namedExtraMemberIssue(
  ids: readonly string[],
  quantity: string,
  members: readonly NamedExtraMemberOption[],
): string | undefined {
  const count = Number(quantity);
  if (!Number.isSafeInteger(count) || count < 1)
    return "Set a whole quantity before choosing names.";
  if (new Set(ids).size !== ids.length) return "Choose each name only once.";
  if (
    ids.some(
      (id) => !members.some((member) => member.id === id && member.eligible),
    )
  )
    return "A selected name is no longer available. Remove it and choose an available name.";
  if (ids.length !== count)
    return `Choose exactly ${count} ${count === 1 ? "name" : "names"}. ${ids.length} selected.`;
  return undefined;
}
export function canApplyNamedExtraMembers(
  previous: readonly string[],
  next: readonly string[],
  quantity: string,
  members: readonly NamedExtraMemberOption[],
): boolean {
  if (new Set(next).size !== next.length) return false;
  // Removal is always allowed, including after quantity reduction or stale choices.
  if (next.every((id) => previous.includes(id))) return true;
  const count = Number(quantity);
  return (
    Number.isSafeInteger(count) &&
    count > 0 &&
    next.length <= count &&
    next.every(
      (id) =>
        previous.includes(id) ||
        members.some(
          (member) =>
            member.id === id &&
            member.eligible &&
            member.availability === "available",
        ),
    )
  );
}
export function NamedExtraMembers({
  label,
  context,
  members,
  selectedIds,
  quantity,
  busy,
  showErrors = false,
  onChange,
}: {
  label: string;
  context: string;
  members: NamedExtraMemberOption[];
  selectedIds: string[];
  quantity: string;
  busy: boolean;
  showErrors?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const id = useId(),
    anchor = useComboboxAnchor();
  const [touched, setTouched] = useState(false);
  const [search, setSearch] = useState("");
  const selected = selectedIds.map(
    (memberId, index) =>
      members.find((member) => member.id === memberId) || {
        id: memberId,
        name: `Unavailable selected name ${index + 1}`,
        eligible: false,
        availability: "unknown" as const,
      },
  );
  const items = [
    ...members.filter((member) => member.eligible),
    ...selected.filter((member) => !member.eligible),
  ];
  const count = Number(quantity),
    validCount = Number.isSafeInteger(count) && count > 0;
  const full = !validCount || selectedIds.length >= count;
  const issue = namedExtraMemberIssue(selectedIds, quantity, members);
  const invalid = Boolean(
    issue &&
      (showErrors ||
        touched ||
        selected.some((member) => !member.eligible) ||
        (validCount && selectedIds.length > count)),
  );
  return (
    <Field data-invalid={invalid} data-disabled={busy} className="v:min-w-0">
      <FieldLabel htmlFor={id}>
        {label}
        <span className="v:sr-only"> for {context}</span>
      </FieldLabel>
      <Combobox
        multiple
        inputValue={search}
        onInputValueChange={setSearch}
        items={items}
        value={selected}
        disabled={busy}
        itemToStringLabel={(member) => member.name}
        itemToStringValue={(member) => member.id}
        isItemEqualToValue={(a, b) => a.id === b.id}
        onValueChange={(next) => {
          const ids = next.map((member) => member.id);
          if (canApplyNamedExtraMembers(selectedIds, ids, quantity, members)) {
            onChange(ids);
            setSearch("");
          }
        }}
      >
        <div ref={anchor} className="v:w-full v:min-w-0">
          <ComboboxChips className="v:w-full v:min-w-0 v:min-h-11">
            <ComboboxValue>
              {selected.map((member, index) => (
                <ComboboxChip
                  key={`${member.id}:${index}`}
                  className="v:h-auto v:min-h-11 v:max-w-full v:whitespace-normal"
                  removeLabel={`Remove ${member.name} from ${context}`}
                  removeClassName="v:size-11 v:opacity-100"
                >
                  <span className="v:min-w-0 v:break-words">
                    {member.name}
                    {!member.eligible
                      ? " · Unavailable selection"
                      : member.availability === "unknown"
                        ? " · Availability unknown"
                        : member.availability === "unavailable"
                          ? " · Availability changed"
                          : ""}
                  </span>
                </ComboboxChip>
              ))}
            </ComboboxValue>
            <ComboboxChipsInput
              id={id}
              placeholder="Search names"
              className="v:min-h-11 v:min-w-16"
              aria-invalid={invalid}
              aria-describedby={`${id}-help${invalid ? ` ${id}-error` : ""}`}
              onBlur={() => setTouched(true)}
            />
          </ComboboxChips>
        </div>
        <ComboboxContent anchor={anchor} className="v:max-w-[calc(100vw-32px)]">
          <ComboboxEmpty>No available names found.</ComboboxEmpty>
          <ComboboxList>
            {(member) => (
              <ComboboxItem
                key={member.id}
                value={member}
                disabled={
                  busy ||
                  (!selectedIds.includes(member.id) &&
                    (full ||
                      !member.eligible ||
                      member.availability !== "available"))
                }
              >
                {member.name}
                {!member.eligible
                  ? " · Unavailable selection"
                  : member.availability !== "available"
                    ? ` · ${member.reason || (member.availability === "unknown" ? "Availability unknown" : "Currently unavailable")}`
                    : ""}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldDescription id={`${id}-help`}>
        {selectedIds.length}/{validCount ? count : "—"} selected. All selected
        names use this extra’s duration.
      </FieldDescription>
      {selected.some(
        (member) => member.eligible && member.availability !== "available",
      ) ? (
        <ul
          aria-label="Selected member availability"
          className="v:m-0 v:pl-4 v:text-sm v:text-muted-foreground"
        >
          {selected
            .filter(
              (member) =>
                member.eligible && member.availability !== "available",
            )
            .map((member) => (
              <li key={member.id}>
                {member.name}:{" "}
                {member.reason || "Availability has not been confirmed."} Review
                or refresh this selection.
              </li>
            ))}
        </ul>
      ) : null}
      {invalid ? <FieldError id={`${id}-error`}>{issue}</FieldError> : null}
    </Field>
  );
}
