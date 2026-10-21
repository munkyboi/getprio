import { DurationHoursRefresh, RequestHoursNotice, requestHoursNoticeKey } from "./RequestDurationPresentation";
import { queueResourceCatalog } from "./queueResourceCatalog";
import { ResourceSetupPanel } from "./ResourceSetupPanel";
import type { ReactNode } from "react";
import {
  useQueueNamedAvailability,
  type NamedAvailabilityScope,
} from "./useQueueNamedAvailability";
import { IconInfoCircle, IconLoader } from "@tabler/icons-react";
import { Alert, AlertDescription } from "./components/ui/alert";
import {
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "./components/ui/field";
import { requestDurationFit, selectionDurationPolicy } from "./requestDurationFit";
import { countPolicyIntersection } from "./durationCountPolicy";
import { QueueDurationCount, durationTotalLabel, durationCountIssue } from "./QueueDurationCount";
import type {
  QueueDurationPolicyV4,
  QueueSelectionOptionsV4,
} from "../../../shared/queueSelectionPlanV4";
import {
  QueueSelectionFieldsV4,
  selectionInputV4,
  selectionIssuesV4,
} from "./QueueSelectionFieldsV4";
import { useRef, useState, useEffect } from "react";
import { RequestSteps, requestSteps, type RequestStep } from "./RequestSteps";
import { TaskDialog, QueueConfirmation } from "./TaskDialog";
import { Button } from "./components/ui/button";
import {
  ConfigurationCheck,
  ConfigurationInput,
  ConfigurationTextarea,
} from "./ConfigurationUi";
import {
  NamedQueueSelectionFields,
  type NamedQueueServiceChoice,
} from "./NamedQueueSelectionFields";
import {
  namedSelectionReduction,
  namedSelectionScheduleIssues,
  type NamedQueueServiceDraft,
} from "./namedQueueSelectionDraft";
import { useVendorNotifications } from "./VendorToasts";
export function requestReviewDuration(
  selection: {
    durationMinutes: string;
    durationCount?: string;
    durationBaseMinutes?: number;
    durationPolicyRevision?: string;
  },
  policy?: QueueDurationPolicyV4,
) {
  if (selection.durationCount !== undefined) {
    if (
      !policy ||
      selection.durationPolicyRevision !== policy.revision ||
      durationCountIssue(selection.durationCount, policy)
    )
      return "Review duration count and policy";
    const count = Number(selection.durationCount),
      base = selection.durationBaseMinutes ?? policy.baseMinutes;
    return Number.isSafeInteger(count) &&
      count > 0 &&
      base &&
      Number.isSafeInteger(count * base)
      ? `${count} × ${base} minutes = ${count * base} minutes`
      : "Review duration count";
  }
  return selection.durationMinutes
    ? `${selection.durationMinutes} minutes`
    : "Duration not set";
}
export interface NamedQueueFormDraft {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  catalogRevision: string | null;
  selections: NamedQueueServiceDraft[];
}
export interface ResourceCatalogItem {
  poolId?: string;
  id: string;
  name: string;
  category: string;
  serviceId: string;
  parentServiceId?: string;
  extraServiceId?: string;
  durationBaseMinutes: number;
  active: boolean;
  availabilityLabel?: string;
  assignmentMode?: "named" | "automatic";
}
function availabilityReason(reasonCode?: string | null) {
  switch (reasonCode) {
    case "RESOURCE_OCCUPIED": return "In service on another request";
    case "RESOURCE_PROTECTED":
    case "NAMED_PROTECTION_REQUIRES_REVIEW": return "Reserved by another request";
    case "RESOURCE_MEMBER_ARCHIVED": return "Archived in resource settings";
    case "RESOURCE_MAINTENANCE": return "Disabled in resource settings";
    case "ANONYMOUS_RESOURCE_USAGE": return "Pool usage cannot identify a free member";
    case "NAMED_RESOURCE_DUPLICATE": return "Already selected in this request";
    case "RESOURCE_CAPACITY_UNAVAILABLE": return "Pool capacity is in use";
    default: return null;
  }
}
function availabilityIntent(reasonCode?: string | null) {
  return reasonCode === "RESOURCE_CAPACITY_UNAVAILABLE" ? "error" : "warning";
}
export function NamedQueuePlanDialog({
  initial,
  ticketNumber,
  options,
  v4Options,
  catalogRevision,
  mode,
  busy,
  uncertain,
  error,
  publishAvailable,
  onClose,
  onSave,
  onPublish,
  onAmend,
  onRetry,
  onRefreshPolicies,
  availabilityScope,
  resourceCatalog,
  onReviewQueueSetup,
  managementActions,
  hoursRequestStartedAt,
  hoursReadFailed = false,
}: {
  hoursRequestStartedAt?: number;
  hoursReadFailed?: boolean;
  availabilityScope?: NamedAvailabilityScope;
  initial: NamedQueueFormDraft;
  ticketNumber?: string;
  options: NamedQueueServiceChoice[];
  v4Options?: QueueSelectionOptionsV4;
  catalogRevision: string;
  mode: "draft" | "amend";
  busy: boolean;
  uncertain: boolean;
  error: string;
  publishAvailable: boolean;
  onClose: () => void;
  onSave: (draft: NamedQueueFormDraft) => Promise<void>;
  onPublish: (draft: NamedQueueFormDraft) => Promise<void>;
  onAmend: (
    draft: NamedQueueFormDraft,
    reason: string,
    agreement: boolean,
  ) => Promise<void>;
  onRetry: () => Promise<void>;
  onRefreshPolicies?: () => void;
  resourceCatalog?: ResourceCatalogItem[];
  onReviewQueueSetup?: () => void;
  managementActions?: (poolId:string,visible:boolean) => ReactNode;
}) {
  const [draft, setDraft] = useState(initial),
    [reason, setReason] = useState(""),
    [agreement, setAgreement] = useState(false),
    [discard, setDiscard] = useState(false),
    [validation, setValidation] = useState("");
  const [step, setStep] = useState<RequestStep>("services");
  const [completed, setCompleted] = useState<RequestStep[]>([]);
  const [validationRequest, setValidationRequest] = useState(0);
  const [invalidStep, setInvalidStep] = useState<RequestStep | null>(null);
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("all");
  const notifications = useVendorNotifications();
  const lastResponseError = useRef("");
  useEffect(() => {
    if (!error) {
      lastResponseError.current = "";
      return;
    }
    if (error === lastResponseError.current) return;
    lastResponseError.current = error;
    const resourceAvailabilityWarning = error.includes(
      "The selected resource is unavailable or its occupancy cannot be determined",
    );
    notifications.show({
      id: `request-error-${error}`,
      color: resourceAvailabilityWarning ? "yellow" : "red",
      title: resourceAvailabilityWarning
        ? "Resource availability warning"
        : "Request could not be saved",
      message: error,
    });
  }, [error, notifications]);
  const availabilitySelections = v4Options
    ? (() => {
        const current = selectionInputV4(draft.selections).filter(
          (selection) => selection.serviceId,
        );
        const represented = new Set(current.map((selection) => selection.serviceId));
        const synthetic = v4Options.services
          .filter(
            (service) =>
              (service.resourceMembers.length > 0 ||
                service.assignmentPolicy.mode === "automatic") &&
              !represented.has(service.id),
          )
          .map((service) => ({
            serviceSelectionId: `availability-${service.id}`,
            serviceId: service.id,
            resources: [
              {
                resourceSelectionId: `availability-resource-${service.id}`,
                resourceMemberId: null,
                quantity: 1,
                durationCount: 1,
                durationPolicyRevision: service.durationPolicy.revision,
                extras: [],
              },
            ],
          }));
        return [...current, ...synthetic];
      })()
    : [];
  const availability = useQueueNamedAvailability(
    availabilityScope,
    Boolean(v4Options && availabilityScope),
    catalogRevision,
    availabilitySelections,
  );
  const addResourceCard = (serviceId: string, memberId: string | null) => {
    if (!v4Options || busy || uncertain) return;
    const policy = v4Options.services.find((service) => service.id === serviceId);
    if (!policy) return;
    const existingResources = draft.selections.flatMap(selection => selection.courts);
    const durationCount = existingResources.length ? existingResources[0].durationCount ?? "" : policy.durationPolicy.defaultCount;
    const resource = {
      courtSelectionId: crypto.randomUUID(),
      resourceMemberId: memberId,
      resourceQuantity: String(policy.quantityMin),
      durationMinutes: "",
      durationCount: String(durationCount),
      durationPolicyRevision: policy.durationPolicy.revision,
      durationBaseMinutes: policy.durationPolicy.baseMinutes,
      extras: [],
    };
    const existing = draft.selections.find((selection) => selection.serviceId === serviceId);
    if (existing?.courts.some((item) => item.resourceMemberId === memberId)) return;
    const selections = existing
      ? draft.selections.map((selection) => selection.serviceSelectionId === existing.serviceSelectionId ? { ...selection, courts: [...selection.courts, resource] } : selection)
      : [...draft.selections, { serviceSelectionId: crypto.randomUUID(), serviceId, courts: [resource] }];
    setDraft({ ...draft, selections, catalogRevision: null });
    setAgreement(false);
    setValidation("");
  };
  const addDirectResourceCard = (item: ResourceCatalogItem) => {
    if (!v4Options || busy || uncertain || !item.extraServiceId) return;
    const parentPolicy = item.parentServiceId
      ? v4Options.services.find((service) => service.id === item.parentServiceId)
      : undefined;
    const policy = parentPolicy?.extras.find((choice) => choice.serviceId === item.extraServiceId);
    if (!policy?.configured || !policy.resourceReady || !policy.durationPolicy) return;
    const existingResources = draft.selections.flatMap(selection => selection.courts);
    const durationCount = existingResources.length ? existingResources[0].durationCount ?? "" : policy.durationPolicy.defaultCount;
    const serviceId = item.extraServiceId;
    const existing = draft.selections.find((selection) => (selection.directResource || selection.serviceId === serviceId) && selection.serviceId === serviceId);
    if (existing?.courts.some((resource) => resource.resourceMemberId === (item.assignmentMode === "automatic" ? null : item.id))) return;
    const resource = {
      courtSelectionId: crypto.randomUUID(),
      resourceMemberId: item.assignmentMode === "automatic" ? null : item.id,
      resourceQuantity: String(policy.quantityMin),
      durationMinutes: "",
      durationCount: String(durationCount),
      durationPolicyRevision: policy.durationPolicy.revision,
      durationBaseMinutes: policy.durationPolicy.baseMinutes,
      extras: [],
    };
    const selections = existing
      ? draft.selections.map((selection) => selection.serviceSelectionId === existing.serviceSelectionId ? { ...selection, courts: [...selection.courts, resource] } : selection)
      : [...draft.selections, { serviceSelectionId: crypto.randomUUID(), serviceId, directResource: true, courts: [resource] }];
    setDraft({ ...draft, selections, catalogRevision: null });
    setAgreement(false);
    setValidation("");
  };
  const selectedResourceCard = (item: ResourceCatalogItem) => draft.selections
    .flatMap((row) => row.courts.map((resource) => ({ row, resource })))
    .find(({ row, resource }) => row.serviceId === (item.extraServiceId || item.serviceId)
      && resource.resourceMemberId === (item.assignmentMode === "automatic" ? null : item.id));
  const removeResourceCard = (selectionId: string, resourceId: string) => {
    if (busy || uncertain) return;
    setDraft({ ...draft, selections: draft.selections
      .map((selection) => selection.serviceSelectionId === selectionId
        ? { ...selection, courts: selection.courts.filter((resource) => resource.courtSelectionId !== resourceId) }
        : selection)
      .filter((selection) => selection.courts.length), catalogRevision: null });
  };
  const toggleResourceCard = (item: ResourceCatalogItem) => {
    if (busy || uncertain) return;
    const selected = selectedResourceCard(item);
    if (selected) removeResourceCard(selected.row.serviceSelectionId, selected.resource.courtSelectionId);
    else if (!item.active) return;
    else if (item.extraServiceId) addDirectResourceCard(item);
    else addResourceCard(item.serviceId, item.assignmentMode === "automatic" ? null : item.id);
  };
  const updateResourceQuantity = (selectionId: string, resourceId: string, quantity: number) => {
    setDraft({
      ...draft,
      selections: draft.selections.map((selection) => selection.serviceSelectionId === selectionId
        ? { ...selection, courts: selection.courts.map((resource) => resource.courtSelectionId === resourceId ? { ...resource, resourceQuantity: String(quantity) } : resource) }
        : selection),
      catalogRevision: null,
    });
    setAgreement(false);
    setValidation("");
  };
  const contentRef = useRef<HTMLDivElement>(null);
  const focusStep = useRef(false);
  useEffect(() => {
    if (!focusStep.current) return;
    focusStep.current = false;
    const heading = contentRef.current?.querySelector<HTMLElement>(
      `#request-step-${step} [data-step-heading]`,
    );
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start" });
  }, [step, validation]);
  const navigate = (next: RequestStep) => {
    if (busy || uncertain) return;
    focusStep.current = true;
    setStep(next);
  };
  const fail = (message: string, target: RequestStep = "services") => {
    setValidation(message);
    setInvalidStep(target);
    notifications.show({
      id: `request-validation-${message}`,
      color: "red",
      title: "Review service request",
      message,
    });
    focusStep.current = target !== "services" || !v4Options;
    if (target === "services" && v4Options)
      setValidationRequest((previous) => previous + 1);
    setStep(target);
  };
  const advanceStep = () => {
    if (busy || uncertain || step === "review") return;
    if (step === "services") {
      const issues = v4Options
        ? selectionIssuesV4(draft.selections, v4Options)
        : namedSelectionScheduleIssues(draft.selections);
      if (issues.length) {
        fail(issues.join(" "), "services");
        return;
      }
    }
    if (step === "customer" && !draft.customerName.trim()) {
      fail("Enter the customer name before continuing.", "customer");
      return;
    }
    setInvalidStep(null);
    setCompleted((previous) =>
      previous.includes(step) ? previous : [...previous, step],
    );
    navigate(requestSteps[requestSteps.findIndex((s) => s.id === step) + 1].id);
  };
  const changed =
      JSON.stringify(initial) !== JSON.stringify(draft) || Boolean(reason),
    reduction = namedSelectionReduction(initial.selections, draft.selections);
  const close = () => {
    if (busy || uncertain) return;
    if (changed) setDiscard(true);
    else onClose();
  };
  const catalogItems: ResourceCatalogItem[] = resourceCatalog ?? (v4Options ? queueResourceCatalog(v4Options) : []);
  const resourceFilters = [{id:"all",name:"All"},...(v4Options?.resourceSetup?.pools || [])];
  const effectiveResourceFilter = resourceFilters.some(pool=>pool.id===resourceFilter) ? resourceFilter : "all";
  const availabilityFor = (item: ResourceCatalogItem, selectionId?: string) => {
    const candidates = availability.response?.selections.filter(
      (candidate) => candidate.serviceId === (item.extraServiceId || item.serviceId),
    ) || [];
    const selection = selectionId
      ? candidates.find((candidate) => candidate.selectionId === selectionId)
      : candidates.find((candidate) => candidate.resourceMembers.some((member) => member.id === item.id)) || candidates[0];
    if (item.assignmentMode === "automatic") return selection?.availability;
    // A named resource can appear in several entries for the same service.
    // Use its own selection so another member's duplicate warning cannot bleed
    // into this card.
    return selection?.resourceMembers.find((member) => member.id === item.id)?.availability
      || candidates.flatMap((candidate) => candidate.resourceMembers).find((member) => member.id === item.id)?.availability
      || selection?.availability;
  };
  const pooledExtraAvailabilityState = (item: ResourceCatalogItem) => {
    if (!item.extraServiceId) return undefined;
    const availableUnits = v4Options?.services
      .find((service) => service.id === item.parentServiceId)
      ?.extras.find((extra) => extra.serviceId === item.extraServiceId)
      ?.availability?.availableUnits;
    return availableUnits == null ? "unknown" : availableUnits > 0 ? "available" : "unavailable";
  };
  const pooledAvailabilityUnits = (item: ResourceCatalogItem) => {
    const preview = availability.response?.selections.find(
      (selection) => selection.serviceId === (item.extraServiceId || item.serviceId),
    );
    if (preview?.availability.availableUnits != null)
      return preview.availability.availableUnits;
    const service = v4Options?.services.find((choice) => choice.id === (item.extraServiceId || item.serviceId));
    if (!service || item.assignmentMode !== "automatic") return undefined;
    return service.availability?.availableUnits ?? null;
  };
  const pooledCapacity = (item: ResourceCatalogItem) => {
    const service = v4Options?.services.find((choice) => choice.id === (item.extraServiceId || item.serviceId));
    return service?.capacity;
  };
  const [durationNow, setDurationNow] = useState(() => performance.now());
  useEffect(() => { setDurationNow(performance.now()); const timer = window.setInterval(() => setDurationNow(performance.now()), 1000); return () => window.clearInterval(timer); }, [hoursRequestStartedAt]);
  const selectedResources = draft.selections.flatMap(row => row.courts.map(resource => ({resource,policy:v4Options ? selectionDurationPolicy(row,v4Options) : undefined})));
  const durationPolicy = selectedResources[0]?.policy;
  const selectedPolicies = selectedResources.flatMap(item => item.policy ? [item.policy] : []);
  const currentCounts = new Set(selectedResources.map(item => item.resource.durationCount || ""));
  const durationCount = currentCounts.size === 1 ? [...currentCounts][0] : "";
  const hoursFit = v4Options && mode === "draft" && !hoursReadFailed ? requestDurationFit(draft.selections,v4Options,hoursRequestStartedAt,Math.max(durationNow,hoursRequestStartedAt ?? durationNow)) : undefined;
  const policyBounds = selectedPolicies.length === selectedResources.length ? countPolicyIntersection(selectedPolicies) : null;
  const durationBounds = mode === "draft" ? hoursFit?.state === "open" ? hoursFit.countBounds : null : policyBounds;
  const durationIssue = selectedResources.some(item=>!item.policy || item.resource.durationPolicyRevision!==item.policy.revision)
    ? "Duration policies changed. Review the selected resources before continuing."
    : selectedPolicies.map(policy=>durationCountIssue(durationCount,policy)).find(Boolean);
  const hoursIssue = mode === "draft" ? hoursReadFailed ? "We couldn't check the opening hours. Refresh hours to try again." : hoursFit?.message : undefined;
  const validatedCompleted = completed.filter((completedStep) => {
    if (completedStep === "services") {
      return (v4Options
        ? selectionIssuesV4(draft.selections, v4Options)
        : !draft.selections.length
          ? ["Add at least one service."]
          : namedSelectionScheduleIssues(draft.selections)
      ).length === 0;
    }
    if (completedStep === "customer") return Boolean(draft.customerName.trim());
    return false;
  });
  const updateDurationCount = (value: string) => {
    setDraft({
      ...draft,
      selections: draft.selections.map((service) => ({
        ...service,
        courts: service.courts.map((resource) => ({
          ...resource,
          durationCount: value,
          // Duration edits retain recorded child selections. Any removal must
          // be explicit and still pass the policy and amendment review guards.
        })),
      })),
      catalogRevision: null,
    });
    setAgreement(false);
    setValidation("");
  };
  return (
    <>
      <TaskDialog
        opened
        className="request-step-dialog"
        busy={busy || uncertain}
        title={
          mode === "draft"
            ? "New service request"
            : `Amend service request${ticketNumber ? ` · ${ticketNumber}` : ""}`
        }
        description="Resources keep configured durations and recorded identities. Availability is provisional until Call."
        onClose={close}
        bodyOverlay={mode === "draft" ? v4Options && durationPolicy ? <RequestHoursNotice key={requestHoursNoticeKey({scope: availabilityScope, window: v4Options.serviceHoursWindow, state: hoursReadFailed ? "read_failed" : hoursFit?.state, message: hoursIssue})} message={hoursIssue} closesLabel={hoursFit && "closesLabel" in hoursFit ? hoursFit.closesLabel : undefined} remainingMs={hoursFit?.state === "open" ? hoursFit.remainingMs : undefined} duration={hoursFit?.state === "open" ? hoursFit.duration : undefined} /> : null : undefined}
        footer={
          <>
            <Button
              variant="outline"
              className="ops-redundant-dismiss"
              disabled={busy || uncertain}
              onClick={close}
            >
              Cancel
            </Button>
            <div className="request-step-actions">
              {step !== requestSteps[0].id ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || uncertain}
                  onClick={() =>
                    navigate(
                      requestSteps[
                        requestSteps.findIndex((s) => s.id === step) - 1
                      ].id,
                    )
                  }
                >
                  Back
                </Button>
              ) : null}
              {step !== "review" ? (
                <Button
                  type="button"
                  disabled={busy || uncertain}
                  onClick={advanceStep}
                >
                  Next
                </Button>
              ) : null}
            </div>
            {uncertain ? (
              <Button disabled={busy} onClick={() => void onRetry()}>
                Retry same command
              </Button>
            ) : (
              <>
                {mode === "draft" ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onSave(draft)}
                  >
                    Save request draft
                  </Button>
                ) : null}
                {step === "review" && (mode === "amend" || publishAvailable) ? (
                  <Button type="submit" form="named-queue-plan" disabled={busy || (mode === "draft" && Boolean(v4Options) && Boolean(hoursIssue || hoursFit?.state !== "open"))}>
                    {mode === "amend"
                      ? "Apply agreed changes"
                      : "Publish request"}
                  </Button>
                ) : null}
              </>
            )}
          </>
        }
      >
        <form
          id="named-queue-plan"
          noValidate
          onChange={() => {
            setValidation("");
            setInvalidStep(null);
          }}
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || uncertain) return;
            if (step !== "review") {
              advanceStep();
              return;
            }
            setValidation("");
            setInvalidStep(null);
            if (mode === "draft" && !publishAvailable) {
              await onSave(draft);
              return;
            }
            if (mode === "draft" && v4Options && (hoursIssue || hoursFit?.state !== "open")) {
              fail(hoursIssue || "We couldn't check the opening hours. Refresh hours to try again.", "services");
              return;
            }
            if (!draft.customerName.trim()) {
              fail("Enter the customer name before publishing.", "customer");
              return;
            }
            if (
              v4Options &&
              selectionIssuesV4(draft.selections, v4Options).length
            ) {
              fail(selectionIssuesV4(draft.selections, v4Options).join(" "));
              return;
            }
            if (
              !v4Options &&
              namedSelectionScheduleIssues(draft.selections).length
            ) {
              fail(
                "An extra cannot outlast its parent resource under the current policy. Review the durations.",
              );
              return;
            }
            if (
              !draft.customerName.trim() ||
              !draft.selections.length ||
              (!v4Options &&
                draft.selections.some(
                  (service) =>
                    !service.serviceId ||
                    !service.courts.length ||
                    service.courts.some(
                      (court) =>
                        !court.resourceMemberId ||
                        !court.durationMinutes ||
                        court.extras.some(
                          (extra) =>
                            !extra.serviceId ||
                            !extra.quantity ||
                            !extra.durationMinutes,
                        ),
                    ),
                ))
            ) {
              fail(
                "Complete the customer name and resources before publishing.",
                !draft.customerName.trim() ? "customer" : "services",
              );
              return;
            }
            if (
              mode === "amend" &&
              (!reason.trim() || (reduction && !agreement))
            ) {
              fail(
                "Record a reason and confirm customer agreement for removed or reduced selections.",
                "review",
              );
              return;
            }
            if (mode === "amend")
              await onAmend(draft, reason.trim(), agreement);
            else await onPublish(draft);
          }}
        >
          <div className="request-step-layout" ref={contentRef}>
            <RequestSteps
              current={step}
              completed={validatedCompleted}
              invalid={invalidStep}
              locked={busy || uncertain}
              onChange={navigate}
            />
            <FieldGroup className="request-step-content">
              {mode === "draft" && v4Options && hoursIssue && step !== "services" ? <div role="alert"><p>{hoursIssue}</p><Button type="button" variant="outline" disabled={busy || uncertain} onClick={()=>navigate("services")}>Review duration</Button>{onRefreshPolicies ? <Button type="button" variant="outline" disabled={busy || uncertain} onClick={onRefreshPolicies}>Refresh hours</Button> : null}</div> : null}
              {uncertain ? (
                <p role="alert">
                  The command result is unknown. Retry the same command before
                  editing or closing.
                </p>
              ) : null}
              <section
                id="request-step-customer"
                hidden={step !== "customer"}
                className="request-step-panel"
              >
                <h3 tabIndex={-1} data-step-heading>
                    <span className="ops-muted">Step 2 of 3 · </span>Customer
                  details
                </h3>
                <FieldSet variant="outlined">
                  <FieldLegend>Customer</FieldLegend>
                  <FieldDescription>
                    Who is this request for? Contact details are optional.
                  </FieldDescription>
                  <FieldGroup>
                    <ConfigurationInput
                      label="Customer name"
                      error={
                        invalidStep === "customer" && !draft.customerName.trim()
                          ? "Enter the customer name before publishing."
                          : undefined
                      }
                      autoComplete="name"
                      maxLength={254}
                      value={draft.customerName}
                      disabled={busy || uncertain || mode === "amend"}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          customerName: event.currentTarget.value,
                        })
                      }
                    />
                    <ConfigurationInput
                      label="Email (optional)"
                      type="email"
                      maxLength={254}
                      value={draft.customerEmail}
                      disabled={busy || uncertain || mode === "amend"}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          customerEmail: event.currentTarget.value,
                        })
                      }
                    />
                    <ConfigurationInput
                      label="Phone (optional)"
                      type="tel"
                      maxLength={254}
                      value={draft.customerPhone}
                      disabled={busy || uncertain || mode === "amend"}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          customerPhone: event.currentTarget.value,
                        })
                      }
                    />
                    <ConfigurationTextarea
                      label="Notes"
                      maxLength={2000}
                      value={draft.notes}
                      disabled={busy || uncertain || mode === "amend"}
                      onChange={(event) =>
                        setDraft({ ...draft, notes: event.currentTarget.value })
                      }
                    />
                  </FieldGroup>
                </FieldSet>
                {mode === "amend" ? (
                  <p className="ops-muted">
                    Customer identity, contact, notes and booking/payment links
                    remain unchanged.
                  </p>
                ) : null}
              </section>
              <section
                id="request-step-services"
                hidden={step !== "services"}
                className="request-step-panel"
              >
                <h3 className="v:sr-only" tabIndex={-1} data-step-heading>
                  Select resources
                </h3>
                {!v4Options ? (
                  <Alert variant="info" role="status">
                    <IconInfoCircle aria-hidden="true" />
                    <AlertDescription className="v:min-w-0 v:col-start-2">
                      {draft.selections.filter((service) =>
                        Boolean(service.serviceId),
                      ).length > 1
                        ? "Multiple services"
                        : "Single service"}{" "}
                      · Resources remain within their selected service.
                    </AlertDescription>
                  </Alert>
                ) : null}
                {v4Options ? (
                  <div className="service-selection-pos-layout">
                    <aside className="service-resource-catalog" aria-label="Available resources">
                      <div className="service-resource-catalog-heading">
                        <div><strong>Choose a resource</strong><span className="ops-muted">Select from the configured pool</span></div>
                      </div>
                      <ConfigurationInput label="Search resources" type="search" placeholder="Search resources…" value={resourceSearch} onChange={(event) => setResourceSearch(event.currentTarget.value)} />
                      <div className="service-resource-filters" aria-label="Resource pool filters">
                        {resourceFilters.map((filter) => <button key={filter.id} type="button" className={`service-resource-filter${effectiveResourceFilter === filter.id ? " is-active" : ""}`} onClick={() => setResourceFilter(filter.id)}>{filter.name}</button>)}
                      </div>
                      <div className="service-resource-cards">
                        {catalogItems.filter((item) => (effectiveResourceFilter === "all" || item.poolId === effectiveResourceFilter) && item.name.toLowerCase().includes(resourceSearch.toLowerCase())).map((item) => {
                          const service = v4Options.services.find((choice) => choice.id === item.serviceId);
                          const selectedResource = selectedResourceCard(item);
                          const interval = availabilityFor(item, selectedResource?.resource.courtSelectionId);
                          const availabilityState = interval?.state || pooledExtraAvailabilityState(item);
                          const chosen = Boolean(selectedResource);
                          const available = item.active && (mode === "draft" || availabilityState === "available");
                          const selectedUnavailable = chosen && (!item.active || (mode === "amend" && availabilityState === "unavailable"));
                          const availableUnits = pooledAvailabilityUnits(item);
                          const capacity = pooledCapacity(item);
                          const checking = mode === "amend" && item.active && !chosen && (availability.checking || (availabilityState !== "available" && availabilityState !== "unavailable"));
                          const availabilityLabel = selectedUnavailable
                            ? "Selected · Unavailable"
                            : chosen
                            ? "Selected"
                            : !item.active
                            ? "Unavailable"
                            : mode === "draft"
                            ? "Select for request"
                            : availabilityState === "unavailable"
                            ? "Unavailable"
                            : availabilityState === "available"
                            ? item.assignmentMode === "automatic" && availableUnits != null && capacity
                              ? `Available (${availableUnits} of ${capacity})`
                              : "Available"
                            : "Checking availability";
                          const availabilityDetail = mode === "draft"
                            ? item.active ? "Availability checked when called" : "Disabled in resource settings"
                            : availabilityReason(interval?.reasonCode);
                          const availabilityTone = availabilityIntent(interval?.reasonCode);
                          // Drafts describe demand; Call rechecks capacity and protects resources.
                          const selectable = chosen || (item.active && Boolean(service) && (mode === "draft" || available));
                          const unavailable = !chosen && !selectable;
                          return <button type="button" className={`service-resource-card${chosen ? " is-selected" : ""}${selectedUnavailable ? ` is-selected-unavailable is-${availabilityTone}` : ""}${unavailable ? " is-unavailable" : ""}`} key={`${item.serviceId}-${item.extraServiceId || "resource"}-${item.id}`} aria-pressed={chosen} disabled={busy || uncertain || !selectable} onClick={() => toggleResourceCard(item)}>
                            {checking ? <span className="service-resource-card__spinner" role="status" aria-label="Checking availability"><IconLoader aria-hidden="true" /></span> : null}
                            <div><strong>{item.name}</strong><span className={selectedUnavailable || (!chosen && !available) ? "resource-availability is-unavailable" : "resource-availability"}>{availabilityLabel}</span>{availabilityDetail ? <span className="resource-availability-reason">{availabilityDetail}</span> : null}</div>
                            <strong>Configured rate</strong>
                            <span className="ops-muted">{item.category} · {item.durationBaseMinutes} min base{item.extraServiceId ? " · Extra" : ""}</span>
                          </button>;
                        })}
                      </div>
                      <ResourceSetupPanel setup={v4Options.resourceSetup} poolFilter={effectiveResourceFilter} onReviewSetup={onReviewQueueSetup} managementActions={managementActions}/>
                    </aside>
                    <div className="service-selection-form-column">
                  <div className="service-current-request-heading"><div><strong>Order</strong><span className="ops-muted">Selected resources</span></div><span className="service-request-count">{draft.selections.reduce((count, service) => count + service.courts.length, 0)} item{draft.selections.reduce((count, service) => count + service.courts.length, 0) === 1 ? "" : "s"}</span></div>
                  <div className="service-order-items">
                    {draft.selections.flatMap((selection) => { const policy = selection.directResource ? v4Options.services.flatMap((service) => service.extras).find((extra) => extra.serviceId === selection.serviceId) : v4Options.services.find((service) => service.id === selection.serviceId); return selection.courts.map((resource) => ({ policy, resource, selectionId: selection.serviceSelectionId, selection })); }).map(({ policy, resource, selectionId, selection }) => { const catalogItem = catalogItems.find((item) => (item.extraServiceId ? item.extraServiceId === selection.serviceId : item.serviceId === selection.serviceId) && (item.assignmentMode === "automatic" ? resource.resourceMemberId === null : item.id === resource.resourceMemberId)); const pooled = catalogItem?.assignmentMode === "automatic" || (!resource.resourceMemberId && policy?.assignmentPolicy?.mode === "automatic"); const orderAvailability = catalogItem ? availabilityFor(catalogItem, resource.courtSelectionId) : undefined; const orderUnavailable = catalogItem?.active === false || (mode === "amend" && orderAvailability?.state === "unavailable"); const orderTone = availabilityIntent(orderAvailability?.reasonCode); const name = catalogItem?.name || (pooled ? policy?.name : policy?.resourceMembers.find((member) => member.id === resource.resourceMemberId)?.name) || "Selected resource"; const quantityMin = policy?.quantityMin ?? 1; const configuredQuantityMax = policy?.quantityMax ?? quantityMin; const availableUnits = pooled && catalogItem ? pooledAvailabilityUnits(catalogItem) : undefined; const quantityMax = mode === "draft" || availableUnits == null ? configuredQuantityMax : Math.min(configuredQuantityMax, Math.max(quantityMin, availableUnits)); const quantity = Number(resource.resourceQuantity || quantityMin); return <div className={`service-order-item${orderUnavailable ? ` is-unavailable is-${orderTone}` : ""}`} key={resource.courtSelectionId}><div><strong>{name}</strong><span className="ops-muted">{catalogItem?.category || policy?.labels?.resources || "Resource"}</span>{orderUnavailable ? <span className="service-order-item-warning">Selected resource unavailable</span> : null}</div><div className="service-order-item-meta">{pooled ? <div className="service-order-stepper" aria-label={`${name} quantity`}><Button type="button" variant="ghost" size="icon" aria-label={`Decrease ${name} quantity`} disabled={busy || uncertain || quantity <= quantityMin} onClick={() => updateResourceQuantity(selectionId, resource.courtSelectionId, Math.max(quantityMin, quantity - 1))}>−</Button><span aria-live="polite">{quantity}</span><Button type="button" variant="ghost" size="icon" aria-label={`Increase ${name} quantity`} disabled={busy || uncertain || quantity >= quantityMax} onClick={() => updateResourceQuantity(selectionId, resource.courtSelectionId, Math.min(quantityMax, quantity + 1))}>+</Button></div> : null}<span className="service-order-duration">{resource.durationCount || "1"} × {resource.durationBaseMinutes || policy?.durationPolicy?.baseMinutes || catalogItem?.durationBaseMinutes || 1} min</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} disabled={busy || uncertain} onClick={() => removeResourceCard(selectionId, resource.courtSelectionId)}>×</Button></div></div>; })}
                    {!draft.selections.some((selection) => selection.courts.length) ? <p className="ops-muted">Click a resource card to add it to the order.</p> : null}
                  </div>
                  <div className="service-order-footer">
                    {durationPolicy ? <div className="request-duration-control"><QueueDurationCount label="Duration count" value={durationCount} policy={durationPolicy} capturedRevision={durationPolicy.revision}
                      disabled={busy || uncertain} onChange={updateDurationCount} withStepper bounds={durationBounds} validationIssue={durationIssue}
                      inputSuffix="per resource" totalLabel={!durationIssue && hoursFit?.state === "open" && Number.isFinite(hoursFit.duration) ? <><strong>{durationTotalLabel(hoursFit.duration)}</strong><span className="ops-muted">Earliest-start duration · parallel resources run together</span></> : currentCounts.size > 1 ? "Selected resources have different counts. Enter a count to update them together." : "Review each resource's duration below."}
                      summaryAction={mode === "draft" && onRefreshPolicies ? <DurationHoursRefresh disabled={busy || uncertain} onRefresh={onRefreshPolicies} /> : undefined}/></div> : null}
                    <div className="service-order-total"><span className="ops-muted">Total due</span><strong>Configured at call</strong><span className="ops-muted">Pricing is not configured for this local preview.</span></div>
                  </div>
                  <div className="service-legacy-config" aria-hidden="true"><QueueSelectionFieldsV4
                    availabilityScope={availabilityScope}
                    validationRequest={validationRequest}
                    rows={draft.selections}
                    options={v4Options}
                    busy={busy || uncertain}
                    onChange={(selections) => {
                      setDraft({ ...draft, selections, catalogRevision: null });
                      setAgreement(false);
                      setValidation("");
                    }}
                  /></div>
                    </div>
                  </div>
                ) : (
                  <NamedQueueSelectionFields
                    selections={draft.selections}
                    options={options}
                    busy={busy || uncertain}
                    onChange={(selections) => {
                      setDraft({ ...draft, selections, catalogRevision: null });
                      setAgreement(false);
                      setValidation("");
                    }}
                  />
                )}
              </section>
              <section
                id="request-step-review"
                hidden={step !== "review"}
                className="request-step-panel"
              >
                <h3 tabIndex={-1} data-step-heading>
                  <span className="ops-muted">Step 3 of 3 · </span>Review
                </h3>
                <p>
                  {draft.customerName.trim() || "Customer name not entered"}
                  {draft.customerEmail ? ` · ${draft.customerEmail}` : ""}
                  {draft.customerPhone ? ` · ${draft.customerPhone}` : ""}
                </p>
                <FieldSet variant="outlined">
                  <FieldLegend>Review request</FieldLegend>
                  <FieldDescription>
                    {
                      draft.selections.filter((service) =>
                        Boolean(service.serviceId),
                      ).length
                    }{" "}
                    selected services ·{" "}
                    {draft.selections.reduce(
                      (sum, service) => sum + service.courts.length,
                      0,
                    )}{" "}
                    resources ·{" "}
                    {draft.selections.reduce(
                      (sum, service) =>
                        sum +
                        service.courts.reduce(
                          (n, resource) => n + resource.extras.length,
                          0,
                        ),
                      0,
                    )}{" "}
                    extras
                  </FieldDescription>
                  <ol className="request-review-selections">
                    {draft.selections.map((service) => {
                      const choice = v4Options?.services.find(
                        (item) => item.id === service.serviceId,
                      );
                      const directItem = service.directResource
                        ? catalogItems.find(
                            (item) =>
                              item.extraServiceId === service.serviceId,
                          )
                        : undefined;
                      const legacy = options.find(
                        (item) => item.id === service.serviceId,
                      );
                      return (
                        <li key={service.serviceSelectionId}>
                          <strong>
                            {choice?.name ||
                              legacy?.name ||
                              directItem?.category ||
                              "Resource pool not selected"}
                          </strong>
                          <ul>
                            {service.courts.map((resource) => (
                              <li key={resource.courtSelectionId}>
                                {service.directResource
                                  ? catalogItems.find(
                                      (item) =>
                                        item.extraServiceId ===
                                          service.serviceId &&
                                        item.id === resource.resourceMemberId,
                                    )?.name || "Resource not selected"
                                  : choice?.assignmentPolicy.mode === "automatic"
                                  ? "Pooled capacity"
                                  : (
                                      choice?.resourceMembers ||
                                      legacy?.resourceMembers
                                    )?.find(
                                      (item) =>
                                        item.id === resource.resourceMemberId,
                                    )?.name || "Resource not selected"}
                                {" · "}
                                {resource.resourceQuantity || "1"} unit(s)
                                {" · "}
                                {requestReviewDuration(
                                  resource,
                                  choice?.durationPolicy,
                                )}
                                {resource.extras.length ? (
                                  <ul>
                                    {resource.extras.map((extra) => (
                                      <li key={extra.extraSelectionId}>
                                        {choice?.extras.find(
                                          (item) =>
                                            item.serviceId === extra.serviceId,
                                        )?.name ||
                                          legacy?.extras.find(
                                            (item) =>
                                              item.id === extra.serviceId,
                                          )?.name ||
                                          "Extra not selected"}
                                        {" · "}
                                        {extra.quantity || "Quantity not set"}
                                        {extra.resourceMemberIds?.length ? <> · {extra.resourceMemberIds.map(id => choice?.extras.find(item => item.serviceId === extra.serviceId)?.resourceMembers.find(member => member.id === id)?.name || "Unavailable selected name").join(", ")}</> : null}
                                        {" · "}
                                        {requestReviewDuration(
                                          extra,
                                          choice?.extras.find(
                                            (item) =>
                                              item.serviceId ===
                                              extra.serviceId,
                                          )?.durationPolicy,
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ol>

                  <FieldGroup>
                    {v4Options && onRefreshPolicies ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || uncertain}
                        onClick={onRefreshPolicies}
                      >
                        Refresh service policies
                      </Button>
                    ) : null}
                    <ConfigurationCheck
                      label="I reviewed these resource, extra and duration policies"
                      checked={draft.catalogRevision === catalogRevision}
                      disabled={busy || uncertain}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          catalogRevision: event.currentTarget.checked
                            ? catalogRevision
                            : null,
                        })
                      }
                    />
                    {mode === "amend" ? (
                      <>
                        <ConfigurationTextarea
                          label="Reason for request amendment"
                          value={reason}
                          disabled={busy || uncertain}
                          onChange={(event) =>
                            setReason(event.currentTarget.value)
                          }
                        />
                        {reduction ? (
                          <ConfigurationCheck
                            label="The customer agreed to these removed or reduced selections"
                            checked={agreement}
                            disabled={busy || uncertain}
                            onChange={(event) =>
                              setAgreement(event.currentTarget.checked)
                            }
                          />
                        ) : null}
                      </>
                    ) : (
                      <p className="ops-muted">
                        Save is inert. Publication is separate and creates one
                        queue ticket. Quote unavailable: service pricing is not
                        configured; queue fees are separate.
                      </p>
                    )}
                  </FieldGroup>
                </FieldSet>
              </section>
            </FieldGroup>
          </div>
        </form>
      </TaskDialog>
      <QueueConfirmation
        opened={discard}
        title="Discard request changes?"
        description="Only unsaved changes in this request editor will be discarded."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onClose={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
