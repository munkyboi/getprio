import type { FormEvent } from "react";
import {
  ConfigurationInput,
  ConfigurationSelect,
  ConfigurationScope,
} from "../vendor/ConfigurationUi";
import { FieldGroup } from "../vendor/components/ui/field";
export type ResourceConfiguration = {
  version: string;
  pools: {
    id: string;
    name: string;
    capacity: number;
    revision: number;
    tracking_enabled: boolean;
  }[];
  requirements: {
    service_id: string;
    pool_id: string;
    units_required: number;
    revision: number;
  }[];
  services: { id: string; name: string }[];
  trackingAvailable: false;
};
export type PoolEditor = {
  kind: "pool";
  poolId?: string;
  name: string;
  capacity: number | string;
  version: string;
  initialName: string;
  initialCapacity: number | string;
};
export type RequirementEditor = {
  kind: "requirement";
  existing: boolean;
  serviceId: string | null;
  poolId: string | null;
  units: number | string;
  version: string;
  initialServiceId: string | null;
  initialPoolId: string | null;
  initialUnits: number | string;
};
export type ResourceEditor = PoolEditor | RequirementEditor;
export function hasResourceEdits(editor: ResourceEditor | null) {
  if (!editor) return false;
  if (editor.kind === "pool")
    return (
      editor.name !== editor.initialName ||
      editor.capacity !== editor.initialCapacity
    );
  return (
    editor.serviceId !== editor.initialServiceId ||
    editor.poolId !== editor.initialPoolId ||
    editor.units !== editor.initialUnits
  );
}
export function resourceUnits(count: number) {
  return `${count} ${count === 1 ? "unit" : "units"}`;
}
export function resourceServiceName(data: ResourceConfiguration, id: string) {
  return (
    data.services.find((service) => service.id === id)?.name ||
    `Unavailable service ${id}`
  );
}
export function validResourceUnits(value: number | string, max = 100) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= max
  );
}
export function validResourceEditor(editor: ResourceEditor | null, data?: ResourceConfiguration) {
  if (!editor) return false;
  if (editor.kind === "pool") return Boolean(editor.name.trim()) && validResourceUnits(editor.capacity);
  const pool = data?.pools.find(item=>item.id === editor.poolId);
  return Boolean(pool && data?.services.some(service=>service.id === editor.serviceId) && validResourceUnits(editor.units, pool.capacity));
}

type Actions = { busy: boolean; onSubmit: (event: FormEvent) => void };
export function ResourcePoolForm({
  editor,
  busy,
  onChange,
  onSubmit,
}: Readonly<
  Actions & { editor: PoolEditor; onChange: (editor: PoolEditor) => void }
>) {
  return (
    <ConfigurationScope busy={busy}>
      <form id="vendor-resource-editor" onSubmit={onSubmit}>
        <FieldGroup>
          <ConfigurationInput
            autoFocus
            label="Pool name"
            description="Group interchangeable resources, such as courts, chairs or rooms."
            placeholder="e.g. Courts"
            value={editor.name}
            maxLength={120}
            required
            onChange={(event) =>
              onChange({ ...editor, name: event.currentTarget.value })
            }
          />
          <ConfigurationInput
            type="number"
            label="Pool capacity"
            description="How many units could be used together? Enter a whole number from 1 to 100. This is configured capacity, not live availability."
            min={1}
            max={100}
            step={1}
            required
            value={editor.capacity}
            onChange={(event) =>
              onChange({
                ...editor,
                capacity:
                  event.currentTarget.value === ""
                    ? ""
                    : Number(event.currentTarget.value),
              })
            }
          />
        </FieldGroup>
      </form>
    </ConfigurationScope>
  );
}
export function ResourceRequirementForm({
  editor,
  data,
  busy,
  onChange,
  onSubmit,
}: Readonly<
  Actions & {
    editor: RequirementEditor;
    data: ResourceConfiguration;
    onChange: (editor: RequirementEditor) => void;
  }
>) {
  const services = data.services.filter(
    (service) =>
      editor.existing ||
      !data.requirements.some((item) => item.service_id === service.id),
  );
  const pool = data.pools.find((item) => item.id === editor.poolId);
  return (
    <ConfigurationScope busy={busy}>
      <form id="vendor-resource-editor" onSubmit={onSubmit}>
        <FieldGroup>
          {editor.existing && editor.serviceId ? (
            <p className="ops-strong">
              {resourceServiceName(data, editor.serviceId)}
            </p>
          ) : (
            <ConfigurationSelect
              label="Service"
              placeholder="Choose an unassigned service"
              required
              data={services.map((service) => ({
                value: service.id,
                label: service.name,
              }))}
              value={editor.serviceId}
              onChange={(serviceId) => onChange({ ...editor, serviceId })}
            />
          )}
          <ConfigurationSelect
            label="Resource pool"
            placeholder="Choose a pool"
            required
            data={data.pools.map((item) => ({
              value: item.id,
              label: `${item.name} · ${resourceUnits(item.capacity)}`,
            }))}
            value={editor.poolId}
            onChange={(poolId) => onChange({ ...editor, poolId })}
          />
          <ConfigurationInput
            type="number"
            label="Units needed together"
            description="For one scheduled service item. Duration and booked quantity do not automatically increase these units."
            min={1}
            max={pool?.capacity || 100}
            step={1}
            required
            value={editor.units}
            onChange={(event) =>
              onChange({
                ...editor,
                units:
                  event.currentTarget.value === ""
                    ? ""
                    : Number(event.currentTarget.value),
              })
            }
          />
          {pool ? (
            <p className="ops-muted">
              {pool.name}: {resourceUnits(pool.capacity)} configured
            </p>
          ) : null}
        </FieldGroup>
      </form>
    </ConfigurationScope>
  );
}
