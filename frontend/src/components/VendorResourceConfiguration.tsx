import { Separator } from "../vendor/components/ui/separator";
import { ResourceMembersDialog } from "../vendor/ResourceMembersDialog";
import { Button } from "../vendor/components/ui/button";
import {
  ResourcePoolsGrid,
  ServiceRequirementsGrid,
} from "../vendor/ResourceConfigurationCards";
import { ManagedCollection } from "../vendor/ManagedCollection";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfigurationScope } from "../vendor/ConfigurationUi";
import {
  OperationButton,
  OperationAlert,
  OperationEmpty,
} from "../vendor/OperationsUi";
import { TaskDialog, QueueConfirmation } from "../vendor/TaskDialog";
import { apiRequest, ApiError } from "../api/client";

import {
  ResourcePoolForm,
  ResourceRequirementForm,
  hasResourceEdits,
  resourceServiceName,
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
  | { type: "remove"; serviceId: string }
  | { type: "members"; poolId: string }
  | {
      type: "poolAction";
      poolId: string;
      action: "deletePool" | "archivePool";
    };
type PoolAction = {
  poolId: string;
  action: "deletePool" | "archivePool";
  version: string;
};
type PoolCommand = PoolAction & { operationKey: string };

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
    displayOrder: pool?.display_order || 0,
    initialName: pool?.name || "",
    initialCapacity: pool?.capacity || 1,
    initialDisplayOrder: pool?.display_order || 0,
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
  const [memberPoolId, setMemberPoolId] = useState<string | null>(null);
  const [poolAction, setPoolAction] = useState<PoolAction | null>(null);
  const [lifecycleUnknown, setLifecycleUnknown] = useState(false);
  const pendingLifecycle = useRef<PoolCommand | null>(null);

  const { onBusyChange } = props;
  useEffect(() => {
    onBusyChange?.(busy || lifecycleUnknown);
    return () => onBusyChange?.(false);
  }, [busy, lifecycleUnknown, onBusyChange]);
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
  const controlsDisabled = busy || query.isFetching || lifecycleUnknown;
  const { onDialogChange } = props;
  const dialogOpened = Boolean(
    editor || pendingTransition || removal || memberPoolId || poolAction,
  );
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
    setMemberPoolId(action.type === "members" ? action.poolId : null);
    setPoolAction(
      action.type === "poolAction" && data
        ? {
            poolId: action.poolId,
            action: action.action,
            version: data.version,
          }
        : null,
    );
    setEditor(action.type === "edit" ? action.editor : null);
    if (action.type === "remove") setRemoval(action.serviceId);
    if (action.type === "reload") void query.refetch();
  }
  function requestTransition(action: Transition) {
    if (controlsDisabled) return;
    if (hasResourceEdits(editor)) setPendingTransition(action);
    else transition(action);
  }
  async function loadLatestSettings() {
    if (controlsDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const result = await query.refetch();
      if (!result.data || result.isError) {
        setError(
          result.error instanceof Error
            ? result.error.message
            : "Could not load the latest resource settings.",
        );
        return;
      }
      const latestEditor =
        editor?.kind === "pool"
          ? makePoolEditor(result.data, editor.poolId)
          : editor
            ? makeRequirementEditor(result.data, editor.serviceId)
            : null;
      setEditor(latestEditor);
      setPendingTransition(null);
      setNotice("Latest resource settings loaded. Review and save again.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the latest resource settings.",
      );
    } finally {
      setBusy(false);
    }
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
  const lifecyclePool = data?.pools.find(
    (pool) => pool.id === poolAction?.poolId,
  );
  useEffect(() => {
    if (!lifecycleUnknown) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [lifecycleUnknown]);
  async function runLifecycle() {
    if (busy) return;
    if (!pendingLifecycle.current) {
      if (!poolAction || !lifecyclePool) return;
      if (
        poolAction.action === "deletePool" &&
        !lifecyclePool.deletion?.allowed
      ) {
        setError(
          lifecyclePool.deletion?.message ||
            "Deletion is unavailable until current pool dependencies are loaded.",
        );
        return;
      }
      if (
        poolAction.action === "archivePool" &&
        (!lifecyclePool.deletion?.archiveAllowed || lifecyclePool.archived_at)
      )
        return;
      pendingLifecycle.current = {
        ...poolAction,
        operationKey: crypto.randomUUID(),
      };
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const command = pendingLifecycle.current;
      const updated = await apiRequest<ResourceConfiguration>(path, {
        token: props.token,
        method: "PUT",
        body: command,
      });
      queryClient.setQueryData(queryKey, updated);
      pendingLifecycle.current = null;
      setLifecycleUnknown(false);
      setPoolAction(null);
      setNotice(
        command.action === "deletePool"
          ? "Unused resource pool deleted."
          : "Pool archived. Existing holds and history are preserved.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Pool action could not be confirmed.",
      );
      const unknown = !(cause instanceof ApiError) || cause.status >= 500;
      setLifecycleUnknown(unknown);
      if (!unknown) {
        pendingLifecycle.current = null;
        void query.refetch();
      }
    } finally {
      setBusy(false);
    }
  }
  async function reviewLatestPool() {
    const result = await query.refetch();
    if (result.data && poolAction) {
      setPoolAction({ ...poolAction, version: result.data.version });
      setError(null);
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
          displayOrder: editor.displayOrder,
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
            <section className="ops-stack">
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
                <ManagedCollection
                  key={
                    data.pools.every((pool) => pool.archived_at !== undefined)
                      ? "pool-lifecycle"
                      : "legacy-pools"
                  }
                  items={data.pools}
                  label="resource pools"
                  defaultStatus={
                    data.pools.every((pool) => pool.archived_at !== undefined)
                      ? "active"
                      : ""
                  }
                  statusTabs={data.pools.every(
                    (pool) => pool.archived_at !== undefined,
                  )}
                  statuses={[
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" },
                  ]}
                  statusOf={(pool) =>
                    pool.archived_at ? "archived" : "active"
                  }
                  searchText={(pool) => pool.name}
                >
                  {(visiblePools) => (
                    <ResourcePoolsGrid
                      data={data}
                      items={visiblePools}
                      disabled={controlsDisabled}
                      onEdit={(poolId) =>
                        requestTransition({
                          type: "edit",
                          editor: makePoolEditor(data, poolId),
                        })
                      }
                      onMembers={(poolId) =>
                        requestTransition({ type: "members", poolId })
                      }
                      onArchive={(poolId) =>
                        requestTransition({
                          type: "poolAction",
                          poolId,
                          action: "archivePool",
                        })
                      }
                      onDelete={(poolId) =>
                        requestTransition({
                          type: "poolAction",
                          poolId,
                          action: "deletePool",
                        })
                      }
                    />
                  )}
                </ManagedCollection>
              </div>
            </section>
            <Separator
              className="v:my-4 v:h-px v:w-full"
              aria-label="Resource pools and service requirements"
            />
            <section className="ops-stack">
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
                      !data.pools.some((pool) => !pool.archived_at) ||
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
                <ManagedCollection
                  items={data.requirements}
                  label="service requirements"
                  searchText={(requirement) =>
                    `${resourceServiceName(data, requirement.service_id)} ${data.pools.find((pool) => pool.id === requirement.pool_id)?.name || "Unavailable pool"}`
                  }
                >
                  {(visibleRequirements) => (
                    <ServiceRequirementsGrid
                      data={data}
                      items={visibleRequirements}
                      disabled={controlsDisabled}
                      onEdit={(serviceId) =>
                        requestTransition({
                          type: "edit",
                          editor: makeRequirementEditor(data, serviceId),
                        })
                      }
                      onRemove={(serviceId) =>
                        requestTransition({ type: "remove", serviceId })
                      }
                    />
                  )}
                </ManagedCollection>
              </div>
            </section>
          </>
        ) : null}
      </div>
      {memberPoolId && data ? (
        <ResourceMembersDialog
          token={props.token}
          tenant={props.tenantSlug}
          location={props.locationSlug}
          poolId={memberPoolId}
          poolArchived={Boolean(
            data.pools.find((pool) => pool.id === memberPoolId)?.archived_at,
          )}
          onBusyChange={setBusy}
          onDiscard={() => props.onDiscard?.("resource-member-editor")}
          onClose={() => {
            props.onDiscard?.("resource-member-editor");
            setMemberPoolId(null);
          }}
          onNotice={(message) => {
            setNotice(message);
            void query.refetch();
          }}
        />
      ) : null}
      {poolAction ? (
        <TaskDialog
          opened
          title={`${poolAction.action === "deletePool" ? "Delete" : "Archive"} ${lifecyclePool?.name || "resource pool"}?`}
          description={
            poolAction.action === "deletePool"
              ? "Only an unused pool can be deleted. This permanently removes this pool."
              : "Archiving blocks new assignments and queue admission. Existing reservations, started sessions and history are preserved."
          }
          busy={busy || lifecycleUnknown}
          onClose={() => {
            if (!busy && !lifecycleUnknown) setPoolAction(null);
          }}
          footer={
            <>
              <Button
                variant="outline"
                disabled={controlsDisabled}
                onClick={() => setPoolAction(null)}
              >
                Cancel
              </Button>
              {lifecycleUnknown ? (
                <Button disabled={busy} onClick={() => void runLifecycle()}>
                  Retry same pool command
                </Button>
              ) : (
                <>
                  {error ? (
                    <Button
                      variant="outline"
                      disabled={controlsDisabled}
                      onClick={() => void reviewLatestPool()}
                    >
                      Review latest pool
                    </Button>
                  ) : null}
                  {poolAction.action === "deletePool" &&
                  lifecyclePool?.deletion &&
                  !lifecyclePool.deletion.allowed &&
                  !lifecyclePool.archived_at ? (
                    <Button
                      disabled={controlsDisabled}
                      onClick={() => {
                        setError(null);
                        setPoolAction({
                          ...poolAction,
                          action: "archivePool",
                          version: data?.version || poolAction.version,
                        });
                      }}
                    >
                      Review archive instead
                    </Button>
                  ) : null}
                  <Button
                    disabled={
                      controlsDisabled ||
                      !lifecyclePool ||
                      (poolAction.action === "deletePool" &&
                        !lifecyclePool.deletion?.allowed) ||
                      (poolAction.action === "archivePool" &&
                        (!lifecyclePool.deletion?.archiveAllowed ||
                          Boolean(lifecyclePool.archived_at)))
                    }
                    onClick={() => void runLifecycle()}
                  >
                    {poolAction.action === "deletePool"
                      ? "Delete unused pool"
                      : "Archive pool"}
                  </Button>
                </>
              )}
            </>
          }
        >
          <div className="queue-stack">
            {error ? <p role="alert">{error}</p> : null}
            {lifecycleUnknown ? (
              <p role="alert">
                The result is unknown. Retry the same command before editing or
                closing.
              </p>
            ) : null}
            {lifecyclePool?.deletion ? (
              <>
                <p>{lifecyclePool.deletion.message}</p>
                {lifecyclePool.deletion.dependencies.length ? (
                  <ul>
                    {lifecyclePool.deletion.dependencies.map((item) => (
                      <li key={item.code}>
                        {item.count} {item.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
            {lifecyclePool?.deletion?.archiveBlock ? (
              <p role="alert">{lifecyclePool.deletion.archiveBlock.message}</p>
            ) : null}
            {poolAction.action === "archivePool" ? (
              <p>
                Archive does not release occupancy. Handle called protection
                explicitly in the request review; complete or interrupt started
                resources through their normal queue actions.
              </p>
            ) : null}
          </div>
        </TaskDialog>
      ) : null}
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
        description={
          editor?.kind === "pool" &&
          data?.pools.find((pool) => pool.id === editor.poolId)
            ?.tracking_enabled
            ? "Pool identity is preserved by ID. Existing allocations remain intact; availability follows the updated capacity."
            : "Save draft settings for this location."
        }
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
                onClick={() => void loadLatestSettings()}
              >
                Load latest settings
              </OperationButton>
            ) : null}
          </>
        }
      >
        {error ? (
          <OperationAlert color="red" title="Could not save changes">
            {error} Your edits are kept until you choose how to recover.
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
