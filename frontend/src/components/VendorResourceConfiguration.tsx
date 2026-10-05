import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { apiRequest } from "../api/client";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { ResourcePoolForm, ResourceRequirementForm, hasResourceEdits, resourceServiceName, resourceUnits,
  type ResourceConfiguration, type ResourceEditor, type PoolEditor, type RequirementEditor } from "./VendorResourceConfigurationForms";
import "./vendor-resource-configuration.css";

type Props = { token: string; tenantSlug: string; locationSlug: string; locationName: string };
type Transition = { type: "edit"; editor: ResourceEditor } | { type: "close" } | { type: "reload" } | { type: "remove"; serviceId: string };

function makePoolEditor(data: ResourceConfiguration, poolId?: string): PoolEditor {
  const pool = data.pools.find((item) => item.id === poolId);
  return { kind: "pool", poolId, name: pool?.name || "", capacity: pool?.capacity || 1,
    initialName: pool?.name || "", initialCapacity: pool?.capacity || 1, version: data.version };
}
function makeRequirementEditor(data: ResourceConfiguration, serviceId: string | null): RequirementEditor {
  const requirement = data.requirements.find((item) => item.service_id === serviceId);
  const poolId = requirement?.pool_id || (data.pools.length === 1 ? data.pools[0].id : null);
  return { kind: "requirement", existing: Boolean(requirement), serviceId, poolId, units: requirement?.units_required || 1,
    initialServiceId: serviceId, initialPoolId: poolId, initialUnits: requirement?.units_required || 1, version: data.version };
}

export function VendorResourceConfiguration(props: Readonly<Props>) {
  const [editor, setEditor] = useState<ResourceEditor | null>(null);
  const [pendingTransition, setPendingTransition] = useState<Transition | null>(null);
  const [removal, setRemoval] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const path = `/vendor/tenant/${encodeURIComponent(props.tenantSlug)}/locations/${encodeURIComponent(props.locationSlug)}/resources`;
  const queryKey = ["vendor-resource-configuration", props.token, props.tenantSlug, props.locationSlug];
  const query = useQuery({ queryKey, queryFn: () => apiRequest<ResourceConfiguration>(path, { token: props.token }),
    refetchOnWindowFocus: false, refetchOnReconnect: false });
  const queryClient = useQueryClient();
  const data = query.data;
  const controlsDisabled = busy || query.isFetching;

  function transition(action: Transition) {
    setPendingTransition(null); setError(null); setNotice(null); setRemoval(null);
    setEditor(action.type === "edit" ? action.editor : null);
    if (action.type === "remove") setRemoval(action.serviceId);
    if (action.type === "reload") void query.refetch();
  }
  function requestTransition(action: Transition) {
    if (controlsDisabled) return;
    if (hasResourceEdits(editor)) setPendingTransition(action);
    else transition(action);
  }
  async function save(body: Record<string, unknown>, version: string, successMessage: string) {
    if (!data || controlsDisabled) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const updated = await apiRequest<ResourceConfiguration, Record<string, unknown>>(path, {
        token: props.token, method: "PUT", body: { ...body, version }
      });
      queryClient.setQueryData(queryKey, updated);
      setEditor(null); setRemoval(null); setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save resource configuration.");
      setRemoval(null);
    } finally { setBusy(false); }
  }
  function submitEditor(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (editor.kind === "pool") {
      void save({ action: "pool", ...(editor.poolId ? { poolId: editor.poolId } : {}), name: editor.name, capacity: editor.capacity }, editor.version, "Resource pool saved.");
    } else {
      void save({ action: "requirement", serviceId: editor.serviceId, poolId: editor.poolId, unitsRequired: editor.units }, editor.version, "Service requirement saved.");
    }
  }
  const unassigned = data?.services.filter((service) => !data.requirements.some((item) => item.service_id === service.id)) || [];
  const assigned = (data?.services.length || 0) - unassigned.length;
  return <Card className="neura-card vendor-resource-configuration" padding="lg">
    <Stack gap="lg">
      <div className="resource-section-heading">
        <div><Text className="neura-label">Resources · {props.locationName}</Text><Title order={3}>Service resources</Title>
          <Text c="dimmed" size="sm">Set shared capacity and the resources each service needs.</Text></div>
        <Button variant="subtle" mih={44} disabled={controlsDisabled} onClick={() => requestTransition({ type: "reload" })}>Refresh</Button>
      </div>
      <Alert color="blue" title="Planning setup">These settings do not enforce booking availability or change wait estimates yet.</Alert>
      {query.isPending ? <Text role="status">Loading service resources…</Text> : null}
      {query.error ? <Alert color="red" title="Could not load resources">Select Refresh to try again.</Alert> : null}
      {error ? <Alert color="red" title="Could not save changes">{error} Your form is kept here; Refresh loads the latest settings and discards edits.</Alert> : null}
      {notice ? <Text role="status" c="teal" fw={600}>{notice}</Text> : null}
      {data ? <>
        <section aria-labelledby="resource-pools-heading">
          <Stack gap="md">
            <div className="resource-section-heading">
              <div><Group gap="xs"><Title id="resource-pools-heading" order={4}>Resource pools</Title><Badge variant="light">{data.pools.length}</Badge></Group>
                <Text c="dimmed" size="sm">Group resources that can be used interchangeably.</Text></div>
              <Button mih={44} variant="light" disabled={controlsDisabled} onClick={() => requestTransition({ type: "edit", editor: makePoolEditor(data) })}>Add pool</Button>
            </div>
            {data.pools.length === 0 ? <Paper className="resource-empty" p="md" withBorder><Text fw={600}>Start with your available resources</Text>
              <Text size="sm" c="dimmed">Add a pool such as Courts, Treatment rooms, or Service chairs, then enter how many are available at once.</Text></Paper> : null}
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
              {data.pools.map((pool) => <Paper key={pool.id} className="resource-summary" p="md" withBorder>
                <div><Text fw={700}>{pool.name}</Text><Text size="sm">{resourceUnits(pool.capacity)} available together</Text>
                  <Text size="sm" c="dimmed">{data.requirements.filter((item) => item.pool_id === pool.id).length} service requirements</Text></div>
                <Button variant="default" mih={44} disabled={controlsDisabled} aria-label={`Edit ${pool.name} pool`}
                  onClick={() => requestTransition({ type: "edit", editor: makePoolEditor(data, pool.id) })}>Edit pool</Button>
              </Paper>)}
            </SimpleGrid>
            {editor?.kind === "pool" ? <ResourcePoolForm editor={editor} busy={controlsDisabled} onChange={setEditor}
              onSubmit={submitEditor} onCancel={() => requestTransition({ type: "close" })} /> : null}
          </Stack>
        </section>
        <section aria-labelledby="resource-services-heading">
          <Stack gap="md">
            <div className="resource-section-heading">
              <div><Title id="resource-services-heading" order={4}>Service requirements</Title>
                <Text size="sm" c="dimmed">{assigned} of {data.services.length} active services configured</Text></div>
              <Button variant="light" mih={44} disabled={controlsDisabled || data.pools.length === 0 || unassigned.length === 0}
                onClick={() => requestTransition({ type: "edit", editor: makeRequirementEditor(data, null) })}>Assign service</Button>
            </div>
            {data.pools.length === 0 ? <Text size="sm" c="dimmed">Add a resource pool first to assign services.</Text> : null}
            {data.services.length === 0 ? <Text size="sm" c="dimmed">No active services are offered at this location. Add them in Services.</Text> : null}
            {data.requirements.length === 0 ? <Text size="sm" c="dimmed">No services assigned yet. Each service can use one pool at this location.</Text> : null}
            <Stack gap="xs">
              {data.requirements.map((requirement) => <Paper className="resource-summary" key={requirement.service_id} p="md" withBorder>
                <div><Text fw={700}>{resourceServiceName(data, requirement.service_id)}</Text>
                  <Text size="sm" c="dimmed">{resourceUnits(requirement.units_required)} · {data.pools.find((pool) => pool.id === requirement.pool_id)?.name || "Unavailable pool"}</Text></div>
                <Group className="resource-summary__actions" gap="xs">
                  <Button variant="default" mih={44} disabled={controlsDisabled || !data.services.some((service) => service.id === requirement.service_id)}
                    aria-label={`Edit requirement for ${resourceServiceName(data, requirement.service_id)}`}
                    onClick={() => requestTransition({ type: "edit", editor: makeRequirementEditor(data, requirement.service_id) })}>Edit</Button>
                  <Button color="red" variant="subtle" mih={44} disabled={controlsDisabled}
                    aria-label={`Remove requirement for ${resourceServiceName(data, requirement.service_id)}`}
                    onClick={() => requestTransition({ type: "remove", serviceId: requirement.service_id })}>Remove</Button>
                </Group>
              </Paper>)}
            </Stack>
            {editor?.kind === "requirement" ? <ResourceRequirementForm data={data} editor={editor} busy={controlsDisabled} onChange={setEditor}
              onSubmit={submitEditor} onCancel={() => requestTransition({ type: "close" })} /> : null}
          </Stack>
        </section>
      </> : null}
    </Stack>
    <ConfirmActionModal className="resource-confirm-modal" opened={Boolean(pendingTransition)} title="Discard unsaved changes?"
      description="Your resource edits have not been saved. Discard them to continue, or keep editing."
      confirmLabel="Discard changes" onClose={() => setPendingTransition(null)} onConfirm={() => {
        if (pendingTransition) transition(pendingTransition);
      }} />
    <ConfirmActionModal className="resource-confirm-modal" opened={Boolean(removal)} title="Remove service requirement?" cancelLabel="Keep requirement"
      description={data && removal ? `${resourceServiceName(data, removal)} will no longer have a resource requirement at ${props.locationName}. You can assign it again later.` : ""}
      confirmLabel="Remove requirement" loading={busy} onClose={() => { if (!busy) setRemoval(null); }} onConfirm={() => {
        if (data && removal) void save({ action: "removeRequirement", serviceId: removal }, data.version, "Service requirement removed.");
      }} />
  </Card>;
}
