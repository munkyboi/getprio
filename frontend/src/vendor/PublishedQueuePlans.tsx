import type { QueuePublishedPlanV2 } from "../../../shared/queuePlanV2";
import { EntityGrid, EntityCard } from "./EntityCards";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";

const stateLabel:Record<QueuePublishedPlanV2['state'],string>={waiting:'Waiting',called:'Called',in_service:'In service',served:'Completed',skipped:'Skipped',cancelled:'Cancelled',unserved:'Unserved',expired:'Expired',pending_carry_over:'Carry-over'};
type Action='amend'|'call'|'start'|'complete'|'interrupt';
const actionLabel:Partial<Record<Action,string>>={amend:'Amend service plan',call:'Call ticket',start:'Start service',complete:'Complete service',interrupt:'Interrupt service'};
function time(value:string){return new Date(value).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});}
/** Server projections only: planned requirements are never rendered as actual occupancy. */
export function PublishedQueuePlans({plans,busy,onAction}:{plans:QueuePublishedPlanV2[];busy:boolean;onAction:(plan:QueuePublishedPlanV2,action:Action)=>void}) {
 return <EntityGrid label="Published service plans">{plans.map(plan=><EntityCard key={plan.id} title={`${plan.ticketNumber} · ${plan.customer.name || 'Customer'}`}
  badges={<Badge variant={plan.state==='in_service' || plan.state==='served' ? 'success' : 'secondary'}>{stateLabel[plan.state]}</Badge>}
  footer={<div className="queue-row">{plan.allowedActions.filter((action):action is Action=>action==='amend'||action==='call'||action==='start'||action==='complete'||action==='interrupt').map(action=><Button key={action} variant={action==='interrupt' ? 'outline' : 'default'} disabled={busy} onClick={()=>onAction(plan,action)}>{actionLabel[action]}<span className="v:sr-only"> for {plan.ticketNumber}</span></Button>)}</div>}>
  <div className="queue-stack">
   <p className="ops-muted">{plan.workflow.mode==='linear'?'Linear':'Multi-station'} workflow · Stage {plan.currentStage.ordinal} · {plan.currentStage.state.replaceAll('_',' ')} · Attempt {plan.currentStage.attempt}</p>
   <ul aria-label={`Services for ${plan.ticketNumber}`}>{plan.lines.map(line=><li key={line.lineId}><strong>{line.serviceName}</strong><p>{line.quantity} unit(s) · {line.durationMinutes} minutes · Parallel</p>{line.requirements.map(requirement=><p className="ops-muted" key={requirement.poolId}>Configured demand: {requirement.totalUnits} resource unit(s) · {requirement.unitsPerQuantity} per service quantity</p>)}</li>)}</ul>
   {plan.resourceWait ? <p role="status">Waiting for resources: {plan.resourceWait.message}</p> : null}
   {plan.reservationGroups.map(group=><div key={group.id}><p className="ops-strong">Reservation: {group.state}</p>{group.state==='protected' ? <p className="ops-muted">Call protection expires at {time(group.expiresAt)}. Start revalidates the full requested interval.</p> : null}{group.members.map(member=><p className="ops-muted" key={member.id}>{plan.lines.find(line=>line.lineId===member.lineId)?.serviceName || 'Service line'} · {member.units} reservation unit(s) · {time(member.startsAt)}–{time(member.endsAt)} · {member.state}</p>)}</div>)}
   {plan.allocationGroups.map(group=><div key={group.id}><p className="ops-strong">Service allocation: {group.releasedAt ? group.outcome || 'Released' : 'Holding resources'}</p>{group.members.map(member=><p className="ops-muted" key={member.id}>{plan.lines.find(line=>line.lineId===member.lineId)?.serviceName || 'Service line'} · {member.units} unit(s) · Started {time(member.startedAt)} · Expected end {time(member.expectedEndAt)} · {member.releasedAt ? `Released ${time(member.releasedAt)}` : 'Still held'}</p>)}</div>)}
   <p className="ops-muted">Expected end does not release resources. Refresh authoritative status before acting.</p>
  </div>
 </EntityCard>)}</EntityGrid>;
}
