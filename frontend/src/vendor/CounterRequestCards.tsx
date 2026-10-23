import { IconEye, IconPlayerPlay, IconSpeakerphone } from '@tabler/icons-react';
import type { QueueCounterTargetV1 } from '../../../shared/queueCounterControlsV1';
import { counterPlanSummary, counterPickerText, type CounterCardPlan } from './queueCounterCard';
import { OperationButton } from './OperationsUi';
import { RequestStatusBadge } from './RequestStatusBadge';
import { ServiceHoursNotice } from './ServiceHoursNotice';
import { Badge } from './components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from './components/ui/select';
type Props={current?:QueueCounterTargetV1|null;currentPlan?:CounterCardPlan;nextTarget?:QueueCounterTargetV1|null;nextPlan:CounterCardPlan|null;pickerPlans:CounterCardPlan[];selected:boolean;loading:boolean;disabled:boolean;openDisabled:boolean;startEnabled:boolean;callEnabled:boolean;eligible:boolean;onSelect:(id:string)=>void;onOpen:(id:string)=>void;onStart:()=>void;onCall:()=>void};
function Metadata({plan,loading}:{plan?:CounterCardPlan|null;loading:boolean}){const summary=counterPlanSummary(plan);return <div className="queue-counter-next-details">{summary?<><p>{summary.services} service{summary.services===1?'':'s'} · {summary.resources} resource{summary.resources===1?'':'s'}</p><p>{summary.minutes?`${summary.minutes} min total duration`:'Duration unavailable'}</p></>:<p className="ops-muted">{loading?'Loading request details…':'Request details unavailable.'}</p>}</div>;}
export function CounterRequestCards({current,currentPlan,nextTarget,nextPlan,pickerPlans,selected,loading,disabled,openDisabled,startEnabled,callEnabled,eligible,onSelect,onOpen,onStart,onCall}:Props){
  const currentId=current?.planId;
  const exactCurrent=currentPlan?.id===currentId?currentPlan:undefined;
  const next=nextPlan&&(!currentId||nextPlan.id!==currentId)&&(!current||nextPlan.ticketId!==current.ticketId)?nextPlan:null;
  const target=nextTarget&&(!currentId||nextTarget.planId!==currentId)&&(!current||nextTarget.ticketId!==current.ticketId)?nextTarget:null;
  const nextId=next?.id||(!selected?target?.planId:undefined);
  const label=(plan:CounterCardPlan)=>`${plan.ticketNumber} · ${plan.customer.name||'Customer'}`;
  const option=(id:string,ticketNumber:string,customerName:string|undefined,state:string,conflict:boolean)=>({id,identity:`${ticketNumber} · ${customerName||'Customer'}`,label:counterPickerText(ticketNumber,customerName,state,conflict),status:conflict?'Resource conflict':state!=='waiting'?state.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase()):null,variant:conflict?'warning' as const:state==='in_service'?'info' as const:'secondary' as const});
  const options=pickerPlans.map(plan=>option(plan.id,plan.ticketNumber,plan.customer.name,plan.state,Boolean(plan.resourceWait)));
  if(target?.planId&&!options.some(item=>item.id===target.planId))options.unshift(option(target.planId,target.ticketNumber,target.customerName,target.state,Boolean(target.resourceWait)));
  const nextLabel=next?label(next):target&&!selected?`${target.ticketNumber} · ${target.customerName||'Customer'}`:loading?'Loading selected counter controls…':'No eligible request at this counter.';
  const state=next?.state||(!selected?target?.state:undefined),conflict=next?.resourceWait||(!selected?target?.resourceWait:null);
  const hours=next?.serviceHoursEligibility||(!selected?target?.serviceHoursEligibility:undefined);
  return <div className="queue-counter-cards" aria-live="polite" data-has-current={Boolean(current)}>
    {current?<section className="queue-counter-next-panel queue-counter-current-card" aria-label="Current ticket">
      <div className="queue-counter-next-header"><p className="queue-counter-next-label">Current ticket</p><RequestStatusBadge state={current.state}/></div>
      <p className="queue-counter-next-ticket">{current.ticketNumber} · {current.customerName||'Customer'}</p>
      <Metadata plan={exactCurrent} loading={loading}/>
      <div className="queue-counter-card-actions">{current.state==='called'&&!current.serviceStartedAt?<OperationButton disabled={disabled||!startEnabled} onClick={onStart}><IconPlayerPlay aria-hidden="true"/>Start service</OperationButton>:null}<OperationButton variant="outline" disabled={openDisabled||!currentId} onClick={()=>{if(currentId)onOpen(currentId);}}><IconEye aria-hidden="true"/>Open current request</OperationButton></div>
    </section>:null}
    <section className="queue-counter-next-panel queue-counter-next-card" aria-label={selected?'Selected request':'Next eligible'}>
      <div className="queue-counter-next-header"><p className="queue-counter-next-label">{selected?'Selected request':'Next eligible'}</p>{eligible?<Badge variant="success">{callEnabled?'Ready to call':'Eligible'}</Badge>:null}</div>
      <Select value={nextId||''} onValueChange={value=>{if(value!==null)onSelect(value);}} disabled={!options.length}><SelectTrigger className="queue-counter-ticket-picker" aria-label="Choose next request"><span className="queue-counter-ticket-label">{nextLabel}</span></SelectTrigger><SelectContent className="queue-counter-request-popup" align="start" alignItemWithTrigger={false}><SelectGroup aria-label="Requests">{options.map(option=><SelectItem className="queue-counter-picker-item" key={option.id} value={option.id} label={option.label} aria-label={option.label}><span className="queue-counter-picker-option"><span className="queue-counter-picker-option-label">{option.identity}</span>{option.status?<Badge variant={option.variant}>{option.status}</Badge>:null}</span></SelectItem>)}</SelectGroup></SelectContent></Select>
      {state?<div className="queue-counter-request-status"><RequestStatusBadge state={state}/>{conflict?<Badge variant={conflict.code==='RESOURCE_CAPACITY_UNAVAILABLE'?'destructive':'warning'}>Resource conflict</Badge>:state==='waiting'?<Badge variant="success">No resource conflicts</Badge>:null}</div>:null}
      {state==='waiting'?<ServiceHoursNotice eligibility={hours} showNeutral/>:null}
      {conflict?<p className="queue-counter-conflict-detail">{conflict.message}</p>:null}
      {nextId?<Metadata plan={next} loading={loading}/>:null}
      {nextId?<div className="queue-counter-card-actions">{state==='waiting'?<OperationButton disabled={disabled||!callEnabled} onClick={onCall}><IconSpeakerphone aria-hidden="true"/>Call request</OperationButton>:null}<OperationButton variant="outline" disabled={openDisabled} onClick={()=>onOpen(nextId)}><IconEye aria-hidden="true"/>Open request</OperationButton></div>:null}
    </section>
  </div>;
}
