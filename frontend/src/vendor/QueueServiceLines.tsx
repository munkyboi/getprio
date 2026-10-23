import { IconTrash } from "@tabler/icons-react";
import { EntityGrid, EntityCard, EntityIconAction } from "./EntityCards";
import { ConfigurationInput, ConfigurationSelect } from "./ConfigurationUi";
import { Button } from "./components/ui/button";

/** Local form state only. Authoritative IDs, revisions and resource snapshots come from the API. */
export interface QueueServiceLineDraft {
  lineId: string;
  serviceId: string;
  units: string;
  durationMinutes: string;
}
export interface QueueServiceChoice {
  id: string;
  name: string;
  durationMinutes: number;
  quantityMin: number;
  quantityMax: number;
  durationEditable: boolean;
  resourceReady?: boolean;
  resourceLabel?: string | null;
  unitsPerQuantity?: number | null;
}
export function newQueueServiceLine(): QueueServiceLineDraft {
  return { lineId: crypto.randomUUID(), serviceId: "", units: "1", durationMinutes: "" };
}

export function QueueServiceLines({lines, options, busy, locked, onChange}: {
  lines: QueueServiceLineDraft[];
  options: QueueServiceChoice[];
  busy: boolean;
  locked?: boolean;
  onChange: (lines: QueueServiceLineDraft[]) => void;
}) {
  const disabled = busy || Boolean(locked);
  const update = (lineId: string, change: Partial<QueueServiceLineDraft>) => onChange(lines.map(line => line.lineId === lineId ? {...line, ...change} : line));
  return <section className="queue-stack" aria-label="Ticket service lines">
    <div className="ops-list-heading"><div><h2 className="ops-heading">Services requested</h2><p className="ops-muted">Units and service time are separate. Three courts for three hours means 3 units for 180 minutes.</p></div><Button type="button" variant="outline" disabled={disabled || lines.length >= 20} onClick={() => onChange([...lines, newQueueServiceLine()])}>Add service line</Button></div>
    {locked ? <p role="status">This service plan is read-only. Booking-backed plans and work that has started cannot be changed here.</p> : null}
    {!lines.length ? <p className="ops-muted">No service lines yet. Draft work can remain incomplete; publishing requires server validation.</p> : null}
    <EntityGrid label="Ticket service lines">{lines.map((line,index) => {
      const service = options.find(option => option.id === line.serviceId);
      const unavailable = Boolean(line.serviceId && !service);
      return <EntityCard key={line.lineId} title={`Service ${index+1}${service ? ` · ${service.name}` : ""}`} footer={<EntityIconAction label={`Remove service line ${index+1}${service ? ` ${service.name}` : ""}`} disabled={disabled} onClick={() => onChange(lines.filter(item => item.lineId !== line.lineId))}><IconTrash aria-hidden="true"/></EntityIconAction>}>
        <div className="queue-stack">
          <ConfigurationSelect label={`Service for line ${index+1}`} disabled={disabled} value={line.serviceId || "__none__"}
            data={[{value:"__none__",label:"Select service"},...options.map(option=>({value:option.id,label:option.name})),...(unavailable ? [{value:line.serviceId,label:"Unavailable service"}] : [])]}
            onChange={id => { const selected=options.find(option=>option.id===id); update(line.lineId,{serviceId:id === "__none__" ? "" : id || "",units:String(selected?.quantityMin ?? 1),durationMinutes:selected ? String(selected.durationMinutes) : ""}); }}/>
          <ConfigurationInput label={`Units for line ${index+1}`} type="number" inputMode="numeric" min={service?.quantityMin ?? 1} max={service?.quantityMax} step={1} disabled={disabled || !service} value={line.units} onChange={event=>update(line.lineId,{units:event.currentTarget.value})}/>
          <ConfigurationInput label={`Duration in minutes for line ${index+1}`} type="number" inputMode="numeric" min={1} step={1} disabled={disabled || !service?.durationEditable} value={line.durationMinutes} onChange={event=>update(line.lineId,{durationMinutes:event.currentTarget.value})}/>
          {service?.resourceLabel ? <p className="ops-muted">Configured requirement: {service.unitsPerQuantity} unit(s) from {service.resourceLabel} per service quantity. Capacity is checked by the server.</p> : null}
          {service?.resourceReady === false ? <p role="status">Resource setup is not ready for publication.</p> : null}
          {service && !service.durationEditable ? <p className="ops-muted">Configured duration: {service.durationMinutes} minutes.</p> : null}
          {service && line.durationMinutes && Number(line.durationMinutes) !== service.durationMinutes && !service.durationEditable ? <p role="alert">The saved duration differs from the current catalog. Reselect this service to review its current duration before publishing.</p> : null}
          {unavailable ? <p role="alert">This service is no longer offered. Review the plan before publishing.</p> : null}
        </div>
      </EntityCard>;
    })}</EntityGrid>
    <p className="ops-muted">The server validates resource requirements and capacity. These selections do not reserve resources or create a queue position.</p>
  </section>;
}
