import { serviceHoursRecovery } from "./linearQueueErrors";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { executeQueueWrite, useQueueCommandLocked, type QueueWrite } from './queueCommandOwner';
import { clearConfirmedDraftSelection } from './queueReviewRoute';
import { savedDraftWrite, confirmedDeletedDraft, type SavedQueueDraft } from './savedDraftCommands';
import { SavedRequestDraftCard, DraftDeleteConfirmation } from './SavedRequestDraftCard';
import { EntityGrid } from './EntityCards';
import { OperationButton } from './OperationsUi';
export type SavedDraftTableActions={busy:boolean;onEdit:(draft:SavedQueueDraft)=>void;onPublish:(draft:SavedQueueDraft)=>void;onDelete:(draft:SavedQueueDraft)=>void};
type Pending={id:string;name:string;action:'publish'|'delete';write:QueueWrite};
export function SavedRequestDrafts({drafts,token,tenant,location,busy,onEdit,onBusy,onNotice,hasUnsavedEdits,children}:{drafts:SavedQueueDraft[];token:string;tenant:string;location:string;busy:boolean;onEdit:(draft:SavedQueueDraft)=>void;onBusy:(busy:boolean)=>void;onNotice?:(title:string,message:string)=>void;hasUnsavedEdits?:()=>boolean;children?:(actions:SavedDraftTableActions)=>ReactNode}){
 const client=useQueryClient(),locked=useQueueCommandLocked();const [,setParams]=useSearchParams();
 const [deleting,setDeleting]=useState<SavedQueueDraft|null>(null),[working,setWorking]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const pending=useRef<Pending|null>(null),inFlight=useRef(false),focusTarget=useRef<HTMLElement|null>(null),busyCallback=useRef(onBusy);busyCallback.current=onBusy;
 useEffect(()=>{busyCallback.current(working||uncertain);},[working,uncertain]);
 useEffect(()=>()=>busyCallback.current(false),[]);
 function refresh(){for(const key of ['queue-drafts-v2','named-queue-drafts','named-queue-active','named-queue-review','published-queue-plans-v2','queue-counter-controls','local-pool-operations','vendor-dashboard-queue-lifecycle','named-queue-options','queue-options-v4'])void client.invalidateQueries({queryKey:[key,token,tenant,location]});window.dispatchEvent(new Event('queue-plans-updated'));}
 function deleted(id:string){setError('');setParams(previous=>new URLSearchParams(clearConfirmedDraftSelection(previous.toString(),id,location)),{replace:true});setDeleting(null);pending.current=null;setUncertain(false);refresh();onNotice?.('Draft deleted','The unpublished request draft was removed.');queueMicrotask(()=>focusTarget.current?.focus());}
 function confirmed(result:unknown,command:Pending){
  if(command.action==='delete'){if(!confirmedDeletedDraft(result,command.id))throw Error('Unexpected delete response. Retry the same command to reconcile it.');deleted(command.id);return;}
  if(!result||typeof result!=='object'||!('plan' in result)||!result.plan||typeof result.plan!=='object'||!('id' in result.plan)||result.plan.id!==command.id||!('state' in result.plan)||result.plan.state==='draft'||!('ticketNumber' in result.plan)||typeof result.plan.ticketNumber!=='string')throw Error('Unexpected publication response. Retry the same command to reconcile it.');
  const ticketNumber=result.plan.ticketNumber;pending.current=null;setUncertain(false);refresh();onNotice?.('Request published',`Ticket ${ticketNumber} was confirmed by the server.`);
 }
 function rejected(error:unknown,command:Pending){const unknown=!(error instanceof ApiError)||error.status>=500;setError(error instanceof ApiError ? serviceHoursRecovery(error.code) || error.message : error instanceof Error ? error.message : 'Draft action failed.');setUncertain(unknown);if(!unknown){pending.current=null;if(error.status===410&&error.code==='DRAFT_DELETED'){deleted(command.id);return;}setDeleting(null);refresh();}}
 useEffect(()=>{const confirmedElsewhere=(event:Event)=>{const {key,result}=(event as CustomEvent<{key:string;result:unknown}>).detail;const command=pending.current;if(!command||command.write.key!==key)return;try{confirmed(result,command);setError('');}catch(error){rejected(error,command);}};const rejectedElsewhere=(event:Event)=>{const {key,error}=(event as CustomEvent<{key:string;error:unknown}>).detail;const command=pending.current;if(command?.write.key===key)rejected(error,command);};window.addEventListener('queue-command-confirmed',confirmedElsewhere);window.addEventListener('queue-command-rejected',rejectedElsewhere);return()=>{window.removeEventListener('queue-command-confirmed',confirmedElsewhere);window.removeEventListener('queue-command-rejected',rejectedElsewhere);};});
 async function send(draft?:SavedQueueDraft,action?:'publish'|'delete'){
  if(inFlight.current)return;
  if(!pending.current){if(!draft||!action)return;if(busy||locked||hasUnsavedEdits?.()){setError('Save or close your open edits before changing a saved draft.');return;}try{pending.current={id:draft.id,name:draft.customer.name||'Unnamed request',action,write:savedDraftWrite(draft,action,{token,tenant,location},crypto.randomUUID())};}catch(error){setError(error instanceof Error?error.message:'Refresh this draft.');return;}}
  const command=pending.current;inFlight.current=true;setWorking(true);setError('');try{const result=await executeQueueWrite(command.write);confirmed(result,command);}catch(error){rejected(error,command);}finally{inFlight.current=false;setWorking(false);}
 }
 function requestDelete(draft:SavedQueueDraft){if(busy||locked||working||uncertain||hasUnsavedEdits?.()){setError('Save or close your open edits before deleting a saved draft.');return;}setError('');setDeleting(draft);}
 return <section className="queue-stack" aria-label={children?"Service request actions":"Saved request draft actions"} tabIndex={-1} ref={focusTarget}>{error&&!deleting?<p role="alert">{error}</p>:null}{uncertain&&!deleting?<div role="alert"><p>The result is unknown. Retry the same draft command before continuing.</p><OperationButton disabled={working} onClick={()=>void send()}>Retry same draft command</OperationButton></div>:null}
 {children?children({busy:busy||locked||working||uncertain,onEdit,onPublish:draft=>void send(draft,'publish'),onDelete:requestDelete}):<EntityGrid label="Saved service request drafts">{drafts.filter(draft=>draft.state==='draft').map(draft=><SavedRequestDraftCard key={draft.id} state="draft" name={draft.customer.name||'Unnamed request'} revision={draft.planRevision} serviceCount={draft.contractVersion===2?draft.lines.length:draft.serviceSelections.length} readiness={draft.publishReadiness?{ready:draft.publishReadiness.ready,reasons:draft.publishReadiness.blockReasons.map(reason=>serviceHoursRecovery(reason.code) || reason.message)}:undefined} canEdit={draft.allowedActions.includes('edit')} canPublish={draft.allowedActions.includes('publish')} canDelete={draft.allowedActions.includes('delete')} busy={busy||locked||working||uncertain} onEdit={()=>onEdit(draft)} onPublish={()=>void send(draft,'publish')} onDelete={()=>requestDelete(draft)}/>)}</EntityGrid>}
 {deleting?<DraftDeleteConfirmation name={deleting.customer.name||'Unnamed request'} busy={working} uncertain={uncertain} error={error} onCancel={()=>{if(!working&&!uncertain){setDeleting(null);setError('');}}} onConfirm={()=>void send(deleting,'delete')}/>:null}
 </section>;
}
