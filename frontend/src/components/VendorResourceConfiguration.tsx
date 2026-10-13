import { useState, useEffect, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfigurationScope } from "../vendor/ConfigurationUi";
import {
  OperationPanel,
  OperationButton,
  OperationAlert,
  OperationEmpty,
} from "../vendor/OperationsUi";
import { TaskDialog, QueueConfirmation } from "../vendor/TaskDialog";
import { apiRequest } from "../api/client";

import {
  ResourcePoolForm,
  ResourceRequirementForm,
  hasResourceEdits,
  resourceServiceName,
  resourceUnits,
  validResourceEditor,
  type ResourceConfiguration,
  type ResourceEditor,
  type PoolEditor,
  type RequirementEditor,
} from "./VendorResourceConfigurationForms";

type Props = {
  token: string;
  tenantSlug: string;
  locationSlug: string;
  locationName: string;
  onBusyChange?: (busy: boolean) => void;
  onDiscard?: (id: string) => void;
  onDialogChange?: (opened: boolean) => void;
};
type Transition =
  | { type: "edit"; editor: ResourceEditor }
  | { type: "close" }
  | { type: "reload" }
  | { type: "remove"; serviceId: string };

function makePoolEditor(
  data: ResourceConfiguration,
  poolId?: string,
): PoolEditor {
  const pool = data.pools.find((item) => item.id === poolId);
  return {
    kind: "pool",
    poolId,
    name: pool?.name || "",
    capacity: pool?.capacity || 1,
    initialName: pool?.name || "",
    initialCapacity: pool?.capacity || 1,
    version: data.version,
  };
}
function makeRequirementEditor(
  data: ResourceConfiguration,
  serviceId: string | null,
): RequirementEditor {
  const requirement = data.requirements.find(
    (item) => item.service_id === serviceId,
  );
  const poolId =
    requirement?.pool_id || (data.pools.length === 1 ? data.pools[0].id : null);
  return {
    kind: "requirement",
    existing: Boolean(requirement),
    serviceId,
    poolId,
    units: requirement?.units_required || 1,
    initialServiceId: serviceId,
    initialPoolId: poolId,
    initialUnits: requirement?.units_required || 1,
    version: data.version,
  };
}

export function VendorResourceConfiguration(props: Readonly<Props>) {
  const [editor, setEditor] = useState<ResourceEditor | null>(null);
  const [pendingTransition, setPendingTransition] = useState<Transition | null>(
    null,
  );
  const [removal, setRemoval] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { onBusyChange } = props;
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const path = `/vendor/tenant/${encodeURIComponent(props.tenantSlug)}/locations/${encodeURIComponent(props.locationSlug)}/resources`;
  const queryKey = [
    "vendor-resource-configuration",
    props.token,
    props.tenantSlug,
    props.locationSlug,
  ];
  const query = useQuery({
    queryKey,
    queryFn: () =>
      apiRequest<ResourceConfiguration>(path, { token: props.token }),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const queryClient = useQueryClient();
  const data = query.data;
  const controlsDisabled = busy || query.isFetching;
  const { onDialogChange } = props;
  const dialogOpened = Boolean(editor || pendingTransition || removal);
  useEffect(() => {
    onDialogChange?.(dialogOpened);
    return () => onDialogChange?.(false);
  }, [dialogOpened, onDialogChange]);

  function transition(action: Transition) {
    props.onDiscard?.("vendor-resource-editor");
    setPendingTransition(null);
    setError(null);
    setNotice(null);
    setRemoval(null);
    setEditor(action.type === "edit" ? action.editor : null);
    if (action.type === "remove") setRemoval(action.serviceId);
    if (action.type === "reload") void query.refetch();
  }
  function requestTransition(action: Transition) {
    if (controlsDisabled) return;
    if (hasResourceEdits(editor)) setPendingTransition(action);
    else transition(action);
  }
  async function save(
    body: Record<string, unknown>,
    version: string,
    successMessage: string,
  ) {
    if (!data || controlsDisabled) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiRequest<
        ResourceConfiguration,
        Record<string, unknown>
      >(path, {
        token: props.token,
        method: "PUT",
        body: { ...body, version },
      });
      queryClient.setQueryData(queryKey, updated);
      props.onDiscard?.("vendor-resource-editor");
      setEditor(null);
      setRemoval(null);
      setNotice(successMessage);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save resource configuration.",
      );
      setRemoval(null);
    } finally {
      setBusy(false);
    }
  }
  function submitEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (editor.kind === "pool") {
      void save(
        {
          action: "pool",
          ...(editor.poolId ? { poolId: editor.poolId } : {}),
          name: editor.name,
          capacity: editor.capacity,
        },
        editor.version,
        "Resource pool saved.",
      );
    } else {
      void save(
        {
          action: "requirement",
          serviceId: editor.serviceId,
          poolId: editor.poolId,
          unitsRequired: editor.units,
        },
        editor.version,
        "Service requirement saved.",
      );
    }
  }
  const unassigned =
    data?.services.filter(
      (service) =>
        !data.requirements.some((item) => item.service_id === service.id),
    ) || [];
  const assigned = (data?.services.length || 0) - unassigned.length;
  const validEditor = validResourceEditor(editor, data);
  return (
    <ConfigurationScope busy={controlsDisabled}>
      <div className="ops-stack vendor-resource-configuration">
        <div className="ops-row ops-between">
          <div>
            <h2 className="ops-heading">Service resources</h2>
            <p className="ops-muted">
              {props.locationName} · Set shared capacity and the resources each
              service needs.
            </p>
          </div>
          <OperationButton
            variant="outline"
            disabled={controlsDisabled}
            onClick={() => requestTransition({ type: "reload" })}
          >
            Refresh resources
          </OperationButton>
        </div>
        <OperationAlert title="Planning setup">
          These settings do not enforce booking availability or change wait
          estimates yet. Pool capacity is configured capacity, not live
          availability.
        </OperationAlert>
        {query.isPending ? (
          <p role="status">Loading service resources…</p>
        ) : null}
        {query.error ? (
          <OperationAlert color="red" title="Could not load resources">
            Refresh resources to try again. The inventory is unavailable; it is
            not an empty inventory.
          </OperationAlert>
        ) : null}
        {!editor && error ? (
          <OperationAlert color="red" title="Could not save changes">
            {error}
          </OperationAlert>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        {data && !query.isError ? (
          <>
            <OperationPanel>
              <div className="ops-stack">
                <div className="ops-row ops-between">
                  <div>
                    <h3 className="ops-heading">Resource pools</h3>
                    <p className="ops-muted">
                      {data.pools.length} configured · Group resources that can
                      be used interchangeably.
                    </p>
                  </div>
                  <OperationButton
                    disabled={controlsDisabled}
                    onClick={() =>
                      requestTransition({
                        type: "edit",
                        editor: makePoolEditor(data),
                      })
                    }
                  >
                    Add pool
                  </OperationButton>
                </div>
                {!data.pools.length ? (
                  <OperationEmpty
                    title="Start with your available resources"
                    text="Add a pool such as Courts, Treatment rooms or Service chairs, then enter how many units could be used together."
                  />
                ) : null}
                <div className="ops-grid ops-grid-2">
                  {data.pools.map((pool) => (
                    <div key={pool.id} className="config-summary">
                      <div>
                        <p className="ops-strong">{pool.name}</p>
                        <p className="ops-muted">
                          {resourceUnits(pool.capacity)} configured ·{" "}
                          {
                            data.requirements.filter(
                              (item) => item.pool_id === pool.id,
                            ).length
                          }{" "}
                          service requirements
                        </p>
                      </div>
                      <OperationButton
                        variant="outline"
                        disabled={controlsDisabled}
                        aria-label={`Edit ${pool.name} pool`}
                        onClick={() =>
                          requestTransition({
                            type: "edit",
                            editor: makePoolEditor(data, pool.id),
                          })
                        }
                      >
                        Edit pool
                      </OperationButton>
                    </div>
                  ))}
                </div>
              </div>
            </OperationPanel>
            <OperationPanel>
              <div className="ops-stack">
                <div className="ops-row ops-between">
                  <div>
                    <h3 className="ops-heading">Service requirements</h3>
                    <p className="ops-muted">
                      {assigned} of {data.services.length} active services
                      configured
                    </p>
                  </div>
                  <OperationButton
                    disabled={
                      controlsDisabled ||
                      !data.pools.length ||
                      !unassigned.length
                    }
                    onClick={() =>
                      requestTransition({
                        type: "edit",
                        editor: makeRequirementEditor(data, null),
                      })
                    }
                  >
                    Assign service
                  </OperationButton>
                </div>
                {!data.pools.length ? (
                  <p className="ops-muted">
                    Add a resource pool first to assign services.
                  </p>
                ) : null}
                {!data.services.length ? (
                  <p className="ops-muted">
                    No active services are offered at this location. Add them in
                    Services.
                  </p>
                ) : null}
                {!data.requirements.length ? (
                  <p className="ops-muted">
                    No services assigned yet. Each service can use one pool at
                    this location.
                  </p>
                ) : null}
                {data.requirements.map((requirement) => (
                  <div className="config-summary" key={requirement.service_id}>
                    <div>
                      <p className="ops-strong">
                        {resourceServiceName(data, requirement.service_id)}
                      </p>
                      <p className="ops-muted">
                        {resourceUnits(requirement.units_required)} ·{" "}
                        {data.pools.find(
                          (pool) => pool.id === requirement.pool_id,
                        )?.name || "Unavailable pool"}
                      </p>
                    </div>
                    <div className="ops-row config-actions">
                      <OperationButton
                        variant="outline"
                        disabled={
                          controlsDisabled ||
                          !data.services.some(
                            (service) => service.id === requirement.service_id,
                          )
                        }
                        aria-label={`Edit requirement for ${resourceServiceName(data, requirement.service_id)}`}
                        onClick={() =>
                          requestTransition({
                            type: "edit",
                            editor: makeRequirementEditor(
                              data,
                              requirement.service_id,
                            ),
                          })
                        }
                      >
                        Edit requirement
                      </OperationButton>
                      <OperationButton
                        variant="destructive"
                        disabled={controlsDisabled}
                        aria-label={`Remove requirement for ${resourceServiceName(data, requirement.service_id)}`}
                        onClick={() =>
                          requestTransition({
                            type: "remove",
                            serviceId: requirement.service_id,
                          })
                        }
                      >
                        Remove requirement
                      </OperationButton>
                    </div>
                  </div>
                ))}
              </div>
            </OperationPanel>
          </>
        ) : null}
      </div>
      <TaskDialog
        opened={Boolean(editor)}
        onClose={() => requestTransition({ type: "close" })}
        busy={controlsDisabled}
        eyebrow={
          editor?.kind === "pool" ? "RESOURCE POOL" : "SERVICE REQUIREMENT"
        }
        title={
          editor?.kind === "pool"
            ? editor.poolId
              ? `Edit ${editor.initialName}`
              : "Add resource pool"
            : editor?.existing
              ? "Edit service requirement"
              : "Assign resources to a service"
        }
        description="Save draft settings for this location. Resource tracking is not active yet."
        footer={
          <>
            <OperationButton
              className="ops-redundant-dismiss"
              variant="outline"
              disabled={controlsDisabled}
              onClick={() => requestTransition({ type: "close" })}
            >
              Cancel
            </OperationButton>
            <OperationButton
              type="submit"
              form="vendor-resource-editor"
              loading={busy}
              disabled={controlsDisabled || !validEditor}
            >
              Save resource settings
            </OperationButton>
            {error ? (
              <OperationButton
                variant="outline"
                disabled={controlsDisabled}
                onClick={() => requestTransition({ type: "reload" })}
              >
                Load latest settings
              </OperationButton>
            ) : null}
          </>
        }
      >
        {error ? (
          <OperationAlert color="red" title="Could not save changes">
            {error} Your edits are kept. Loading the latest settings requires
            discarding unsaved edits.
          </OperationAlert>
        ) : null}
        {editor?.kind === "pool" ? (
          <ResourcePoolForm
            editor={editor}
            busy={controlsDisabled}
            onChange={setEditor}
            onSubmit={submitEditor}
          />
        ) : editor && data ? (
          <ResourceRequirementForm
            data={data}
            editor={editor}
            busy={controlsDisabled}
            onChange={setEditor}
            onSubmit={submitEditor}
          />
        ) : null}
      </TaskDialog>
      <QueueConfirmation
        opened={Boolean(pendingTransition)}
        title="Discard unsaved resource changes?"
        description="Your resource edits have not been saved. Discard them to continue, or continue editing."
        cancelLabel="Continue editing"
        confirmLabel="Discard changes"
        onClose={() => setPendingTransition(null)}
        onConfirm={() => {
          if (pendingTransition) transition(pendingTransition);
        }}
      />
      <QueueConfirmation
        opened={Boolean(removal)}
        title="Remove service requirement?"
        cancelLabel="Keep requirement"
        description={
          data && removal
            ? `${resourceServiceName(data, removal)} will no longer have a resource requirement at ${props.locationName}. You can assign it again later.`
            : ""
        }
        confirmLabel="Remove requirement"
        loading={busy}
        onClose={() => {
          if (!busy) setRemoval(null);
        }}
        onConfirm={() => {
          if (data && removal)
            void save(
              { action: "removeRequirement", serviceId: removal },
              data.version,
              "Service requirement removed.",
            );
        }}
      />
    </ConfigurationScope>
  );
}
