import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Group, NumberInput, Paper, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { apiRequest } from "../api/client";

type Configuration = {
  version: string;
  pools: { id: string; name: string; capacity: number; revision: number; tracking_enabled: boolean }[];
  requirements: { service_id: string; pool_id: string; units_required: number; revision: number }[];
  services: { id: string; name: string }[];
  trackingAvailable: false;
};
type Props = { token: string; tenantSlug: string; locationSlug: string; locationName: string };

export function VendorResourceConfiguration(props: Props) {
  // Parent keys this component by tenant/location so unsaved input cannot move between branches.
  const [poolId, setPoolId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number | string>(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [requirementPoolId, setRequirementPoolId] = useState<string | null>(null);
  const [units, setUnits] = useState<number | string>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const path = `/vendor/tenant/${encodeURIComponent(props.tenantSlug)}/locations/${encodeURIComponent(props.locationSlug)}/resources`;
  const query = useQuery({
    queryKey: ["vendor-resource-configuration", props.token, props.tenantSlug, props.locationSlug],
    queryFn: () => apiRequest<Configuration>(path, { token: props.token }),
    // Keep the version displayed when an edit begins; stale saves are rejected by the server.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const queryClient = useQueryClient();
  const data = query.data;
  async function save(body: Record<string, unknown>) {
    if (!data || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const updated = await apiRequest<Configuration, Record<string, unknown>>(path, {
        token: props.token, method: "PUT", body: { ...body, version: data.version }
      });
      queryClient.setQueryData(["vendor-resource-configuration", props.token, props.tenantSlug, props.locationSlug], updated);
      if (body.action === "pool" && !body.poolId) { setName(""); setCapacity(1); }
      setNotice("Resource configuration saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save resource configuration.");
    } finally { setBusy(false); }
  }
  function submitPool(event: FormEvent) {
    event.preventDefault();
    void save({ action: "pool", ...(poolId ? { poolId } : {}), name, capacity });
  }
  function submitRequirement(event: FormEvent) {
    event.preventDefault();
    void save({ action: "requirement", serviceId, poolId: requirementPoolId, unitsRequired: units });
  }
  function selectPool(value: string | null) {
    setPoolId(value);
    const pool = data?.pools.find((item) => item.id === value);
    setName(pool?.name || ""); setCapacity(pool?.capacity || 1);
  }
  function selectService(value: string | null) {
    setServiceId(value);
    const requirement = data?.requirements.find((item) => item.service_id === value);
    setRequirementPoolId(requirement?.pool_id || null); setUnits(requirement?.units_required || 1);
  }
  return <Card className="neura-card vendor-resource-configuration" padding="lg">
    <Stack gap="md">
      <div>
        <Text className="neura-label">Resources · {props.locationName}</Text>
        <Title order={3}>Plan service resources</Title>
      </div>
      <Alert color="blue" title="Configuration only">
        Name shared resources such as courts, chairs, rooms, or staff positions. These settings support reservation audits;
        they do not allocate resources, prevent booking conflicts, or change customer wait estimates yet.
      </Alert>
      {query.isPending ? <Text>Loading resource configuration…</Text> : null}
      {query.error ? <Alert color="red">Could not load resource configuration. Try reloading.</Alert> : null}
      {error ? <Alert color="red">{error}</Alert> : null}
      {notice ? <Alert color="teal">{notice}</Alert> : null}
      <Button variant="default" mih={44} disabled={busy || query.isFetching} onClick={() => {
        setPoolId(null); setName(""); setCapacity(1); setServiceId(null); setRequirementPoolId(null); setUnits(1);
        setError(null); setNotice(null); void query.refetch();
      }}>Reload configuration and clear forms</Button>
      {data ? <>
        <Stack gap="xs">
          {data.pools.length === 0 ? <Text c="dimmed">No resource pools configured for this location.</Text> : null}
          {data.pools.map((pool) => <Paper key={pool.id} p="md" withBorder>
            <Group justify="space-between"><Text fw={700}>{pool.name}</Text><Badge>{pool.capacity} units</Badge></Group>
          </Paper>)}
        </Stack>
        <Paper p="md" withBorder component="form" onSubmit={submitPool}>
          <Stack gap="sm">
            <Title order={4}>{poolId ? "Edit resource pool" : "Add resource pool"}</Title>
            <Select styles={{ input: { minHeight: 44 }, option: { minHeight: 44 } }} label="Resource pool" description="Choose a pool to edit, or leave empty to add one."
              data={data.pools.map((pool) => ({ value: pool.id, label: pool.name }))}
              value={poolId} onChange={selectPool} clearable disabled={busy} />
            <TextInput styles={{ input: { minHeight: 44 } }} label="Resource name" placeholder="e.g. Treatment rooms" value={name} maxLength={120} required
              disabled={busy} onChange={(event) => setName(event.currentTarget.value)} />
            <NumberInput styles={{ input: { minHeight: 44 } }} label="Available resource units" description="Physical or staffed units available together, not duration or ticket count."
              min={1} max={100} allowDecimal={false} value={capacity} onChange={setCapacity} required disabled={busy} />
            <Button type="submit" mih={44} fullWidth loading={busy} disabled={query.isFetching}>Save resource pool</Button>
          </Stack>
        </Paper>
        <Paper p="md" withBorder component="form" onSubmit={submitRequirement}>
          <Stack gap="sm">
            <Title order={4}>Service resource requirement</Title>
            <Text size="sm" c="dimmed">Set resource units needed simultaneously for one scheduled service item.
              Booked quantity may represent time slots; it does not automatically multiply resource units.
              This draft supports one pool per service at this location.</Text>
            <Select styles={{ input: { minHeight: 44 }, option: { minHeight: 44 } }} label="Service at this location" data={data.services.map((service) => ({ value: service.id, label: service.name }))}
              value={serviceId} onChange={selectService} searchable required disabled={busy} />
            <Select styles={{ input: { minHeight: 44 }, option: { minHeight: 44 } }} label="Required resource pool" data={data.pools.map((pool) => ({ value: pool.id, label: pool.name }))}
              value={requirementPoolId} onChange={setRequirementPoolId} required disabled={busy} />
            <NumberInput styles={{ input: { minHeight: 44 } }} label="Units used together" min={1} max={data.pools.find((pool) => pool.id === requirementPoolId)?.capacity || 100}
              allowDecimal={false} value={units} onChange={setUnits} required disabled={busy} />
            <Button type="submit" mih={44} fullWidth loading={busy} disabled={!serviceId || !requirementPoolId || query.isFetching}>Save service requirement</Button>
          </Stack>
        </Paper>
        <Stack gap="sm">
          <Title order={4}>Saved requirements</Title>
          {data.requirements.length === 0 ? <Text c="dimmed">No service requirements configured.</Text> : null}
          {data.requirements.map((requirement) => <Paper key={requirement.service_id} p="md" withBorder>
            <Stack gap="xs">
              <Text fw={700}>{data.services.find((service) => service.id === requirement.service_id)?.name || `Unavailable service ${requirement.service_id}`}</Text>
              <Text>{requirement.units_required} units · {data.pools.find((pool) => pool.id === requirement.pool_id)?.name || "Unavailable pool"}</Text>
              <Button variant="default" mih={44} fullWidth disabled={busy || query.isFetching}
                onClick={() => void save({ action: "removeRequirement", serviceId: requirement.service_id })}>Remove requirement</Button>
            </Stack>
          </Paper>)}
        </Stack>
      </> : null}
    </Stack>
  </Card>;
}
