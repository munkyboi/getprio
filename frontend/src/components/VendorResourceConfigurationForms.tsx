import { Badge, Button, Group, NumberInput, Paper, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import type { FormEvent } from "react";

export type ResourceConfiguration = {
  version: string;
  pools: { id: string; name: string; capacity: number; revision: number; tracking_enabled: boolean }[];
  requirements: { service_id: string; pool_id: string; units_required: number; revision: number }[];
  services: { id: string; name: string }[];
  trackingAvailable: false;
};
export type PoolEditor = {
  kind: "pool"; poolId?: string; name: string; capacity: number | string; version: string;
  initialName: string; initialCapacity: number | string;
};
export type RequirementEditor = {
  kind: "requirement"; existing: boolean; serviceId: string | null; poolId: string | null;
  units: number | string; version: string; initialServiceId: string | null;
  initialPoolId: string | null; initialUnits: number | string;
};
export type ResourceEditor = PoolEditor | RequirementEditor;
export function hasResourceEdits(editor: ResourceEditor | null) {
  if (!editor) return false;
  if (editor.kind === "pool") return editor.name !== editor.initialName || editor.capacity !== editor.initialCapacity;
  return editor.serviceId !== editor.initialServiceId || editor.poolId !== editor.initialPoolId || editor.units !== editor.initialUnits;
}
export function resourceUnits(count: number) { return `${count} ${count === 1 ? "unit" : "units"}`; }
export function resourceServiceName(data: ResourceConfiguration, id: string) {
  return data.services.find((service) => service.id === id)?.name || `Unavailable service ${id}`;
}
const fieldStyles = { input: { minHeight: 44 }, option: { minHeight: 44 } };
type FormActions = { busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent) => void };

export function ResourcePoolForm({ editor, busy, onChange, onCancel, onSubmit }: Readonly<FormActions & {
  editor: PoolEditor; onChange: (editor: PoolEditor) => void;
}>) {
  return <Paper className="resource-editor" p="md" withBorder component="form" onSubmit={onSubmit}>
    <Stack gap="md">
      <div><Text className="neura-label">Resource pool</Text><Title order={4}>{editor.poolId ? `Edit ${editor.initialName}` : "Add a resource pool"}</Title></div>
      <TextInput autoFocus styles={fieldStyles} label="Pool name" description="Group interchangeable resources, such as courts, chairs, or rooms."
        placeholder="e.g. Courts" value={editor.name} maxLength={120} required disabled={busy}
        onChange={(event) => onChange({ ...editor, name: event.currentTarget.value })} />
      <NumberInput hideControls styles={fieldStyles} label="Available units" description="How many can be used at the same time? Enter a whole number from 1 to 100."
        min={1} max={100} allowDecimal={false} value={editor.capacity} required disabled={busy}
        onChange={(capacity) => onChange({ ...editor, capacity })} />
      <Group className="resource-editor__actions">
        <Button variant="default" mih={44} disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="submit" mih={44} loading={busy} disabled={!editor.name.trim() || !Number.isInteger(editor.capacity)}>
          {editor.poolId ? "Save changes" : "Add pool"}
        </Button>
      </Group>
    </Stack>
  </Paper>;
}

export function ResourceRequirementForm({ editor, data, busy, onChange, onCancel, onSubmit }: Readonly<FormActions & {
  editor: RequirementEditor; data: ResourceConfiguration; onChange: (editor: RequirementEditor) => void;
}>) {
  const availableServices = data.services.filter((service) => editor.existing || !data.requirements.some((item) => item.service_id === service.id));
  const pool = data.pools.find((item) => item.id === editor.poolId);
  return <Paper className="resource-editor" p="md" withBorder component="form" onSubmit={onSubmit}>
    <Stack gap="md">
      <div><Text className="neura-label">Service requirement</Text><Title order={4}>{editor.existing ? "Edit service requirement" : "Assign resources to a service"}</Title></div>
      {editor.existing && editor.serviceId ? <Text fw={700}>{resourceServiceName(data, editor.serviceId)}</Text> :
        <Select autoFocus styles={fieldStyles} label="Service" placeholder="Choose an unassigned service" searchable required
          data={availableServices.map((service) => ({ value: service.id, label: service.name }))}
          value={editor.serviceId} disabled={busy} onChange={(serviceId) => onChange({ ...editor, serviceId })} />}
      <Select autoFocus={editor.existing} styles={fieldStyles} label="Resource pool" placeholder="Choose a pool" required
        data={data.pools.map((item) => ({ value: item.id, label: `${item.name} · ${resourceUnits(item.capacity)}` }))}
        value={editor.poolId} disabled={busy} onChange={(poolId) => onChange({ ...editor, poolId })} />
      <NumberInput hideControls styles={fieldStyles} label="Units needed together"
        description="For one scheduled service item. Duration and booked quantity do not automatically increase these units."
        min={1} max={pool?.capacity || 100} allowDecimal={false} value={editor.units} required disabled={busy}
        onChange={(units) => onChange({ ...editor, units })} />
      {pool ? <Badge variant="light" style={{ alignSelf: "flex-start", maxWidth: "100%", height: "auto", whiteSpace: "normal" }}>{pool.name}: {resourceUnits(pool.capacity)} available</Badge> : null}
      <Group className="resource-editor__actions">
        <Button variant="default" mih={44} disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button type="submit" mih={44} loading={busy} disabled={!editor.serviceId || !editor.poolId || !Number.isInteger(editor.units)}>
          {editor.existing ? "Save changes" : "Assign service"}
        </Button>
      </Group>
    </Stack>
  </Paper>;
}
