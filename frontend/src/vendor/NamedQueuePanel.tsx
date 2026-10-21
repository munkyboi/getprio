import { LocalResourceActivation } from "./LocalResourceActivation";
import { queueResourceCatalog } from "./queueResourceCatalog";
import { queueStreamScope, useQueueStreamHealthy, createCounterReadQueue } from "./queueCounterLiveUpdates";
import { SavedRequestDrafts } from './SavedRequestDrafts';
import { useQueueCommandLocked } from './queueCommandOwner';
import { namedQueueForm } from "./namedQueueForm";
import { namedExtraExecutions } from "./namedExtraExecutions";
import { getQueueSelectionOptionsV4 } from '../api/queueSelectionsV4';
import { selectionInputV4 } from './QueueSelectionFieldsV4';
import type { QueueSelectionDraftV4, QueueSelectionDraftInputV4, QueuePublishedSelectionPlanV4, QueueSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import { namedPlanRevisions as revisions } from "./namedQueueCommands";
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueueSelectionDraftV3 as LegacyDraft, QueueSelectionDraftInputV3 as LegacyInput, QueuePublishedSelectionPlanV3 as LegacyPublished, QueueSelectionPlanV3 as LegacyPlan } from '../../../shared/queueSelectionPlanV3';
import { getQueueSelectionOptions, listQueueSelections, readQueueSelection, saveQueueSelection, commandQueueSelection } from '../api/queueSelectionsV3';
import { ApiError } from '../api/client';
import { linearQueueRecovery } from './linearQueueErrors';
import { NamedQueuePlanDialog, type NamedQueueFormDraft } from './NamedQueuePlanDialog';
import { NamedQueueOperations, type NamedChildTarget } from './NamedQueueOperations';
import { namedSelectionInput } from './namedQueueSelectionDraft';
import { ConfigurationScope, ConfigurationCheck, ConfigurationTextarea } from './ConfigurationUi';
import { OperationButton, OperationQueryState } from './OperationsUi';
import { TaskDialog } from './TaskDialog';
import { Button } from './components/ui/button';
import { createCompletionReview, type CompletionReview, type CompletionCommand } from './namedCompletionReview';
import { buildInterruptionReview, confirmedInterruption, type InterruptionReview } from './namedInterruptionReview';
import { apiRequest } from '../api/client';
import type { ResourceConfiguration } from '../components/VendorResourceConfigurationForms';
import { listResourceMembers } from '../api/resourceMembers';
import { IconRefresh } from '@tabler/icons-react';
import { RequestCallErrorToasts } from './RequestCallErrorToasts';
import type { RequestCallRejection } from './callRequestNotifications';

type QueueSelectionDraftV3=LegacyDraft|QueueSelectionDraftV4;
type QueueSelectionDraftInputV3=LegacyInput|QueueSelectionDraftInputV4;
type QueuePublishedSelectionPlanV3=LegacyPublished|QueuePublishedSelectionPlanV4;
type QueueSelectionPlanV3=LegacyPlan|QueueSelectionPlanV4;
type Pending={kind:'save';id:string|null;body:QueueSelectionDraftInputV3&{expectedPlanRevision?:string};key:string}|{kind:'command';id:string;action:'publish'|'call'|'start'|'complete'|'interrupt'|'retry'|'amend'|'cancelProtection';body:object;key:string};

function orderResourceMembers<T extends { displayOrder?: number }>(members: T[]) {
 return members.map((member,index)=>({member,index})).sort((left,right)=>(left.member.displayOrder ?? left.index)-(right.member.displayOrder ?? right.index)||left.index-right.index).map(({member})=>member);
}


export function NamedQueuePanel({token,tenant,location,counterSlug,staffMode=false,newRequestSequence=0,onIntakeAvailability,onEditForm,onCloseForm,onBusy,onTicketIds,onNotice,hasUnsavedEdits,onReviewQueueSetup}:{token:string;tenant:string;location:string;counterSlug:string;staffMode?:boolean;newRequestSequence?:number;onIntakeAvailability?:(ready:boolean)=>void;onEditForm:(form:HTMLFormElement)=>void;onCloseForm:()=>void;onBusy:(busy:boolean)=>void;onTicketIds:(ids:string[])=>void;onNotice:(title:string,message:string)=>void;hasUnsavedEdits?:()=>boolean;onReviewQueueSetup?:()=>void}){
 const streamHealthy=useQueueStreamHealthy(queueStreamScope(token,tenant,location));
 const commandLocked=useQueueCommandLocked();
 const client=useQueryClient();
 const options=useQuery({queryKey:['named-queue-options',token,tenant,location],queryFn:({signal})=>getQueueSelectionOptions(token,tenant,location,signal),retry:false});
 const v4Options=useQuery({queryKey:['queue-options-v4',token,tenant,location],queryFn:({signal})=>getQueueSelectionOptionsV4(token,tenant,location,signal),retry:false});
 const resourceConfiguration=useQuery({queryKey:['vendor-resource-configuration',token,tenant,location],queryFn:({signal})=>apiRequest<ResourceConfiguration>(`/vendor/tenant/${encodeURIComponent(tenant)}/locations/${encodeURIComponent(location)}/resources`,{token,signal}),enabled:!staffMode&&Boolean(onReviewQueueSetup),retry:false});
 const resourceMembers=useQuery({queryKey:['vendor-resource-members-catalog',token,tenant,location],queryFn:async({signal})=>Promise.all((resourceConfiguration.data?.pools||[]).filter((pool)=>!pool.archived_at).map((pool)=>listResourceMembers(token,tenant,location,pool.id,signal))),enabled:false,retry:false});
 const drafts=useInfiniteQuery({queryKey:['named-queue-drafts',token,tenant,location],initialPageParam:undefined as string|undefined,queryFn:({signal,pageParam})=>listQueueSelections(token,tenant,location,'draft',signal,pageParam),getNextPageParam:page=>page.nextCursor||undefined,retry:2});
 const active=useInfiniteQuery({queryKey:['named-queue-active',token,tenant,location],initialPageParam:undefined as string|undefined,queryFn:({signal,pageParam})=>listQueueSelections(token,tenant,location,'active',signal,pageParam),getNextPageParam:page=>page.nextCursor||undefined,retry:2});
 const [editor,setEditor]=useState<{plan?:QueueSelectionPlanV3;initial:NamedQueueFormDraft;mode:'draft'|'amend'}|null>(null);
 const streamHealthyRef=useRef(streamHealthy);
 streamHealthyRef.current=streamHealthy;
 const activeRefreshing=useRef<ReturnType<typeof createCounterReadQueue>|null>(null);
 useEffect(()=>{
  const queue=createCounterReadQueue(()=>active.refetch(),()=>document.visibilityState==='visible');
  activeRefreshing.current=queue;
  const onRefresh=()=>queue.update();
  const timer=window.setInterval(()=>{if(!streamHealthyRef.current)onRefresh();},15000);
  window.addEventListener('focus',onRefresh);
  window.addEventListener('online',onRefresh);
  document.addEventListener('visibilitychange',onRefresh);
  window.addEventListener('queue-plans-updated',onRefresh);
  return()=>{
   queue.dispose();
   if(activeRefreshing.current===queue)activeRefreshing.current=null;
   window.clearInterval(timer);
   window.removeEventListener('focus',onRefresh);
   window.removeEventListener('online',onRefresh);
   document.removeEventListener('visibilitychange',onRefresh);
   window.removeEventListener('queue-plans-updated',onRefresh);
  };
 },[active.refetch,token,tenant,location]);
 // Keep the open form's catalog current across accounts without resetting its draft.
 useEffect(()=>{
   if(!editor)return;
   const refreshCatalog=()=>{
     for(const key of ['named-queue-options','queue-options-v4',...(!staffMode?['vendor-resource-configuration','vendor-resource-members-catalog']:[])])
       void client.invalidateQueries({queryKey:[key,token,tenant,location]});
   };
   const onVisible=()=>{if(document.visibilityState==='visible')refreshCatalog();};
   refreshCatalog();
   const timer=window.setInterval(onVisible,15000);
   window.addEventListener('focus',onVisible);
   window.addEventListener('online',onVisible);
   window.addEventListener('queue-plans-updated',refreshCatalog);
   window.addEventListener('vendor-queue-snapshot-updated',refreshCatalog);
   document.addEventListener('visibilitychange',onVisible);
   return()=>{
     window.clearInterval(timer);
     window.removeEventListener('focus',onVisible);
     window.removeEventListener('online',onVisible);
     window.removeEventListener('queue-plans-updated',refreshCatalog);
     window.removeEventListener('vendor-queue-snapshot-updated',refreshCatalog);
     document.removeEventListener('visibilitychange',onVisible);
   };
 },[Boolean(editor),client,token,tenant,location,staffMode]);
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[actionErrors,setActionErrors]=useState<Record<string,RequestCallRejection>>({});
 const [outcome,setOutcome]=useState<{plan:QueuePublishedSelectionPlanV3;target:NamedChildTarget;action:'interrupt'|'retry';review?:InterruptionReview}|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[last,setLast]=useState<QueuePublishedSelectionPlanV3|null>(null);
 const [completion,setCompletion]=useState<CompletionReview|null>(null);
 const completionCancel=useRef<HTMLButtonElement>(null);
 const completionLocked=useRef(false);completionLocked.current=busy||uncertain||commandLocked;
 const completionExecute=useRef<(command:CompletionCommand)=>Promise<void>>(async()=>{});
 const completionReview=useRef<ReturnType<typeof createCompletionReview>|null>(null);
 if(!completionReview.current)completionReview.current=createCompletionReview({onChange:setCompletion,execute:command=>completionExecute.current(command),isLocked:()=>completionLocked.current,createKey:()=>crypto.randomUUID()});
 const [protection,setProtection]=useState<QueuePublishedSelectionPlanV3|null>(null),[protectionReason,setProtectionReason]=useState('');
 const pending=useRef<Pending|null>(null),busyRef=useRef(onBusy),idsRef=useRef(onTicketIds);busyRef.current=onBusy;idsRef.current=onTicketIds;
 useEffect(()=>{const confirmed=(event:Event)=>{if((event as CustomEvent<{key:string}>).detail.key!==pending.current?.key)return;pending.current=null;setUncertain(false);setError('');setEditor(null);setOutcome(null);setProtection(null);completionReview.current?.reset();onCloseForm();};window.addEventListener('queue-command-confirmed',confirmed);return()=>window.removeEventListener('queue-command-confirmed',confirmed);},[onCloseForm]);
 const plans=(active.data?.pages.flatMap(page=>page.plans)||[]).filter((plan):plan is QueuePublishedSelectionPlanV3=>plan.state!=='draft');
 // Conflict highlighting must consider every waiting request, including requests
 // beyond the first server page. Continue loading the active queue in the
 // background so the scan is complete before operators act on it.
 useEffect(()=>{
  if(active.isPending||active.isFetchingNextPage||!active.hasNextPage)return;
  void active.fetchNextPage();
 },[active.fetchNextPage,active.hasNextPage,active.isFetchingNextPage,active.isPending]);
 useEffect(()=>{
  const handleAmend=(event:Event)=>{
   const detail=(event as CustomEvent<{planId?:string;tenant?:string;location?:string}>).detail;
   if(!detail?.planId||detail.tenant!==tenant||detail.location!==location)return;
   const plan=plans.find(item=>item.id===detail.planId);
   if(plan){void open(plan);return;}
   void readQueueSelection(token,tenant,location,detail.planId).then(result=>open(result.plan)).catch(error=>setError(error instanceof Error?error.message:'Request could not be loaded.'));
  };
  window.addEventListener('queue-request-amend',handleAmend);
  return()=>window.removeEventListener('queue-request-amend',handleAmend);
 },[location,plans,tenant]);
 const ids=plans.map(plan=>plan.ticketId).sort().join(',');
 useEffect(()=>{idsRef.current(ids?ids.split(','):[]);},[ids]);
 useEffect(()=>{busyRef.current(busy||uncertain);},[busy,uncertain]);
 useEffect(()=>()=>{busyRef.current(false);idsRef.current([]);},[]);
 useEffect(()=>{if(!uncertain)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[uncertain]);
 const intakeSequence=useRef(newRequestSequence);
 const intakeAvailable=Boolean(v4Options.data?.capabilities.publication)&&!busy&&!uncertain&&!commandLocked&&!editor&&!outcome&&!protection&&!completion;
 useEffect(()=>{onIntakeAvailability?.(intakeAvailable);return()=>onIntakeAvailability?.(false);},[intakeAvailable,onIntakeAvailability]);
 const intakeAction=useRef(()=>{});intakeAction.current=()=>{if(intakeAvailable)void open();};
 useEffect(()=>{if(intakeSequence.current===newRequestSequence)return;intakeSequence.current=newRequestSequence;intakeAction.current();},[newRequestSequence]);
 const choices=(options.data?.services||[]).filter(service=>service.selectionMode==='named').map(service=>({id:service.id,name:service.name,durationOptionsMinutes:service.durationOptionsMinutes,resourceMembers:orderResourceMembers(service.resourceMembers).filter(member=>member.isActive&&!member.archivedAt).map(member=>({id:member.id,name:member.name,availabilityLabel:member.availability.state.replaceAll('_',' ')})),extras:[]}));
 // Picker identity and readiness are identical for staff and managers.
 const resourceCatalog = v4Options.data ? queueResourceCatalog(v4Options.data) : undefined;
 const queryLoading = v4Options.isPending || options.isPending || drafts.isPending || active.isPending;
 const queryError = v4Options.error || options.error || drafts.error || active.error;
 function refresh(){setActionErrors({});for(const key of ['named-queue-options','queue-options-v4','named-queue-drafts','named-queue-active','named-queue-review','local-pool-operations','vendor-dashboard-queue-lifecycle'])void client.invalidateQueries({queryKey:[key,token,tenant,location]});window.dispatchEvent(new Event('queue-plans-updated'));}
 async function send(command?:Pending){if(busy)return;if(!pending.current&&command)pending.current=command;if(!pending.current)return;setBusy(true);setError('');try{const c=pending.current;const response=c.kind==='save'?await saveQueueSelection(token,tenant,location,c.id,c.body,c.key):await commandQueueSelection(token,tenant,location,c.id,c.action,c.body,c.key);if(response.plan.contractVersion!==3&&response.plan.contractVersion!==4)throw Error('Unexpected response. Retry this command to reconcile it.');if(response.plan.state!=='draft')setLast(response.plan);if(c.kind==='command')setActionErrors(current=>{const next={...current};delete next[c.id];return next;});pending.current=null;setUncertain(false);setEditor(null);setOutcome(null);setProtection(null);completionReview.current?.reset();onCloseForm();refresh();onNotice(c.kind==='save'?'Request draft saved':'Request updated',c.kind==='save'?'No queue ticket, resource hold or allowance charge was created.':'The server confirmed the request action.');}catch(e){const c=pending.current;const message=e instanceof ApiError?(linearQueueRecovery(e.code,e.message)||e.message):(e instanceof Error?e.message:'Request action failed.');const unknown=!(e instanceof ApiError)||e.status>=500;if(c?.kind==='command'&&c.action==='call'&&c.id)setActionErrors(current=>({...current,[c.id]:{message,commandKey:c.key,unknown}}));else setError(message);setUncertain(unknown);if(!unknown){pending.current=null;void active.refetch();}}finally{setBusy(false);}}
 completionExecute.current=command=>send(command);
 async function confirmCompletion(){try{await completionReview.current?.confirm();}catch(e){setError(e instanceof Error?e.message:'Refresh this request.');}}
 async function open(plan?:QueueSelectionPlanV3){if(busy||uncertain)return;setBusy(true);setError('');try{const current=plan?(await readQueueSelection(token,tenant,location,plan.id)).plan:undefined;if(current&&((current.contractVersion!==3&&current.contractVersion!==4)||!(current.state==='draft'?current.allowedActions.includes('edit'):current.allowedActions.includes('amend'))))throw Error('This request cannot be edited. Refresh its current state.');setEditor({plan:current,initial:namedQueueForm(current),mode:current&&current.state!=='draft'?'amend':'draft'});}catch(e){setError(e instanceof Error?e.message:'Request could not be loaded.');}finally{setBusy(false);}}
 async function save(draft:NamedQueueFormDraft){if(!editor)return;await send({kind:'save',id:editor.plan?.id||null,body:{customer:{name:draft.customerName,email:draft.customerEmail,phone:draft.customerPhone},notes:draft.notes,catalogRevision:draft.catalogRevision,...(!editor.plan||editor.plan.contractVersion===4?{contractVersion:4 as const,serviceSelections:selectionInputV4(draft.selections)}:{serviceSelections:namedSelectionInput(draft.selections)}),...(editor.plan?{expectedPlanRevision:editor.plan.planRevision}:{})},key:crypto.randomUUID()});}
 async function publish(draft:NamedQueueFormDraft){if(!editor?.plan||editor.plan.state!=='draft')return;if(JSON.stringify(draft)!==JSON.stringify(editor.initial)){setError('Save the reviewed request first, then reopen it to publish.');return;}const currentOptions=editor.plan.contractVersion===4?v4Options.data:options.data;if(!currentOptions||draft.catalogRevision!==currentOptions.catalogRevision){setError('Review and save the current resource and extra policies before publication.');return;}await send({kind:'command',id:editor.plan.id,action:'publish',body:{expectedPlanRevision:editor.plan.planRevision,expectedCatalogRevision:currentOptions.catalogRevision},key:crypto.randomUUID()});}
 async function amend(draft:NamedQueueFormDraft,reason:string,agreement:boolean){if(!editor?.plan||editor.plan.state==='draft')return;const isV4=editor.plan.contractVersion===4;const currentOptions=isV4?v4Options.data:options.data;if(!currentOptions||draft.catalogRevision!==currentOptions.catalogRevision){setError('Review the current resource and extra policies first.');return;}await send({kind:'command',id:editor.plan.id,action:'amend',body:{...revisions(editor.plan),...(isV4?{contractVersion:4 as const}:{ }),serviceSelections:isV4?selectionInputV4(draft.selections):namedSelectionInput(draft.selections),expectedCatalogRevision:currentOptions.catalogRevision,reason,...(agreement?{customerAgreement:{confirmed:true}}:{})},key:crypto.randomUUID()});}
 function planAction(plan:QueuePublishedSelectionPlanV3,action:'amend'|'call'|'start'|'complete'|'cancelProtection'){if(action==='cancelProtection'){setProtectionReason('');setError('');setProtection(plan);return;}if(action==='amend'){void open(plan);return;}try{let extra:object={counterSlug};if(action==='start'){const groups=plan.reservationGroups.filter(group=>group.state==='protected'&&group.planRevision===plan.planRevision&&group.stageAttemptId===plan.currentStage.attemptId);if(groups.length!==1)throw Error('Refresh this request to review its recorded protection.');extra={reservationGroupId:groups[0].id};}if(action==='complete'){setError('');completionReview.current?.open({plan,label:plan.ticketNumber});return;}void send({kind:'command',id:plan.id,action,body:{...revisions(plan),...extra},key:crypto.randomUUID()});}catch(e){setError(e instanceof Error?e.message:'Refresh this request.');}}
 function childAction(plan:QueuePublishedSelectionPlanV3,target:NamedChildTarget,action:'complete'|'interrupt'|'retry'){if(!target.child.allowedActions.includes(action))return;if(action==='interrupt'){void openInterruption(plan,target);return;}if(action==='retry'){setReason('');setConfirmed(false);setOutcome({plan,target,action});return;}try{setError('');completionReview.current?.open({plan,child:target.child,label:target.label});}catch(e){setError(e instanceof Error?e.message:'Refresh this request.');}}
 async function openInterruption(plan:QueuePublishedSelectionPlanV3,target:NamedChildTarget){if(busy||uncertain||commandLocked)return;setBusy(true);setError('');try{const current=(await readQueueSelection(token,tenant,location,plan.id)).plan;if(current.state==='draft')throw Error('Refresh this request before interruption.');const review=buildInterruptionReview(current,target.child.childAttemptId);setReason('');setConfirmed(false);setOutcome({plan:current,target:{child:review.primary.child,label:review.primary.name,courtId:review.primary.courtId,isCourt:review.primary.kind==='resource'},action:'interrupt',review});}catch(e){setError(e instanceof Error?e.message:'The active resources could not be reviewed.');}finally{setBusy(false);}}
 async function cancelProtection(){if(!protection||!protectionReason.trim()||protectionReason.trim().length>500)return;const groups=protection.reservationGroups.filter(group=>group.state==='protected'&&group.planRevision===protection.planRevision&&group.stageAttemptId===protection.currentStage.attemptId);if(groups.length!==1){setError('Refresh this request to review its exact recorded protection.');return;}await send({kind:'command',id:protection.id,action:'cancelProtection',body:{...revisions(protection),reservationGroupId:groups[0].id,reason:protectionReason.trim()},key:crypto.randomUUID()});}
 const court=outcome?.plan.serviceSelections.flatMap(service=>service.resources).find(resource=>resource.resourceSelectionId===outcome.target.courtId);
 const dependentExtras=outcome?.target.isCourt?(court?.extras||[]).flatMap(extra=>namedExtraExecutions(extra).map(member=>({...member,durationMinutes:extra.durationMinutes}))).filter(member=>member.execution?.state===(outcome.action==='retry'?'interrupted':'in_service')):[];
 async function confirmOutcome(){if(!outcome||!confirmed||busy||uncertain||commandLocked)return;const {plan,target,action}=outcome;
 if(action==='interrupt'){if(!reason.trim()||!outcome.review)return;setBusy(true);try{const latest=(await readQueueSelection(token,tenant,location,plan.id)).plan;if(latest.state==='draft')throw Error('Refresh this request before interruption.');const body=confirmedInterruption(outcome.review,latest,reason);await send({kind:'command',id:plan.id,action,body,key:crypto.randomUUID()});}catch(e){setError(e instanceof Error?e.message:'The active resources could not be verified.');}finally{setBusy(false);}return;}
 await send({kind:'command',id:plan.id,action,body:{...revisions(plan),childAttemptId:target.child.childAttemptId,expectedChildRevision:target.child.revision,interruptedExtras:dependentExtras.flatMap(extra=>extra.execution?[{childAttemptId:extra.execution.childAttemptId,expectedChildRevision:extra.execution.revision}]:[])},key:crypto.randomUUID()});}

 return <section className="queue-stack" aria-label="Service requests">
 <RequestCallErrorToasts rejections={actionErrors} scope={JSON.stringify([tenant,location])}/>
 <OperationQueryState loading={queryLoading} error={queryError} onRetry={()=>{void v4Options.refetch();void options.refetch();if(!staffMode){void resourceConfiguration.refetch();void resourceMembers.refetch();}void drafts.refetch();void active.refetch();}}/>
 {error&&!editor&&!completion?<p role="alert">{error}</p>:null}{uncertain&&!editor&&!outcome&&!completion?<div role="alert"><p>The response was lost. This action may already be applied. Retry the same command to reconcile it before continuing.</p><OperationButton disabled={busy} onClick={()=>void send()}>Retry same command</OperationButton></div>:null}
 <SavedRequestDrafts drafts={(drafts.data?.pages.flatMap(page=>page.plans)||[]).filter((plan):plan is QueueSelectionDraftV3=>plan.state==='draft')} token={token} tenant={tenant} location={location} busy={busy||uncertain||commandLocked||Boolean(editor)||drafts.isError||drafts.isFetching} onEdit={plan=>{if(plan.contractVersion!==2)void open(plan);}} onBusy={onBusy} onNotice={onNotice} hasUnsavedEdits={hasUnsavedEdits}>{draftActions=>( <NamedQueueOperations timeZone={v4Options.data?.serviceHoursWindow.timezone} drafts={(drafts.data?.pages.flatMap(page=>page.plans)||[]).filter((plan):plan is QueueSelectionDraftV3=>plan.state==='draft')} draftActions={draftActions} draftServiceNames={Object.fromEntries((v4Options.data?.services||options.data?.services||[]).map(service=>[service.id,service.name]))} headerActions={<OperationButton variant="outline" disabled={busy||uncertain} onClick={refresh}><IconRefresh aria-hidden="true" data-icon="inline-start" />Refresh requests</OperationButton>} receivedAt={active.data?.pages[0]?.clientReceivedAt} receivedAtById={Object.fromEntries((active.data?.pages||[]).flatMap(page=>page.plans.map(plan=>[plan.id,page.clientReceivedAt])))} readFailed={active.isError} plans={plans} busy={busy||uncertain||commandLocked||active.isError||active.isFetching} onPlanAction={planAction} onChildAction={childAction}/>)}</SavedRequestDrafts>
 {drafts.hasNextPage?<OperationButton onClick={()=>void drafts.fetchNextPage()}>Load more request drafts</OperationButton>:null}
{active.hasNextPage?<OperationButton onClick={()=>void active.fetchNextPage()}>Load more active service requests</OperationButton>:null}
 {last&&!plans.some(plan=>plan.id===last.id)?<><h3 className="ops-heading">Last confirmed service request</h3><NamedQueueOperations timeZone={v4Options.data?.serviceHoursWindow.timezone} readFailed={active.isError} plans={[last]} busy={busy||uncertain||commandLocked||active.isError||active.isFetching} onPlanAction={planAction} onChildAction={childAction}/></>:null}
 {editor&&options.data&&v4Options.data?<ConfigurationScope onEdit={onEditForm}><NamedQueuePlanDialog key={`${editor.plan?.id||'new'}:${editor.plan?.planRevision||''}`} ticketNumber={editor.plan?.state!=='draft'?editor.plan?.ticketNumber:undefined} availabilityScope={{token,tenant,location,...(editor.plan?.state!=="draft"&&editor.plan?.id?{draftId:editor.plan.draftId||editor.plan.id}: {})}} initial={editor.initial} mode={editor.mode} options={choices} resourceCatalog={resourceCatalog} onReviewQueueSetup={onReviewQueueSetup} managementActions={!staffMode&&onReviewQueueSetup?(poolId,visible)=><LocalResourceActivation key={`${token}:${tenant}:${location}:${poolId}`} configuration={resourceConfiguration.isError?undefined:resourceConfiguration.data} visible={visible} poolId={poolId} token={token} tenant={tenant} location={location} disabled={busy||uncertain||resourceConfiguration.isFetching} onBusy={value=>{setBusy(value);onBusy(value);}} onRefresh={()=>{void resourceConfiguration.refetch();void v4Options.refetch();}} onChanged={result=>{client.setQueryData(['vendor-resource-configuration',token,tenant,location],result);void v4Options.refetch();window.dispatchEvent(new Event('queue-plans-updated'));}}/>:undefined} hoursRequestStartedAt={v4Options.data.clientRequestStartedAt} hoursReadFailed={v4Options.isError} v4Options={!editor.plan||editor.plan.contractVersion===4?v4Options.data:undefined} catalogRevision={!editor.plan||editor.plan.contractVersion===4?v4Options.data.catalogRevision:options.data.catalogRevision} busy={busy} uncertain={uncertain} error={error} publishAvailable={Boolean(editor.plan?.state==='draft'&&editor.plan.allowedActions.includes('publish'))} onClose={()=>{setEditor(null);setError('');onCloseForm();void drafts.refetch();}} onSave={save} onPublish={publish} onAmend={amend} onRetry={()=>send()} onRefreshPolicies={()=>{void v4Options.refetch();}}/></ConfigurationScope>:null}
 {completion?<TaskDialog opened busy={busy||uncertain||commandLocked} initialFocus={completionCancel} title={completion.child?`Complete ${completion.label}?`:`Complete service request ${completion.plan.ticketNumber}?`} description={completion.child?'This records the selected resource or extra as complete and closes its recorded active allocation, including any resources released by this completion.':'This records the active resources and extras in this service request as complete and closes their active allocation. The service request finishes when its required work is complete.'} onClose={()=>completionReview.current?.dismiss()} footer={<><Button ref={completionCancel} variant="outline" disabled={busy||uncertain||commandLocked} onClick={()=>completionReview.current?.dismiss()}>Cancel</Button>{uncertain?<OperationButton disabled={busy||commandLocked} onClick={()=>void send()}>Retry same command</OperationButton>:<Button variant="outline" className="request-complete-confirm" disabled={busy||commandLocked} aria-busy={busy} onClick={()=>void confirmCompletion()}>{busy?'Completing…':'Complete'}</Button>}</>}><div className="queue-stack"><p>Request {completion.plan.ticketNumber} · {completion.plan.customer.name||'Customer'}</p>{completion.child?<p>{completion.label}</p>:null}{error?<p role="alert">{error}</p>:null}{uncertain?<p role="alert">The response was lost. Completion may already be applied. Retry the same command to confirm the outcome.</p>:null}</div></TaskDialog>:null}
 {protection?<TaskDialog opened busy={busy||uncertain||commandLocked} title={`Cancel protection for ${protection.ticketNumber}?`} description="Cancel the recorded unstarted protection and return the request to Waiting. Started allocations cannot be released by this action." onClose={()=>{if(!busy&&!uncertain)setProtection(null);}} footer={uncertain?<OperationButton disabled={busy} onClick={()=>void send()}>Retry same command</OperationButton>:<OperationButton disabled={busy||!protectionReason.trim()||protectionReason.trim().length>500} onClick={()=>void cancelProtection()}>Cancel recorded protection</OperationButton>}><div className="queue-stack">{error?<p role="alert">{error}</p>:null}<ConfigurationTextarea label="Reason for cancelling protection" value={protectionReason} maxLength={500} disabled={busy||uncertain} onChange={event=>setProtectionReason(event.currentTarget.value)}/></div></TaskDialog>:null}
 {outcome?<TaskDialog opened eyebrow="RESOURCE ACTION" busy={busy||uncertain||commandLocked} title={`${outcome.action==='retry'?'Retry':'Interrupt'} ${outcome.target.label}`} description={outcome.action==='retry'?'Retry atomically reserves and starts only this interrupted resource and its interrupted extras under the configured policy. Completed children remain completed.':'This releases only the primary selection and unfinished dependent extras listed below. Other active resources stay running.'} onClose={()=>setOutcome(null)} footer={uncertain?<OperationButton disabled={busy} onClick={()=>void send()}>Retry same command</OperationButton>:<OperationButton disabled={busy||!confirmed||(outcome.action==='interrupt'&&!reason.trim())} onClick={()=>void confirmOutcome()}>{outcome.action==='retry'?'Reserve and retry selected resource':'Interrupt selected resources'}</OperationButton>}><div className="queue-stack">{error?<p role="alert">{error}</p>:null}{outcome.action==='interrupt'&&outcome.review?<><h3>Will be released</h3><ul aria-label="Resources to be released">{outcome.review.affected.map((item,index)=><li key={item.child.childAttemptId}><strong>{item.name}</strong> · {index===0?(item.kind==='resource'?'Primary resource':'Selected extra'):'Unfinished dependent extra'} · {item.units} unit(s){item.plannedMinutes?` · ${item.plannedMinutes} minutes`:''}</li>)}</ul>{outcome.review.affected.length===1?<p>No unfinished dependent extras will be released.</p>:null}{outcome.review.otherActive.length?<><h3>Other active resources stay running</h3><ul aria-label="Resources unaffected by interruption">{outcome.review.otherActive.map(item=><li key={item.child.childAttemptId}>{item.name} · {item.units} unit(s){item.plannedMinutes?` · ${item.plannedMinutes} minutes`:''}</li>)}</ul></>:null}</>:<><p>{outcome.target.label}</p><ul>{dependentExtras.map(extra=><li key={extra.id}>{extra.name} · {extra.durationMinutes} minutes</li>)}</ul></>}{outcome.action==='interrupt'?<ConfigurationTextarea label="Reason for resource interruption" value={reason} disabled={busy||uncertain} onChange={event=>setReason(event.currentTarget.value)}/>:null}<ConfigurationCheck label="I confirm this resource or extra and the listed dependent extras" checked={confirmed} disabled={busy||uncertain} onChange={event=>setConfirmed(event.currentTarget.checked)}/></div></TaskDialog>:null}
 </section>;
}
