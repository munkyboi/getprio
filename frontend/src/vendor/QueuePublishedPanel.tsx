import { useQueueCommandLocked } from './queueCommandOwner';
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { QueuePublishedPlanV2 } from '../../../shared/queuePlanV2';
import { commandQueuePlan, listPublishedQueuePlans } from '../api/queuePlansV2';
import { ApiError } from '../api/client';
import { planRevisionInput, recordedPlanGroup } from './queuePlanCommands';
import { PublishedQueuePlans } from './PublishedQueuePlans';
import { QueuePlanDialog, type QueuePlanDraft } from './QueuePlanDialog';
import { queueDraftInput } from './QueueDraftsPanel';
import type { QueueServiceChoice } from './QueueServiceLines';
import { ConfigurationScope, ConfigurationTextarea } from './ConfigurationUi';
import { TaskDialog } from './TaskDialog';
import { OperationButton, OperationQueryState } from './OperationsUi';

type Action='amend'|'call'|'start'|'complete'|'interrupt';
export function QueuePublishedPanel({token,tenant,location,counterSlug,options,catalogRevision,onEditForm,onCloseForm,onBusy,onTicketIds}:{token:string;tenant:string;location:string;counterSlug:string;options:QueueServiceChoice[];catalogRevision?:string;onEditForm:(form:HTMLFormElement)=>void;onCloseForm:()=>void;onBusy:(busy:boolean)=>void;onTicketIds:(ids:string[])=>void}) {
 const commandLocked=useQueueCommandLocked();
 const client=useQueryClient();
 const query=useInfiniteQuery({queryKey:['published-queue-plans-v2',token,tenant,location],initialPageParam:undefined as string|undefined,queryFn:({signal,pageParam})=>listPublishedQueuePlans(token,tenant,location,signal,pageParam),getNextPageParam:page=>page.nextCursor||undefined,retry:false});
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const [editing,setEditing]=useState<QueuePublishedPlanV2|null>(null),[interrupting,setInterrupting]=useState<QueuePublishedPlanV2|null>(null),[reason,setReason]=useState('');
 const [last,setLast]=useState<QueuePublishedPlanV2|null>(null);
 const pending=useRef<{id:string;action:Action;body:object;key:string}|null>(null);
 useEffect(()=>{const confirmed=(event:Event)=>{if((event as CustomEvent<{key:string}>).detail.key!==pending.current?.key)return;pending.current=null;setUncertain(false);setError('');setEditing(null);setInterrupting(null);onCloseForm();};window.addEventListener('queue-command-confirmed',confirmed);return()=>window.removeEventListener('queue-command-confirmed',confirmed);},[onCloseForm]);
 const callback=useRef(onBusy);callback.current=onBusy;
 useEffect(()=>{callback.current(busy||uncertain);},[busy,uncertain]);
 useEffect(()=>()=>callback.current(false),[]);
 const refetch=query.refetch;
 useEffect(()=>{const refresh=()=>{void refetch();};window.addEventListener('queue-plans-updated',refresh);return()=>window.removeEventListener('queue-plans-updated',refresh);},[refetch]);
 useEffect(()=>{if(!uncertain)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uncertain]);
 async function execute(plan?:QueuePublishedPlanV2,action?:Action,extra:object={}){
  if(busy)return;
  try{if(!pending.current){if(!plan||!action||!plan.allowedActions.includes(action))throw Error('Refresh the plan before continuing.');pending.current={id:plan.id,action,body:{...planRevisionInput(plan),...extra},key:crypto.randomUUID()};}
   setBusy(true);setError('');const c=pending.current;const response=await commandQueuePlan(token,tenant,location,c.id,c.action,c.body,c.key);setLast(response.plan);pending.current=null;setUncertain(false);setEditing(null);setInterrupting(null);onCloseForm();void client.invalidateQueries();void query.refetch();window.dispatchEvent(new Event('queue-plans-updated'));
  }catch(e){setError(e instanceof Error?e.message:'Service action failed.');const unknown=pending.current && (!(e instanceof ApiError)||e.status>=500);setUncertain(Boolean(unknown));if(!unknown){pending.current=null;void query.refetch();}}
  finally{setBusy(false);}
 }
 function action(plan:QueuePublishedPlanV2,action:Action){
  if(action==='amend'){setError('');setEditing(plan);return;}
  if(action==='interrupt'){setReason('');setInterrupting(plan);return;}
  try{const extra=action==='call'?{counterSlug}:action==='start'?{reservationGroupId:recordedPlanGroup(plan,'reservation')}:{allocationGroupId:recordedPlanGroup(plan,'allocation')};void execute(plan,action,extra);}catch(e){setError(e instanceof Error?e.message:'Refresh resource records.');}
 }
 const plans=query.data?.pages.flatMap(page=>page.plans)||[];
 const ids=plans.map(plan=>plan.ticketId).sort().join(',');
 const idCallback=useRef(onTicketIds);idCallback.current=onTicketIds;
 useEffect(()=>{idCallback.current(ids ? ids.split(','):[]);},[ids]);
 const form:QueuePlanDraft|undefined=editing?{catalogRevision:null,customerName:editing.customer.name||'',customerEmail:editing.customer.email||'',customerPhone:editing.customer.phone||'',notes:editing.notes,lines:editing.lines.map(line=>({lineId:line.lineId,serviceId:line.serviceId,units:String(line.quantity),durationMinutes:String(line.durationMinutes)}))}:undefined;
 return <section className="queue-stack" aria-label="Multi-service tickets"><div className="ops-list-heading"><div><h2 className="ops-heading">Multi-service tickets</h2><p className="ops-muted">Linear service plans · Call protects capacity; Start revalidates it.</p></div><OperationButton variant="outline" disabled={busy||uncertain} onClick={()=>void query.refetch()}>Refresh service plans</OperationButton></div>
 <OperationQueryState loading={query.isPending} error={query.error} onRetry={()=>void query.refetch()}/>
 {error&&!editing ? <p role="alert">{error}</p>:null}{uncertain?<div role="alert"><p>The command result is unknown. Retry the same command before making another change.</p><OperationButton disabled={busy} onClick={()=>void execute()}>Retry same command</OperationButton></div>:null}
 <PublishedQueuePlans plans={plans} busy={busy||uncertain||commandLocked} onAction={action}/>
 {query.hasNextPage?<OperationButton disabled={busy} onClick={()=>void query.fetchNextPage()}>Load more service plans</OperationButton>:null}
 {last&&!plans.some(plan=>plan.id===last.id)?<><h3>Last completed action</h3><PublishedQueuePlans plans={[last]} busy={busy||uncertain||commandLocked} onAction={action}/></>:null}
 {editing&&form?<ConfigurationScope onEdit={onEditForm}><QueuePlanDialog key={editing.id+editing.planRevision} mode="amend" initial={form} customerReadOnly options={options} catalogRevision={catalogRevision} busy={busy} uncertain={uncertain} error={error} onClose={()=>{setEditing(null);onCloseForm();}} onSaveDraft={async()=>{}} onPublish={async()=>{}} onAmend={async(draft,reason,agreed)=>{if(!catalogRevision||draft.catalogRevision!==catalogRevision){setError('Review current service durations and resource requirements first.');return;}await execute(editing,'amend',{lines:queueDraftInput(draft).lines,expectedCatalogRevision:catalogRevision,reason,...(agreed?{customerAgreement:{confirmed:true}}:{})});}}/></ConfigurationScope>:null}
 {interrupting?<TaskDialog opened busy={busy||uncertain||commandLocked} title="Interrupt service" description="Release this service allocation with an audited reason." onClose={()=>setInterrupting(null)} footer={uncertain?<OperationButton disabled={busy} onClick={()=>void execute()}>Retry same command</OperationButton>:<OperationButton disabled={busy||!reason.trim()} onClick={()=>{try{void execute(interrupting,'interrupt',{allocationGroupId:recordedPlanGroup(interrupting,'allocation'),reason:reason.trim()});}catch(e){setError(e instanceof Error?e.message:'Refresh resource records.');}}}>Interrupt and release</OperationButton>}><ConfigurationTextarea label="Reason for interruption" value={reason} disabled={busy||uncertain} onChange={event=>setReason(event.currentTarget.value)}/></TaskDialog>:null}
 </section>;
}
