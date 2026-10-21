import { EntityCard, EntityGrid } from './EntityCards';
import { RequestStatusBadge } from './RequestStatusBadge';

/** Presentation adapter input only. Availability and resource outcomes must be server projections. */
export interface NamedQueueSelectionReview {
 id:string;
 serviceName:string;
 courts:Array<{id:string;resourceName:string;durationLabel:string;statusLabel?:string;extras:Array<{id:string;name:string;durationLabel:string;statusLabel?:string}>}>;
}
export function NamedQueueSelectionSummary({selections}:{selections:NamedQueueSelectionReview[]}) {
 return <section className="queue-stack" aria-label="Resource request review">
  <p className="ops-muted">Review each resource and its extras with their configured durations. Expected end times do not release occupied resources.</p>
  <EntityGrid label="Selected catalog services">{selections.map(service=><EntityCard key={service.id} title={service.serviceName} footer={<p className="ops-muted">Selection availability is provisional until protected by Call.</p>}>
   <ul className="queue-stack" aria-label={`Resource selections for ${service.serviceName}`}>{service.courts.map(court=><li key={court.id}>
    <h4>{court.resourceName}</h4><p>{court.durationLabel}</p>{court.statusLabel?<p><RequestStatusBadge state={court.statusLabel} label={court.statusLabel}/></p>:null}
    {court.extras.length?<><h5>Extras for {court.resourceName}</h5><ul aria-label={`Extras for ${court.resourceName}`}>{court.extras.map(extra=><li key={extra.id}><strong>{extra.name}</strong><p>{extra.durationLabel}</p>{extra.statusLabel?<p><RequestStatusBadge state={extra.statusLabel} label={extra.statusLabel}/></p>:null}</li>)}</ul></>:<p className="ops-muted">No extras selected for this resource.</p>}
   </li>)}</ul>
  </EntityCard>)}</EntityGrid>
 </section>;
}
