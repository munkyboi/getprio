import { scrollTaskControlIntoView } from "./taskDialogFocus";
import {
  NamedExtraMembers,
  namedExtraMemberIssue,
  type NamedExtraMemberOption,
} from "./NamedExtraMembers";
import {
  useQueueNamedAvailability,
  type NamedAvailabilityScope,
} from "./useQueueNamedAvailability";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion";
import {
  selectionValidationFocus,
  type SelectionValidationFocus,
} from "./queueSelectionValidationFocus";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "./components/ui/tooltip";
import { Alert, AlertDescription } from "./components/ui/alert";
import { useEffect, useLayoutEffect, useRef, useId, useState } from "react";
import { IconInfoCircle, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  FieldDescription,
} from "./components/ui/field";
import type {
  QueueSelectionOptionsV4,
  QueueServiceSelectionInputV4,
} from "../../../shared/queueSelectionPlanV4";
import type { NamedQueueServiceDraft } from "./namedQueueSelectionDraft";
import { ConfigurationInput, ConfigurationSelect } from "./ConfigurationUi";
import { Button } from "./components/ui/button";
import { durationCountIssue } from "./QueueDurationCount";

function SelectionRemove({
  label,
  busy,
  onRemove,
  inline = false,
  action,
}: {
  label: string;
  busy: boolean;
  onRemove: () => void;
  inline?: boolean;
  action?: string;
}) {
  const id = useId(),
    [open, setOpen] = useState(false);
  return (
    <span
      className={
        inline ? "service-accordion-remove" : "selection-remove-action"
      }
    >
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          aria-describedby={open ? id : undefined}
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              data-selection-action={action}
              disabled={busy}
              onClick={onRemove}
              onFocus={(event) =>
                event.currentTarget.scrollIntoView({ block: "nearest" })
              }
            />
          }
        >
          <IconTrash aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent
          id={id}
          role="tooltip"
          className="v:max-w-[calc(100vw-32px)] v:break-words"
        >
          {label}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

export function selectionInputV4(
  rows: NamedQueueServiceDraft[],
): QueueServiceSelectionInputV4[] {
  const number = (value: string | undefined) =>
    value?.trim() ? Number(value) : null;
  return rows.map((row) => ({
    serviceSelectionId: row.serviceSelectionId,
    serviceId: row.serviceId || null,
    resources: row.courts.map((resource) => ({
      resourceSelectionId: resource.courtSelectionId,
      resourceMemberId: resource.resourceMemberId || null,
      // Older plans can omit fixed resource quantity/count values even though
      // the review UI renders their canonical defaults.
      quantity: number(resource.resourceQuantity) ?? 1,
      durationCount: number(resource.durationCount) ?? 1,
      durationPolicyRevision: resource.durationPolicyRevision || null,
      // Legacy amendments can retain an empty extras row after the extras
      // model was removed from the editor. Do not serialize that row as
      // executable demand; preserve only fully identified, positive entries.
      extras: resource.extras.filter((extra) => {
        const quantity = extra.quantity?.trim() ? Number(extra.quantity) : 1;
        const durationCount = extra.durationCount?.trim() ? Number(extra.durationCount) : 1;
        return Boolean(extra.serviceId) && Boolean(extra.quantity?.trim() || extra.durationCount?.trim()) && Number.isInteger(quantity) && quantity > 0 && Number.isInteger(durationCount) && durationCount > 0;
      }).map((extra) => ({
        extraSelectionId: extra.extraSelectionId,
        ...(extra.resourceMemberIds !== undefined
          ? { resourceMemberIds: [...extra.resourceMemberIds] }
          : {}),
        serviceId: extra.serviceId || null,
        quantity: number(extra.quantity) ?? 1,
        durationCount: number(extra.durationCount) ?? 1,
        durationPolicyRevision: extra.durationPolicyRevision || null,
      })),
    })),
  }));
}
export function selectionIssuesV4(
  rows: NamedQueueServiceDraft[],
  options: QueueSelectionOptionsV4,
): string[] {
  const issues: string[] = [];
  if (!rows.length) issues.push("Add at least one service.");
  const selected = rows
    .filter((row) => !row.directResource)
    .map((row) => row.serviceId)
    .filter(Boolean);
  if (new Set(selected).size !== selected.length)
    issues.push(
      "Choose each root service once; add more resources beneath that service.",
    );
  for (const row of rows) {
    if (row.directResource) {
      const policy = options.services
        .flatMap((service) => service.extras)
        .find((extra) => extra.serviceId === row.serviceId);
      if (!policy?.configured || !policy.resourceReady || !policy.durationPolicy) {
        issues.push("Review unavailable resource configuration.");
        continue;
      }
      if (!row.courts.length) {
        issues.push("Add a resource beneath each resource pool.");
        continue;
      }
      for (const resource of row.courts) {
        if (
          resource.durationPolicyRevision !== policy.durationPolicy.revision ||
          durationCountIssue(resource.durationCount || "", policy.durationPolicy)
        )
          issues.push("Review the resource duration count and policy.");
        const quantity = Number(resource.resourceQuantity);
        if (
          !Number.isSafeInteger(quantity) ||
          quantity < policy.quantityMin ||
          quantity > policy.quantityMax
        )
          issues.push("Review resource quantity.");
        if (
          policy.assignmentPolicy.mode === "named" &&
          !policy.resourceMembers.some(
            (member) =>
              member.id === resource.resourceMemberId &&
              member.isActive &&
              !member.archivedAt,
          )
        )
          issues.push("Choose an available named resource.");
      }
      continue;
    }
    const policy = options.services.find((item) => item.id === row.serviceId);
    if (!policy) {
      issues.push("Choose an available configured service.");
      continue;
    }
    if (!row.courts.length) issues.push("Add a resource beneath each service.");
    for (const resource of row.courts) {
      if (
        policy.assignmentPolicy.mode === "automatic" &&
        resource.resourceMemberId
      )
        issues.push(
          "Assignment changed. Remove and re-add this resource after reviewing the new assignment policy.",
        );
      if (
        resource.durationPolicyRevision !== policy.durationPolicy.revision ||
        durationCountIssue(resource.durationCount || "", policy.durationPolicy)
      )
        issues.push("Review the resource duration count and policy.");
      const quantity = Number(resource.resourceQuantity);
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < policy.quantityMin ||
        quantity > policy.quantityMax
      )
        issues.push("Review resource quantity.");
      if (
        policy.assignmentPolicy.mode === "named" &&
        !policy.resourceMembers.some(
          (member) =>
            member.id === resource.resourceMemberId &&
            member.isActive &&
            !member.archivedAt,
        )
      )
        issues.push("Choose an available named resource.");
      for (const required of policy.extras.filter(
        (extra) => extra.selectionRequirement === "required",
      ))
        if (
          !resource.extras.some(
            (extra) => extra.serviceId === required.serviceId,
          )
        )
          issues.push(`Add required extra ${required.name}.`);
      for (const extra of resource.extras) {
        const choice = policy.extras.find(
          (item) => item.serviceId === extra.serviceId,
        );
        if (!choice?.configured || !choice.resourceReady) {
          issues.push("Review unavailable extra configuration.");
          continue;
        }
        if (
          extra.durationPolicyRevision !== choice.durationPolicy.revision ||
          durationCountIssue(extra.durationCount || "", choice.durationPolicy)
        )
          issues.push("Review the extra duration count and policy.");
        if (choice.assignmentPolicy.mode === "named") {
          if (
            !options.capabilities?.namedExtraMembers ||
            namedExtraMemberIssue(
              extra.resourceMemberIds || [],
              extra.quantity,
              choice.resourceMembers.map((member) => ({
                id: member.id,
                name: member.name,
                eligible: member.isActive && !member.archivedAt,
                availability: "unknown",
              })),
            )
          )
            issues.push(
              "Choose exactly the configured quantity of available extra names.",
            );
        } else if (extra.resourceMemberIds?.length)
          issues.push("Extra assignment changed. Review the selected names.");
        const count = Number(extra.quantity);
        if (
          !Number.isSafeInteger(count) ||
          count < choice.quantityMin ||
          count > choice.quantityMax
        )
          issues.push("Review extra quantity.");
        if (
          Number(extra.durationCount) * choice.durationPolicy.baseMinutes >
          Number(resource.durationCount) * policy.durationPolicy.baseMinutes
        )
          issues.push("An extra cannot outlast its parent resource.");
      }
    }
  }
  return [...new Set(issues)];
}
export function QueueSelectionFieldsV4({
  rows,
  options,
  busy,
  onChange,
  validationRequest = 0,
  availabilityScope,
}: {
  rows: NamedQueueServiceDraft[];
  options: QueueSelectionOptionsV4;
  busy: boolean;
  onChange: (rows: NamedQueueServiceDraft[]) => void;
  validationRequest?: number;
  availabilityScope?: NamedAvailabilityScope;
}) {
  const availabilityEnabled = Boolean(
    options.capabilities?.namedResourceAvailability && availabilityScope,
  );
  const availability = useQueueNamedAvailability(
    availabilityScope,
    availabilityEnabled,
    options.catalogRevision,
    selectionInputV4(rows),
  );
  function membersFor(
    selectionId: string,
    members: (typeof options.services)[number]["resourceMembers"],
  ): NamedExtraMemberOption[] {
    const preview = availability.response?.selections.find(
      (item) => item.selectionId === selectionId,
    );
    return members.map((member) => {
      const interval = preview?.resourceMembers.find(
        (item) => item.id === member.id,
      );
      return {
        id: member.id,
        name: member.name,
        eligible: member.isActive && !member.archivedAt,
        availability:
          preview?.configurationValid && interval
            ? interval.availability.state
            : "unknown",
        reason:
          interval?.availability.message ||
          availability.message ||
          "Availability has not been confirmed for this interval.",
      };
    });
  }
  const [expandedServices, setExpandedServices] = useState<string[]>(() =>
    rows.map((row) => row.serviceSelectionId),
  );
  const knownServices = useRef(
    new Set(rows.map((row) => row.serviceSelectionId)),
  );
  const [expandedResources, setExpandedResources] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.serviceSelectionId,
        row.courts.map((resource) => resource.courtSelectionId),
      ]),
    ),
  );
  const knownResources = useRef(
    new Set(
      rows.flatMap((row) =>
        row.courts.map((resource) => resource.courtSelectionId),
      ),
    ),
  );
  useEffect(() => {
    const known = knownResources.current;
    setExpandedResources((previous) => {
      const next = Object.fromEntries(
        rows.map((row) => [
          row.serviceSelectionId,
          row.courts
            .filter(
              (resource) =>
                !known.has(resource.courtSelectionId) ||
                previous[row.serviceSelectionId]?.includes(
                  resource.courtSelectionId,
                ),
            )
            .map((resource) => resource.courtSelectionId),
        ]),
      );
      return JSON.stringify(previous) === JSON.stringify(next)
        ? previous
        : next;
    });
    knownResources.current = new Set(
      rows.flatMap((row) =>
        row.courts.map((resource) => resource.courtSelectionId),
      ),
    );
  }, [rows]);
  const accordionRef = useRef<HTMLDivElement>(null);
  const handledValidation = useRef(0);
  const pendingValidationFocus = useRef<
    SelectionValidationFocus | "add-service" | null
  >(null);
  useEffect(() => {
    const ids = rows.map((row) => row.serviceSelectionId);
    const added = ids.filter((id) => !knownServices.current.has(id));
    knownServices.current = new Set(ids);
    setExpandedServices((previous) => {
      const next = [...previous.filter((id) => ids.includes(id)), ...added];
      return next.length === previous.length &&
        next.every((id, index) => id === previous[index])
        ? previous
        : next;
    });
  }, [rows]);
  useEffect(() => {
    if (
      !validationRequest ||
      handledValidation.current === validationRequest ||
      busy
    )
      return;
    handledValidation.current = validationRequest;
    const target = selectionValidationFocus(rows, options);
    pendingValidationFocus.current = target || "add-service";
    if (target?.resourceId)
      setExpandedResources((previous) => ({
        ...previous,
        [target.serviceId]: [
          ...new Set([
            ...(previous[target.serviceId] || []),
            target.resourceId!,
          ]),
        ],
      }));
    setExpandedServices((previous) =>
      target && !previous.includes(target.serviceId)
        ? [...previous, target.serviceId]
        : [...previous],
    );
  }, [validationRequest, rows, options, busy]);
  useLayoutEffect(() => {
    const target = pendingValidationFocus.current;
    if (!target) return;
    pendingValidationFocus.current = null;
    if (target === "add-service") {
      addServiceRef.current?.focus();
      return;
    }
    let scope: HTMLElement | null =
      accordionRef.current?.querySelector<HTMLElement>(
        `[data-service-id="${target.serviceId}"]`,
      ) || null;
    if (target.resourceId)
      scope =
        scope?.querySelector<HTMLElement>(
          `[data-resource-id="${target.resourceId}"]`,
        ) || scope;
    if (target.extraId)
      scope =
        scope?.querySelector<HTMLElement>(
          `[data-extra-id="${target.extraId}"]`,
        ) || scope;
    let control: HTMLElement | null = null;
    if (target.label) {
      const label = [...(scope?.querySelectorAll("label") || [])].find(
        (item) =>
          item.textContent?.replace(/\s+/g, " ").trim() === target.label,
      );
      if (label?.htmlFor) control = document.getElementById(label.htmlFor);
    }
    if (target.action)
      control =
        scope?.querySelector<HTMLElement>(
          `[data-selection-action="${target.action}"]`,
        ) || null;
    control ||=
      scope?.querySelector<HTMLElement>(
        '[aria-invalid="true"], input:invalid, [data-slot="accordion-trigger"]',
      ) || null;
    // Let the panel and dialog focus manager finish opening before focusing a kept-mounted field.
    const frame = window.requestAnimationFrame(() => {
      if (control?.getClientRects().length) {
        control.focus({ preventScroll: true });
        const main = control.closest<HTMLElement>(".queue-dialog-main");
        if (main) scrollTaskControlIntoView(main, control);
        else control.scrollIntoView({ block: "nearest" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expandedServices, expandedResources, rows]);
  const addServiceRef = useRef<HTMLButtonElement>(null);
  const focusAfterRemove = useRef(false);
  const resourceButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const removedResourceParent = useRef<string | null>(null);
  const extraButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const removedExtraParent = useRef<string | null>(null);
  useEffect(() => {
    if (removedExtraParent.current) {
      extraButtons.current[removedExtraParent.current]?.focus();
      removedExtraParent.current = null;
    }
    if (removedResourceParent.current) {
      resourceButtons.current[removedResourceParent.current]?.focus();
      removedResourceParent.current = null;
    }
    if (focusAfterRemove.current) {
      focusAfterRemove.current = false;
      addServiceRef.current?.focus();
    }
  }, [rows]);
  const addService = (
    <Button
      ref={addServiceRef}
      type="button"
      variant="outline"
      disabled={busy}
      className={rows.length ? undefined : "service-empty-add"}
      onClick={() =>
        onChange([
          ...rows,
          {
            serviceSelectionId: crypto.randomUUID(),
            serviceId: "",
            courts: [],
          },
        ])
      }
    >
      <IconPlus data-icon="inline-start" aria-hidden="true" />
      Add service
    </Button>
  );
  const update = (
    serviceId: string,
    resourceId: string,
    change: Partial<NamedQueueServiceDraft["courts"][number]>,
  ) =>
    onChange(
      rows.map((row) =>
        row.serviceSelectionId === serviceId
          ? {
              ...row,
              courts: row.courts.map((resource) =>
                resource.courtSelectionId === resourceId
                  ? { ...resource, ...change }
                  : resource,
              ),
            }
          : row,
      ),
    );
  return (
    <FieldGroup
      className="named-queue-fields"
      aria-label="Service resource selections"
    >
      <FieldSet>
        <FieldLegend className="service-group-heading">
          <span>Services</span>
          {rows.length ? addService : null}
        </FieldLegend>
        <FieldDescription>
          Add each service once, then choose its resources and extras below.
        </FieldDescription>
      </FieldSet>
      <Alert variant="info" role="status">
        <IconInfoCircle aria-hidden="true" />
        <AlertDescription className="v:min-w-0 v:col-start-2">
          {rows.filter((row) => row.serviceId).length > 1
            ? "Multiple services"
            : "Single service"}{" "}
          · Resources and extras remain within their selected service.
        </AlertDescription>
      </Alert>
      {availabilityEnabled ? (
        <p className="ops-muted" role="status">
          {availability.message ||
            "Availability is provisional for the selected interval. Call protects resources; Start revalidates them. Later stages use a provisional start."}
        </p>
      ) : null}
      {!rows.length ? addService : null}
      <div ref={accordionRef}>
        <Accordion
          multiple
          keepMounted
          value={expandedServices}
          onValueChange={(next) => {
            if (!busy) setExpandedServices(next);
          }}
          className="request-service-accordion v:gap-4"
        >
          {rows.map((row, index) => {
            const policy = options.services.find(
              (item) => item.id === row.serviceId,
            );
            return (
              <AccordionItem
                key={row.serviceSelectionId}
                value={row.serviceSelectionId}
                disabled={busy}
                data-service-id={row.serviceSelectionId}
                className="v:rounded-xl v:border v:border-border"
              >
                <div className="service-accordion-header">
                  <AccordionTrigger iconPosition="start" headingLevel={4}>
                    <span className="v:min-w-0 v:break-words">
                      Service {index + 1}
                      {policy ? ` · ${policy.name}` : ""}
                    </span>
                  </AccordionTrigger>
                  <SelectionRemove
                    inline
                    action="remove-service"
                    busy={busy}
                    label={`Remove service ${index + 1}${policy ? `, ${policy.name}` : ""}`}
                    onRemove={() => {
                      focusAfterRemove.current = true;
                      onChange(
                        rows.filter(
                          (item) =>
                            item.serviceSelectionId !== row.serviceSelectionId,
                        ),
                      );
                    }}
                  />
                </div>
                <AccordionContent keepMounted>
                  <div className="queue-stack">
                    <ConfigurationSelect
                      label={
                        <>
                          Choose service
                          <span className="v:sr-only">
                            {" "}
                            for service {index + 1}
                          </span>
                        </>
                      }
                      value={row.serviceId || "__none__"}
                      disabled={busy}
                      data={[
                        { value: "__none__", label: "Choose service" },
                        ...options.services.map((service) => ({
                          value: service.id,
                          label: service.name,
                        })),
                        ...(!policy && row.serviceId
                          ? [
                              {
                                value: row.serviceId,
                                label: "Unavailable service — review selection",
                              },
                            ]
                          : []),
                      ]}
                      onChange={(value) =>
                        onChange(
                          rows.map((item) =>
                            item.serviceSelectionId === row.serviceSelectionId
                              ? {
                                  ...item,
                                  serviceId:
                                    value === "__none__" ? "" : value || "",
                                }
                              : item,
                          ),
                        )
                      }
                    />
                    {policy ? (
                      <>
                        <p>
                          {policy.assignmentPolicy.mode === "named"
                            ? "Select a named resource."
                            : "Automatic pooled capacity; no physical named member is selected."}{" "}
                          Resources start together; selected extras start with
                          their parent and require explicit resolution.
                        </p>
                        <Button
                          data-selection-action="add-resource"
                          ref={(node) => {
                            resourceButtons.current[row.serviceSelectionId] =
                              node;
                          }}
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            onChange(
                              rows.map((item) =>
                                item.serviceSelectionId ===
                                row.serviceSelectionId
                                  ? {
                                      ...item,
                                      courts: [
                                        ...item.courts,
                                        {
                                          courtSelectionId: crypto.randomUUID(),
                                          resourceMemberId: "",
                                          resourceQuantity: String(
                                            policy.quantityMin,
                                          ),
                                          durationMinutes: "",
                                          durationCount: String(
                                            policy.durationPolicy.defaultCount,
                                          ),
                                          durationPolicyRevision:
                                            policy.durationPolicy.revision,
                                          durationBaseMinutes:
                                            policy.durationPolicy.baseMinutes,
                                          extras: policy.extras
                                            .filter(
                                              (extra) =>
                                                extra.selectionRequirement ===
                                                  "required" &&
                                                extra.configured,
                                            )
                                            .map((extra) => ({
                                              extraSelectionId:
                                                crypto.randomUUID(),
                                              serviceId: extra.serviceId,
                                              quantity: String(
                                                extra.quantityMin,
                                              ),
                                              durationMinutes: "",
                                              durationCount: String(
                                                extra.durationPolicy!
                                                  .defaultCount,
                                              ),
                                              durationPolicyRevision:
                                                extra.durationPolicy!.revision,
                                              durationBaseMinutes:
                                                extra.durationPolicy!
                                                  .baseMinutes,
                                            })),
                                        },
                                      ],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          Add resource to service {index + 1}
                        </Button>
                        <Accordion
                          multiple
                          keepMounted
                          value={
                            expandedResources[row.serviceSelectionId] || []
                          }
                          onValueChange={(next) => {
                            if (!busy)
                              setExpandedResources((previous) => ({
                                ...previous,
                                [row.serviceSelectionId]: next,
                              }));
                          }}
                          className="request-resource-accordion v:gap-4"
                        >
                          {row.courts.map((resource, resourceIndex) => {
                            const context = `service ${index + 1}, resource ${resourceIndex + 1}`;
                            const resourceMembers = membersFor(
                              resource.courtSelectionId,
                              policy.resourceMembers,
                            );
                            return (
                              <AccordionItem
                                key={resource.courtSelectionId}
                                value={resource.courtSelectionId}
                                disabled={busy}
                                data-resource-id={resource.courtSelectionId}
                                className="v:rounded-xl v:border v:border-border"
                              >
                                <div className="service-accordion-header">
                                  <AccordionTrigger
                                    iconPosition="start"
                                    headingLevel={5}
                                  >
                                    <span className="v:min-w-0 v:break-words">
                                      Resource {resourceIndex + 1}
                                      {resource.resourceMemberId
                                        ? ` · ${policy.resourceMembers.find((member) => member.id === resource.resourceMemberId)?.name || "Unavailable selected resource"}`
                                        : policy.assignmentPolicy.mode ===
                                            "automatic"
                                          ? " · Pooled capacity"
                                          : ""}
                                    </span>
                                  </AccordionTrigger>
                                  <SelectionRemove
                                    inline
                                    action="remove-resource"
                                    busy={busy}
                                    label={`Remove ${policy.resourceMembers.find((member) => member.id === resource.resourceMemberId)?.name || `resource ${resourceIndex + 1}`} from ${policy.name}, service ${index + 1}, resource ${resourceIndex + 1}`}
                                    onRemove={() => {
                                      removedResourceParent.current =
                                        row.serviceSelectionId;
                                      onChange(
                                        rows.map((item) =>
                                          item.serviceSelectionId ===
                                          row.serviceSelectionId
                                            ? {
                                                ...item,
                                                courts: item.courts.filter(
                                                  (child) =>
                                                    child.courtSelectionId !==
                                                    resource.courtSelectionId,
                                                ),
                                              }
                                            : item,
                                        ),
                                      );
                                    }}
                                  />
                                </div>
                                <AccordionContent keepMounted>
                                  <div className="queue-stack">
                                    {resource.durationPolicyRevision !==
                                    policy.durationPolicy.revision ? (
                                      <Button
                                        data-selection-action="review-resource-policy"
                                        type="button"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() =>
                                          update(
                                            row.serviceSelectionId,
                                            resource.courtSelectionId,
                                            {
                                              durationPolicyRevision:
                                                policy.durationPolicy.revision,
                                              durationBaseMinutes:
                                                policy.durationPolicy
                                                  .baseMinutes,
                                            },
                                          )
                                        }
                                      >
                                        Review current duration policy for{" "}
                                        {context}
                                      </Button>
                                    ) : null}
                                    {policy.assignmentPolicy.mode ===
                                    "named" ? (
                                      <ConfigurationSelect
                                        label={`${policy.labels.resources} for ${context}`}
                                        value={
                                          resource.resourceMemberId ||
                                          "__none__"
                                        }
                                        disabled={busy}
                                        data={[
                                          {
                                            value: "__none__",
                                            label: "Choose resource",
                                          },
                                          ...policy.resourceMembers
                                            .filter(
                                              (member) =>
                                                member.isActive &&
                                                !member.archivedAt,
                                            )
                                            .map((member) => ({
                                              value: member.id,
                                              label: `${member.name}${availabilityEnabled && resourceMembers.find((item) => item.id === member.id)?.availability !== "available" ? ` · ${resourceMembers.find((item) => item.id === member.id)?.reason || "Availability unknown"}` : ""}`,
                                              disabled:
                                                availabilityEnabled &&
                                                member.id !==
                                                  resource.resourceMemberId &&
                                                resourceMembers.find(
                                                  (item) =>
                                                    item.id === member.id,
                                                )?.availability !== "available",
                                            })),
                                          ...(resource.resourceMemberId &&
                                          !policy.resourceMembers.some(
                                            (member) =>
                                              member.id ===
                                                resource.resourceMemberId &&
                                              member.isActive &&
                                              !member.archivedAt,
                                          )
                                            ? [
                                                {
                                                  value:
                                                    resource.resourceMemberId,
                                                  label: (() => {
                                                    const retained =
                                                      policy.resourceMembers.find(
                                                        (member) =>
                                                          member.id ===
                                                          resource.resourceMemberId,
                                                      );
                                                    return retained
                                                      ? `${retained.name} · ${retained.archivedAt ? "Archived" : "Maintenance"} — review selection`
                                                      : "Unavailable resource — review selection";
                                                  })(),
                                                },
                                              ]
                                            : []),
                                        ]}
                                        onChange={(value) => {
                                          if (
                                            availabilityEnabled &&
                                            value !== "__none__" &&
                                            value !==
                                              resource.resourceMemberId &&
                                            resourceMembers.find(
                                              (item) => item.id === value,
                                            )?.availability !== "available"
                                          )
                                            return;
                                          update(
                                            row.serviceSelectionId,
                                            resource.courtSelectionId,
                                            {
                                              resourceMemberId:
                                                value === "__none__"
                                                  ? ""
                                                  : value || "",
                                            },
                                          );
                                        }}
                                      />
                                    ) : null}
                                    {availabilityEnabled &&
                                    resource.resourceMemberId &&
                                    resourceMembers.find(
                                      (item) =>
                                        item.id === resource.resourceMemberId,
                                    )?.availability !== "available" ? (
                                      <p className="ops-muted">
                                        {resourceMembers.find(
                                          (item) =>
                                            item.id ===
                                            resource.resourceMemberId,
                                        )?.reason ||
                                          "Selected resource availability is unknown."}{" "}
                                        The selected name is retained.
                                      </p>
                                    ) : null}
                                    {policy.assignmentPolicy.mode ===
                                    "automatic" ? (
                                      <ConfigurationInput
                                        label={`Resource quantity for ${context}`}
                                        type="number"
                                        inputMode="numeric"
                                        min={policy.quantityMin}
                                        max={policy.quantityMax}
                                        step={1}
                                        disabled={busy}
                                        value={resource.resourceQuantity || ""}
                                        onChange={(event) =>
                                          update(
                                            row.serviceSelectionId,
                                            resource.courtSelectionId,
                                            {
                                              resourceQuantity:
                                                event.currentTarget.value,
                                            },
                                          )
                                        }
                                      />
                                    ) : null}
                                    <p className="request-inherited-duration">
                                      {policy.labels.duration}: {resource.durationCount || "1"} × {resource.durationBaseMinutes || policy.durationPolicy.baseMinutes} minutes · inherited from this request
                                    </p>
                                    <Button
                                      data-selection-action="add-extra"
                                      ref={(node) => {
                                        extraButtons.current[
                                          resource.courtSelectionId
                                        ] = node;
                                      }}
                                      type="button"
                                      variant="outline"
                                      disabled={
                                        busy ||
                                        !policy.extras.some(
                                          (extra) =>
                                            extra.configured &&
                                            extra.resourceReady,
                                        )
                                      }
                                      onClick={() =>
                                        update(
                                          row.serviceSelectionId,
                                          resource.courtSelectionId,
                                          {
                                            extras: [
                                              ...resource.extras,
                                              {
                                                extraSelectionId:
                                                  crypto.randomUUID(),
                                                serviceId: "",
                                                quantity: "",
                                                durationMinutes: "",
                                              },
                                            ],
                                          },
                                        )
                                      }
                                    >
                                      <IconPlus
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                      />
                                      Add extra
                                      <span className="v:sr-only">
                                        {" "}
                                        for {context}
                                      </span>
                                    </Button>
                                    {resource.extras.map(
                                      (extra, extraIndex) => {
                                        const choice = policy.extras.find(
                                          (item) =>
                                            item.serviceId === extra.serviceId,
                                        );
                                        const extraContext = `${context}, extra ${extraIndex + 1}`;
                                        const updateExtra = (
                                          change: Partial<typeof extra>,
                                        ) =>
                                          update(
                                            row.serviceSelectionId,
                                            resource.courtSelectionId,
                                            {
                                              extras: resource.extras.map(
                                                (item) =>
                                                  item.extraSelectionId ===
                                                  extra.extraSelectionId
                                                    ? { ...item, ...change }
                                                    : item,
                                              ),
                                            },
                                          );
                                        return (
                                          <FieldSet
                                            variant="outlined"
                                            key={extra.extraSelectionId}
                                            data-extra-id={
                                              extra.extraSelectionId
                                            }
                                            className="queue-stack named-extra-fields selection-fieldset"
                                          >
                                            <FieldLegend>
                                              Extra {extraIndex + 1}
                                            </FieldLegend>
                                            <SelectionRemove
                                              action="remove-extra"
                                              busy={
                                                busy ||
                                                choice?.selectionRequirement ===
                                                  "required"
                                              }
                                              label={`Remove ${choice?.name || `extra ${extraIndex + 1}`} from ${policy.resourceMembers.find((member) => member.id === resource.resourceMemberId)?.name || `resource ${resourceIndex + 1}`}, ${extraContext}`}
                                              onRemove={() => {
                                                removedExtraParent.current =
                                                  resource.courtSelectionId;
                                                update(
                                                  row.serviceSelectionId,
                                                  resource.courtSelectionId,
                                                  {
                                                    extras:
                                                      resource.extras.filter(
                                                        (item) =>
                                                          item.extraSelectionId !==
                                                          extra.extraSelectionId,
                                                      ),
                                                  },
                                                );
                                              }}
                                            />
                                            <p>
                                              Starts with this resource and uses
                                              its own service settings.
                                            </p>
                                            <ConfigurationSelect
                                              label={
                                                <>
                                                  Choose extra
                                                  <span className="v:sr-only">
                                                    {" "}
                                                    for {extraContext}
                                                  </span>
                                                </>
                                              }
                                              value={
                                                extra.serviceId || "__none__"
                                              }
                                              disabled={busy}
                                              data={[
                                                {
                                                  value: "__none__",
                                                  label: "Choose extra",
                                                },
                                                ...policy.extras
                                                  .filter(
                                                    (item) =>
                                                      item.configured &&
                                                      item.resourceReady,
                                                  )
                                                  .map((item) => ({
                                                    value: item.serviceId,
                                                    label: `${item.name} · ${item.selectionRequirement}`,
                                                  })),
                                                ...(extra.serviceId &&
                                                (!choice?.configured ||
                                                  !choice.resourceReady)
                                                  ? [
                                                      {
                                                        value: extra.serviceId,
                                                        label:
                                                          "Unavailable extra — review selection",
                                                      },
                                                    ]
                                                  : []),
                                              ]}
                                              onChange={(value) => {
                                                const selected =
                                                  policy.extras.find(
                                                    (item) =>
                                                      item.serviceId === value,
                                                  );
                                                updateExtra({
                                                  resourceMemberIds: [],
                                                  serviceId:
                                                    value === "__none__"
                                                      ? ""
                                                      : value || "",
                                                  quantity: selected
                                                    ? String(
                                                        selected.quantityMin,
                                                      )
                                                    : "",
                                                  durationCount:
                                                    selected?.durationPolicy
                                                      ? String(
                                                          selected
                                                            .durationPolicy
                                                            .defaultCount,
                                                        )
                                                      : "",
                                                  durationPolicyRevision:
                                                    selected?.durationPolicy
                                                      ?.revision,
                                                  durationBaseMinutes:
                                                    selected?.durationPolicy
                                                      ?.baseMinutes,
                                                });
                                              }}
                                            />
                                            {!(
                                              choice?.configured &&
                                              choice.quantityMin ===
                                                choice.quantityMax &&
                                              Number(extra.quantity) ===
                                                choice.quantityMin
                                            ) ? (
                                              <ConfigurationInput
                                                label={
                                                  <>
                                                    Quantity
                                                    <span className="v:sr-only">
                                                      {" "}
                                                      for {extraContext}
                                                    </span>
                                                  </>
                                                }
                                                type="number"
                                                inputMode="numeric"
                                                min={choice?.quantityMin}
                                                max={choice?.quantityMax}
                                                step={1}
                                                disabled={
                                                  busy || !choice?.configured
                                                }
                                                value={extra.quantity}
                                                onChange={(event) =>
                                                  updateExtra({
                                                    quantity:
                                                      event.currentTarget.value,
                                                  })
                                                }
                                              />
                                            ) : null}
                                            {choice?.configured &&
                                            choice.assignmentPolicy.mode ===
                                              "named" ? (
                                              options.capabilities
                                                ?.namedExtraMembers ? (
                                                <NamedExtraMembers
                                                  label={
                                                    choice.labels.resources
                                                  }
                                                  context={extraContext}
                                                  members={membersFor(
                                                    extra.extraSelectionId,
                                                    choice.resourceMembers,
                                                  )}
                                                  selectedIds={
                                                    extra.resourceMemberIds ||
                                                    []
                                                  }
                                                  quantity={extra.quantity}
                                                  busy={busy}
                                                  showErrors={
                                                    validationRequest > 0
                                                  }
                                                  onChange={(
                                                    resourceMemberIds,
                                                  ) =>
                                                    updateExtra({
                                                      resourceMemberIds,
                                                    })
                                                  }
                                                />
                                              ) : (
                                                <p role="status">
                                                  Named extra selection is not
                                                  supported by this catalog.
                                                  Refresh and review the extra
                                                  policy.
                                                </p>
                                              )
                                            ) : extra.resourceMemberIds
                                                ?.length ? (
                                              <p role="status">
                                                Extra assignment changed. Remove
                                                and re-add this extra to review
                                                the new assignment.
                                              </p>
                                            ) : null}
                                            {choice?.configured &&
                                            extra.durationPolicyRevision !==
                                              choice.durationPolicy.revision ? (
                                              <Button
                                                data-selection-action="review-extra-policy"
                                                type="button"
                                                variant="outline"
                                                disabled={busy}
                                                onClick={() =>
                                                  updateExtra({
                                                    durationPolicyRevision:
                                                      choice.durationPolicy
                                                        .revision,
                                                    durationBaseMinutes:
                                                      choice.durationPolicy
                                                        .baseMinutes,
                                                  })
                                                }
                                              >
                                                Review current duration policy
                                                for {extraContext}
                                              </Button>
                                            ) : null}
                                            {choice?.configured ? (
                                              <p className="request-inherited-duration">
                                                {choice.labels.duration}: {" "}
                                                {extra.durationCount || "1"} × {extra.durationBaseMinutes || choice.durationPolicy.baseMinutes} minutes · inherited from this request
                                              </p>
                                            ) : (
                                              <p role="status">
                                                Choose a configured extra.
                                              </p>
                                            )}
                                          </FieldSet>
                                        );
                                      },
                                    )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
      {selectionIssuesV4(rows, options).map((issue) => (
        <p key={issue} role="status">
          {issue}
        </p>
      ))}
    </FieldGroup>
  );
}
