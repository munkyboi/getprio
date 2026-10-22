import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  FieldDescription,
  FieldError,
} from "./components/ui/field";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import {
  QueuePoliciesGrid,
  type QueuePolicyService,
} from "./QueuePoliciesGrid";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  QueueServiceConfigurationV4,
  QueueServiceConfigurationResponseV4,
  QueueServiceConfigurationWriteV4,
} from "../../../shared/queueSelectionPlanV4";
import {
  getQueueServiceConfiguration,
  saveQueueServiceConfiguration,
} from "../api/queueServiceConfigurationV4";
import { ApiError } from "../api/client";
import {
  ConfigurationCheck,
  ConfigurationInput,
  ConfigurationSelect,
} from "./ConfigurationUi";
import { TaskDialog, QueueConfirmation } from "./TaskDialog";
import { Button } from "./components/ui/button";
import type { LocationServiceSummary, StoreLocationWithHours } from "@shared";
import { serviceCatalogItems } from "./ServiceCatalog";
import { namedPolicyReady, namedPolicyVerificationRequired, policyAssignmentChoices, readPolicyNamedCapability, type QueuePolicyNamedCapability } from "./queuePolicyNamedCapability";

export type PolicySection = "general" | "duration" | "resources";
export class PolicyValidationError extends Error {
  constructor(
    message: string,
    readonly section: PolicySection,
  ) {
    super(message);
    this.name = "PolicyValidationError";
  }
}
type DurationField =
  "baseMinutes" | "minCount" | "maxCount" | "stepCount" | "defaultCount";
const durationFields: Array<{ key: DurationField; label: string }> = [
  { key: "baseMinutes", label: "Base duration in minutes" },
  { key: "minCount", label: "Minimum duration count" },
  { key: "maxCount", label: "Maximum duration count" },
  { key: "stepCount", label: "Duration count step" },
  { key: "defaultCount", label: "Default duration count" },
];
type Draft = {
  labels: QueueServiceConfigurationV4["labels"];
  assignment: "" | "named" | "automatic";
  mode: "" | "fixed" | "adjustable";
  visible: boolean;
  duration: Record<DurationField, string>;
  executionConfirmed: boolean;
};
function draftFrom(configuration: QueueServiceConfigurationV4 | null): Draft {
  return {
    labels: configuration
      ? { ...configuration.labels }
      : {
          service: "Service",
          resources: "Resources",
          duration: "Duration",
          extras: "Extras",
        },
    assignment: configuration?.assignment.mode || "",
    mode: configuration?.duration.mode || "",
    visible: configuration?.duration.visible ?? true,
    duration: Object.fromEntries(
      durationFields.map(({ key }) => [
        key,
        configuration ? String(configuration.duration[key]) : "",
      ]),
    ) as Record<DurationField, string>,
    executionConfirmed: Boolean(configuration),
  };
}
export function policyInput(draft: Draft, stored?: QueueServiceConfigurationV4 | null): QueueServiceConfigurationV4 {
  const values = Object.fromEntries(
    durationFields.map(({ key }) => [key, Number(draft.duration[key])]),
  ) as Record<DurationField, number>;
  if (
    durationFields.some(
      ({ key }) =>
        !draft.duration[key].trim() ||
        !Number.isSafeInteger(values[key]) ||
        values[key] <= 0,
    )
  )
    throw new PolicyValidationError(
      "Enter positive whole numbers for duration policy fields.",
      "duration",
    );
  if (
    values.baseMinutes < 5 ||
    values.baseMinutes > 480 ||
    values.maxCount > 96 ||
    values.stepCount > 96 ||
    values.baseMinutes * values.maxCount > 480 ||
    (values.maxCount - values.minCount) % values.stepCount !== 0 ||
    values.minCount > values.maxCount ||
    values.defaultCount < values.minCount ||
    values.defaultCount > values.maxCount ||
    (values.defaultCount - values.minCount) % values.stepCount !== 0
  )
    throw new PolicyValidationError(
      "Review duration bounds, step and default count.",
      "duration",
    );
  if (Object.values(draft.labels).some((value) => !value.trim()))
    throw new PolicyValidationError(
      "Complete the accessible labels.",
      "general",
    );
  if (!draft.assignment)
    throw new PolicyValidationError(
      "Choose assignment and confirm the supported execution rules.",
      "resources",
    );
  if (!draft.mode)
    throw new PolicyValidationError("Choose a duration mode.", "duration");
  if (!draft.executionConfirmed)
    throw new PolicyValidationError(
      "Confirm the supported resource execution rules.",
      "resources",
    );
  if (
    draft.mode === "fixed" &&
    (values.minCount !== values.maxCount ||
      values.defaultCount !== values.minCount ||
      values.stepCount !== 1)
  )
    throw new PolicyValidationError(
      "Fixed duration requires matching minimum, maximum and default counts, with step 1.",
      "duration",
    );
  if (!draft.visible && draft.mode !== "fixed")
    throw new PolicyValidationError(
      "Hidden duration must use fixed mode.",
      "duration",
    );
  return {
    labels: { ...draft.labels },
    assignment:
      draft.assignment === "named"
        ? { mode: "named", allocationIdentity: "named_member" }
        : { mode: "automatic", allocationIdentity: "pooled_capacity" },
    duration: { ...values, mode: draft.mode, visible: draft.visible },
    extras: (stored?.extras || []).map(extra => ({ ...extra })),
    execution: {
      resourceStart: "together",
      extraStart: "with_parent",
      extraContainment: "within_parent",
      selectedExtraResolution: "explicit_required",
    },
  };
}
export function QueueServicePolicyEditor({
  token,
  tenant,
  location,
  services,
  assignments,
  locations,
  servicesReady,
  assignmentsReady,
  canManage,
  onBusy,
  onCloseForm,
  onNotice,
}: {
  token: string;
  tenant: string;
  location: string;
  services: QueuePolicyService[];
  assignments: LocationServiceSummary[];
  locations: StoreLocationWithHours[];
  servicesReady: boolean;
  assignmentsReady: boolean;
  canManage: boolean;
  onBusy: (busy: boolean) => void;
  onCloseForm: () => void;
  onNotice: (title: string, message: string) => void;
}) {
  const client = useQueryClient();
  const selectedLocation = locations.find(item => item.slug === location);
  const offeredServices = servicesReady ? serviceCatalogItems(services, assignments, selectedLocation?.id, "location", assignmentsReady) : [];
  const [section, setSection] = useState<PolicySection>("general");
  const [validationIssue, setValidationIssue] =
    useState<PolicyValidationError | null>(null);
  useEffect(() => {
    if (validationIssue)
      document
        .getElementById("queue-service-policy")
        ?.querySelector<HTMLElement>(
          `[data-policy-tab="${validationIssue.section}"]`,
        )
        ?.focus();
  }, [validationIssue]);

  const [serviceId, setServiceId] = useState(""),
    [record, setRecord] = useState<QueueServiceConfigurationResponseV4 | null>(
      null,
    ),
    [options, setOptions] = useState<QueuePolicyNamedCapability | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [initial, setInitial] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [discard, setDiscard] = useState(false);
  useEffect(() => {
    if (!unknown) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unknown]);
  const loadingPolicy = useRef(false);
  const pending = useRef<{
    body: QueueServiceConfigurationWriteV4;
    key: string;
  } | null>(null);
  function lock(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  function discoverResourceChoices(next: QueueServiceConfigurationResponseV4, targetId: string) {
    const scope = { tenant, location, serviceId: targetId }, requestKey = crypto.randomUUID();
    setOptions({ ...scope, state: "unknown", pending: true, requestKey, message: "Checking this location’s mapped named-resource registry…" });
    // Optional management reads must not prevent an authorized policy form opening.
    void readPolicyNamedCapability(token, scope, next.policy?.configuration || null).then(result => {
      setOptions(current => current?.requestKey === requestKey && current.tenant === tenant && current.location === location && current.serviceId === targetId ? { ...result, requestKey, pending: false } : current);
    });
  }
  async function load(targetId = serviceId) {
    if (!targetId || !canManage || busy || unknown || loadingPolicy.current)
      return;
    if (!offeredServices.some(service => service.id === targetId)) {
      setError("This service is no longer offered at the selected location. Refresh the location assignments.");
      return;
    }
    loadingPolicy.current = true;
    setServiceId(targetId);
    lock(true);
    setError("");
    try {
      const next = await getQueueServiceConfiguration(token, tenant, location, targetId);
      if (next.policy && next.policy.serviceId !== targetId) throw new Error("The returned policy does not match the selected service. Reload the policy.");
      const value = draftFrom(next.policy?.configuration || null);
      client.setQueryData(
        ["queue-service-configuration", token, tenant, location, targetId],
        next,
      );
      setRecord(next);
      discoverResourceChoices(next, targetId);
      setDraft(value);
      setSection("general");
      setValidationIssue(null);
      setInitial(JSON.stringify(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load policy.");
    } finally {
      loadingPolicy.current = false;
      lock(false);
    }
  }
  function close() {
    if (busy || unknown) return;
    if (draft && JSON.stringify(draft) !== initial) {
      setDiscard(true);
      return;
    }
    setDraft(null);
    setRecord(null);
    setOptions(null);
    onCloseForm();
  }
  async function save() {
    if (!record || !draft || !canManage || busy) return;
    setError("");
    try {
      if (!pending.current) {
        if (!offeredServices.some(service => service.id === serviceId))
          throw new PolicyValidationError("This service is no longer offered at the selected location. Refresh its location assignment before saving.", "resources");
        const configuration = policyInput(draft, record.policy?.configuration);
        if (namedPolicyVerificationRequired(draft.assignment, record.policy?.configuration) && !namedPolicyReady(options, { tenant, location, serviceId }))
          throw new PolicyValidationError(options?.message || "Refresh resource choices before saving named assignment.", "resources");
        pending.current = { body: { expectedRevision: record.configurationRevision, configuration }, key: crypto.randomUUID() };
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review the configuration.");
      if (e instanceof PolicyValidationError) {
        setSection(e.section);
        setValidationIssue(e);
      }
      return;
    }
    lock(true);
    try {
      const result = await saveQueueServiceConfiguration(
        token,
        tenant,
        location,
        serviceId,
        pending.current.body,
        pending.current.key,
      );
      pending.current = null;
      setUnknown(false);
      client.setQueryData(
        ["queue-service-configuration", token, tenant, location, serviceId],
        result,
      );
      setRecord(null);
      setDraft(null);
      setOptions(null);
      onCloseForm();
      void client.invalidateQueries({ queryKey: ["queue-options-v4"] });
      onNotice(
        "Queue service policy saved",
        "New selections use the reviewed policy. Published requests retain their snapshots.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save policy.");
      const uncertain = !(e instanceof ApiError) || e.status >= 500;
      setUnknown(uncertain);
      onBusy(uncertain);
      if (!uncertain) pending.current = null;
    } finally {
      setBusy(false);
      if (!pending.current) onBusy(false);
    }
  }
  return (
    <section className="queue-stack">
      <h2>Queue policies</h2>
      <p className="ops-muted">
        Configure this branch’s resource assignment and duration counts. Booking
        duration and prices are separate.
      </p>
      <p className="ops-muted">
        Only services offered at {selectedLocation?.name || "the selected location"} appear here. Tabs use the shared service’s active status.
      </p>
      {servicesReady && assignmentsReady && selectedLocation && !offeredServices.length ? <p>No services are offered at this location. Enable a location assignment in the service editor’s Locations tab first.</p> : null}
      {servicesReady && assignmentsReady && selectedLocation ? <QueuePoliciesGrid
        services={offeredServices}
        token={token}
        tenant={tenant}
        location={location}
        canManage={canManage}
        busy={busy || unknown || Boolean(draft)}
        onEdit={(id) => void load(id)}
      /> : <p className="ops-muted">Load a valid location and its service assignments to review queue policies.</p>}
      {!canManage ? <p>Service management permission is required.</p> : null}
      {error && !draft ? <p role="alert">{error}</p> : null}
      {draft && record ? (
        <TaskDialog
          opened
          title={`Queue policy · ${services.find((service) => service.id === serviceId)?.name || "Service"}`}
          description={`Branch-scoped configuration revision ${record.configurationRevision}. Saving affects new selections; existing snapshots remain unchanged.`}
          busy={busy || unknown}
          onClose={close}
          footer={
            <>
              <Button
                variant="outline"
                disabled={busy || unknown}
                onClick={close}
              >
                Cancel
              </Button>
              <Button type="submit" form="queue-service-policy" disabled={busy}>
                {unknown ? "Retry same policy command" : "Save queue policy"}
              </Button>
            </>
          }
        >
          <form
            id="queue-service-policy"
            className="queue-stack named-queue-fields"
            noValidate
            onChange={() => {
              if (validationIssue) {
                setValidationIssue(null);
                setError("");
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {error ? (
              <FieldError id="queue-policy-error">{error}</FieldError>
            ) : null}
            {unknown ? (
              <p role="alert">
                The save result is unknown. Retry this exact command before
                editing or closing.
              </p>
            ) : null}
            {!record.policy ? (
              <p role="status">
                Unconfigured. Enter explicit policy values; no legacy settings
                have been inferred.
              </p>
            ) : null}
            <FieldGroup>
              <Tabs
                value={section}
                onValueChange={(value) => {
                  if (
                    !busy &&
                    !unknown &&
                    (value === "general" ||
                      value === "duration" ||
                      value === "resources")
                  )
                    setSection(value);
                }}
              >
                <TabsList
                  className="config-tabs-list"
                  aria-label="Queue policy sections"
                  activateOnFocus
                >
                  {(
                    [
                      { value: "general", label: "General" },
                      { value: "duration", label: "Duration" },
                      { value: "resources", label: "Resources" },
                    ] as const
                  ).map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="v:px-2.5"
                      data-policy-tab={tab.value}
                      aria-describedby={
                        error && validationIssue?.section === tab.value
                          ? "queue-policy-error"
                          : undefined
                      }
                      disabled={busy || unknown}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent
                  value="general"
                  keepMounted
                  className="queue-stack"
                >
                  <FieldSet variant="outlined" disabled={busy || unknown}>
                    <FieldLegend>Accessible labels</FieldLegend>
                    <FieldDescription>
                      Use clear labels for the service and its request fields.
                    </FieldDescription>
                    {(
                      ["service", "resources", "duration"] as const
                    ).map((key) => (
                      <ConfigurationInput
                        key={key}
                        label={`${key[0].toUpperCase() + key.slice(1)} label`}
                        maxLength={80}
                        value={draft.labels[key]}
                        error={
                          validationIssue?.section === "general" &&
                          !draft.labels[key].trim()
                            ? "Enter a label."
                            : undefined
                        }
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            labels: {
                              ...draft.labels,
                              [key]: event.currentTarget.value,
                            },
                          })
                        }
                      />
                    ))}
                  </FieldSet>
                  {!unknown ? (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (JSON.stringify(draft) !== initial) setDiscard(true);
                        else void load();
                      }}
                    >
                      Reload policy
                    </Button>
                  ) : null}
                </TabsContent>
                <TabsContent value="duration" keepMounted>
                  <FieldSet variant="outlined" disabled={busy || unknown}>
                    <FieldLegend>Duration</FieldLegend>
                    <ConfigurationSelect
                      label="Duration mode"
                      value={draft.mode || "__none__"}
                      data={[
                        { value: "__none__", label: "Choose duration mode" },
                        { value: "fixed", label: "Fixed count" },
                        { value: "adjustable", label: "Adjustable count" },
                      ]}
                      onChange={(value) =>
                        setDraft({
                          ...draft,
                          mode:
                            value === "fixed" || value === "adjustable"
                              ? value
                              : "",
                        })
                      }
                    />
                    <ConfigurationCheck
                      label="Show duration control in intake"
                      checked={draft.visible}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          visible: event.currentTarget.checked,
                        })
                      }
                    />
                    {durationFields.map(({ key, label }) => (
                      <ConfigurationInput
                        key={key}
                        label={label}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={draft.duration[key]}
                        error={
                          validationIssue?.section === "duration" &&
                          (!Number.isSafeInteger(Number(draft.duration[key])) ||
                            Number(draft.duration[key]) <= 0)
                            ? "Enter a positive whole number."
                            : undefined
                        }
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            duration: {
                              ...draft.duration,
                              [key]: event.currentTarget.value,
                            },
                          })
                        }
                      />
                    ))}
                    <p>
                      Default total:{" "}
                      {Number.isSafeInteger(
                        Number(draft.duration.defaultCount),
                      ) &&
                      Number.isSafeInteger(
                        Number(draft.duration.baseMinutes),
                      ) &&
                      Number(draft.duration.defaultCount) > 0 &&
                      Number(draft.duration.baseMinutes) > 0
                        ? `${draft.duration.defaultCount} × ${draft.duration.baseMinutes} = ${Number(draft.duration.defaultCount) * Number(draft.duration.baseMinutes)} minutes`
                        : "Enter a base duration and default count."}
                    </p>
                  </FieldSet>
                </TabsContent>
                <TabsContent value="resources" keepMounted>
                  <FieldSet variant="outlined" disabled={busy || unknown}>
                    <FieldLegend>Resource assignment</FieldLegend>
                    <ConfigurationSelect
                      label="Resource assignment"
                      value={draft.assignment || "__none__"}
                      data={policyAssignmentChoices(options, { tenant, location, serviceId }, draft.assignment)}
                      onChange={(value) =>
                        setDraft({
                          ...draft,
                          assignment:
                            value === "named" || value === "automatic"
                              ? value
                              : "",
                        })
                      }
                    />
                    <p>
                      Named assignment requires an existing member registry.
                      Automatic assignment uses pooled capacity; it does not
                      choose a physical named member.
                    </p>
                    <p role="status">{options?.message || "Refresh resource choices to verify named assignment support without changing this policy."}</p>
                    <Button type="button" variant="outline" disabled={busy || unknown || options?.pending} onClick={()=>discoverResourceChoices(record, serviceId)}>Refresh resource choices</Button>
                    <ConfigurationCheck
                      label="Resources use the configured start and duration policy"
                      checked={draft.executionConfirmed}
                      disabled={busy || unknown}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          executionConfirmed: event.currentTarget.checked,
                        })
                      }
                    />
                  </FieldSet>
                </TabsContent>
              </Tabs>
            </FieldGroup>
          </form>
        </TaskDialog>
      ) : null}
      <QueueConfirmation
        opened={discard}
        title="Discard policy changes?"
        description="Only unsaved policy edits will be discarded. Reopen to load the current server revision."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onClose={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          setDraft(null);
          setRecord(null);
          setOptions(null);
          onCloseForm();
        }}
      />
    </section>
  );
}
