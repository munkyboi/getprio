import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { QueuePublishedPlanV2 } from '../../../shared/queuePlanV2';
import type { QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import { queuePlanBase } from '../api/queuePlansV2';
import { queueReadRequest } from './queueReadRequest';
import { executeQueueWrite, useQueueCommandLocked, type QueueWrite } from './queueCommandOwner';
import { ApiError } from '../api/client';
import { namedPlanRevisions } from './namedQueueCommands';
import { EntityCard, EntityGrid } from './EntityCards';
import { OperationButton, OperationQueryState } from './OperationsUi';
import { TaskDialog } from './TaskDialog';
import { RequestStatusBadge } from './RequestStatusBadge';
import { ConfigurationTextarea } from './ConfigurationUi';
type Plan=QueuePublishedPlanV2|QueuePublishedSelectionPlanV3|QueuePublishedSelectionPlanV4;
export function SkippedQueueRequests({token,tenant,location}:{token:string;tenant:string;location:string}){
 const locked=useQueueCommandLocked(),client=useQueryClient();const [selected,setSelected]=useState<Plan|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const pending=useRef<QueueWrite|null>(null);
 useEffect(()=>{const confirmed=(event:Event)=>{if((event as CustomEvent<{key:string}>).detail.key!==pending.current?.key)return;pending.current=null;setUncertain(false);setError('');setSelected(null);};window.addEventListener('queue-command-confirmed',confirmed);return()=>window.removeEventListener('queue-command-confirmed',confirmed);},[]);
 const query=useInfiniteQuery({queryKey:['skipped-queue-plans',token,tenant,location],initialPageParam:undefined as string|undefined,queryFn:({signal,pageParam})=>queueReadRequest<{plans:Plan[];nextCursor:string|null}>(`${queuePlanBase(tenant,location)}&state=skipped${pageParam?`&cursor=${encodeURIComponent(pageParam)}`:''}`,{token,signal}),getNextPageParam:page=>page.nextCursor||undefined,retry:false});
 const refetch=query.refetch;
 useEffect(()=>{const refresh=()=>{void refetch();};window.addEventListener('queue-plans-updated',refresh);return()=>window.removeEventListener('queue-plans-updated',refresh);},[refetch]);
 useEffect(()=>{if(!uncertain)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uncertain]);
 async function recall(){if(busy||!selected)return;if(!pending.current){if(!reason.trim()||reason.trim().length>500||!selected.allowedActions.includes('recall'))return;pending.current={path:`/vendor/tenant/${encodeURIComponent(tenant)}/queue/plans/${encodeURIComponent(selected.id)}/recall?location=${encodeURIComponent(location)}`,token,body:{...namedPlanRevisions(selected),reason:reason.trim()},key:crypto.randomUUID()};}setBusy(true);setError('');try{await executeQueueWrite(pending.current);pending.current=null;setUncertain(false);setSelected(null);void client.invalidateQueries();window.dispatchEvent(new Event('queue-plans-updated'));}catch(e){setError(e instanceof Error?e.message:'Recall failed.');const unknown=!(e instanceof ApiError)||e.status>=500;setUncertain(unknown);if(!unknown){pending.current=null;void query.refetch();}}finally{setBusy(false);}}
 const plans=query.data?.pages.flatMap(page=>page.plans)||[];
 if(query.isSuccess&&!plans.length&&!query.hasNextPage&&!selected)return null;
 return <section className="queue-stack" aria-label="Skipped service requests"><h2 className="ops-heading">Skipped requests</h2><p className="ops-muted">Recall returns the same request to Waiting with its original priority and queue age. It does not call or allocate resources.</p><OperationQueryState loading={query.isPending} error={query.error} onRetry={()=>void query.refetch()}/><EntityGrid label="Skipped service request tickets">{plans.map(plan=><EntityCard key={plan.id} title={`${plan.ticketNumber} · ${plan.customer.name||'Customer'}`} footer={<OperationButton disabled={locked||!plan.allowedActions.includes('recall')} onClick={()=>{setSelected(plan);setReason('');setError('');}}>Recall request<span className="v:sr-only"> for {plan.ticketNumber}</span></OperationButton>}><p><RequestStatusBadge state="skipped" label="Skipped"/> · Stage {plan.currentStage.ordinal}</p></EntityCard>)}</EntityGrid>{query.hasNextPage?<OperationButton disabled={locked} onClick={()=>void query.fetchNextPage()}>Load more skipped requests</OperationButton>:null}
 {selected?<TaskDialog opened title={`Recall ${selected.ticketNumber}?`} description="Create a new attempt for the same skipped stage. Previous attempts remain in history; no new ticket or publication allowance is used." busy={busy||uncertain} onClose={()=>setSelected(null)} footer={<OperationButton disabled={busy||(!uncertain&&(locked||!reason.trim()||reason.trim().length>500))} onClick={()=>void recall()}>{uncertain?'Retry same Recall command':'Recall to Waiting'}</OperationButton>}><ConfigurationTextarea label="Reason for Recall (required)" required maxLength={500} value={reason} disabled={busy||uncertain} onChange={event=>setReason(event.currentTarget.value)}/>{error?<p role="alert">{error}</p>:null}{uncertain?<p role="alert">The result is unknown. Retry the same command before continuing.</p>:null}</TaskDialog>:null}</section>;
}
