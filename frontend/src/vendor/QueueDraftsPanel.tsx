import { SavedRequestDrafts } from './SavedRequestDrafts';
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { QueueDraftInputV2, QueueDraftV2 } from "../../../shared/queuePlanV2";
import { listQueueDrafts, readQueueDraft, saveQueueDraft, commandQueuePlan } from "../api/queuePlansV2";
import { ApiError } from "../api/client";
import { QueuePlanDialog, type QueuePlanDraft } from "./QueuePlanDialog";
import type { QueueServiceChoice } from "./QueueServiceLines";
import { ConfigurationScope } from "./ConfigurationUi";
import { OperationButton, OperationQueryState } from "./OperationsUi";

export function queueDraftInput(draft:QueuePlanDraft):QueueDraftInputV2 {
  return {catalogRevision:draft.catalogRevision,customer:{name:draft.customerName,email:draft.customerEmail,phone:draft.customerPhone},notes:draft.notes,
    lines:draft.lines.map(line=>({lineId:line.lineId,serviceId:line.serviceId || null,quantity:line.units ? Number(line.units) : null,durationMinutes:line.durationMinutes ? Number(line.durationMinutes) : null}))};
}
function formDraft(plan?:QueueDraftV2):QueuePlanDraft {
  return {catalogRevision:plan?.catalogRevision || null,customerName:plan?.customer.name || "",customerEmail:plan?.customer.email || "",customerPhone:plan?.customer.phone || "",notes:plan?.notes || "",lines:plan?.lines.map(line=>({lineId:line.lineId,serviceId:line.serviceId || "",units:line.quantity == null ? "" : String(line.quantity),durationMinutes:line.durationMinutes == null ? "" : String(line.durationMinutes)})) || []};
}
export function QueueDraftsPanel({token,tenant,location,options,catalogRevision,onSaved,onEditForm,onCloseForm,onBusy,allowNew=true,hasUnsavedEdits}: {token:string;tenant:string;location:string;options:QueueServiceChoice[];catalogRevision?:string;onSaved:()=>void;onEditForm:(form:HTMLFormElement)=>void;onCloseForm:()=>void;onBusy:(busy:boolean)=>void;allowNew?:boolean;hasUnsavedEdits?:()=>boolean}) {
  const client=useQueryClient();
  const query=useInfiniteQuery({queryKey:["queue-drafts-v2",token,tenant,location],initialPageParam:undefined as string|undefined,queryFn:({signal,pageParam})=>listQueueDrafts(token,tenant,location,signal,pageParam),getNextPageParam:page=>page.nextCursor || undefined,retry:false});
  const [editor,setEditor]=useState<{plan?:QueueDraftV2;form:QueuePlanDraft}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false);
  const busyCallback=useRef(onBusy);busyCallback.current=onBusy;
  useEffect(()=>{busyCallback.current(busy || uncertain);},[busy,uncertain]);
  useEffect(()=>()=>busyCallback.current(false),[]);
  useEffect(()=>{if(!uncertain)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[uncertain]);
  const pending=useRef<{id:string|null;body:QueueDraftInputV2 & {expectedPlanRevision?:string};key:string}|null>(null);
  async function open(plan?:QueueDraftV2){setError("");setBusy(true);try{const current=plan ? (await readQueueDraft(token,tenant,location,plan.id)).plan : undefined;
    if(current && (current.contractVersion!==2 || current.state!=="draft" || !current.allowedActions.includes("edit")))throw Error("This plan is no longer an editable draft.");
    pending.current=null;setUncertain(false);setEditor({plan:current,form:formDraft(current)});
  }catch(e){setError(e instanceof Error?e.message:"Draft could not be loaded.");}finally{setBusy(false);}}
  const publication=useRef<{id:string;body:{expectedPlanRevision:string;expectedCatalogRevision:string};key:string}|null>(null);
  async function publish(draft:QueuePlanDraft){if(!editor?.plan || busy)return;
    if(!publication.current){if(JSON.stringify(draft)!==JSON.stringify(editor.form)){setError("Save the reviewed draft first, then reopen it to publish.");return;}if(!catalogRevision || draft.catalogRevision!==catalogRevision){setError("Review and save the current catalog before publishing.");return;}publication.current={id:editor.plan.id,body:{expectedPlanRevision:editor.plan.planRevision,expectedCatalogRevision:catalogRevision},key:crypto.randomUUID()};}
    setBusy(true);setError("");try{const c=publication.current;await commandQueuePlan(token,tenant,location,c.id,"publish",c.body,c.key);publication.current=null;setUncertain(false);setEditor(null);onCloseForm();void client.invalidateQueries();void query.refetch();window.dispatchEvent(new Event("queue-plans-updated"));}catch(e){setError(e instanceof Error?e.message:"Publication failed.");const unknown=!(e instanceof ApiError)||e.status>=500;setUncertain(unknown);if(!unknown)publication.current=null;}finally{setBusy(false);}
  }
  async function save(draft:QueuePlanDraft){if(publication.current){await publish(draft);return;}if(!editor || busy)return;setBusy(true);setError("");
    if(!pending.current){const body={...queueDraftInput(draft),...(editor.plan ? {expectedPlanRevision:editor.plan.planRevision} : {})};if(!catalogRevision && !draft.catalogRevision)delete body.catalogRevision;pending.current={id:editor.plan?.id || null,body,key:crypto.randomUUID()};}
    try{const command=pending.current;const {plan}=await saveQueueDraft(token,tenant,location,command.id,command.body,command.key);
      if(plan.contractVersion!==2 || plan.state!=="draft")throw Error("Unexpected draft response; reconcile before continuing.");
      pending.current=null;setUncertain(false);setEditor(null);onCloseForm();void query.refetch();onSaved();
    }catch(e){setError(e instanceof Error?e.message:"Draft save failed.");
      const unknown=!(e instanceof ApiError) || e.status>=500;setUncertain(unknown);if(!unknown)pending.current=null;
    }finally{setBusy(false);}}
  return <section className="queue-stack" aria-label="Queue drafts">
    <div className="ops-list-heading"><div><h2 className="ops-heading">{allowNew?"Queue drafts":"Earlier flat drafts"}</h2><p className="ops-muted">Saved requests have no ticket number, queue position or resource hold.</p></div>{allowNew?<OperationButton disabled={busy || !query.data} onClick={()=>void open()}>New draft</OperationButton>:null}</div>
    <OperationQueryState loading={query.isPending} error={query.error} onRetry={()=>void query.refetch()}/>
    {error && !editor ? <p role="alert">{error}</p> : null}
    {query.data ? <SavedRequestDrafts drafts={query.data.pages.flatMap(page=>page.plans)} token={token} tenant={tenant} location={location} busy={busy||uncertain||Boolean(editor)||query.isError||query.isFetching} onEdit={plan=>{if(plan.contractVersion===2)void open(plan);}} onBusy={onBusy} hasUnsavedEdits={hasUnsavedEdits}/> : null}
    {query.hasNextPage ? <OperationButton variant="outline" disabled={query.isFetchingNextPage} onClick={()=>void query.fetchNextPage()}>Load more drafts</OperationButton> : null}
    {editor ? <ConfigurationScope onEdit={onEditForm}><QueuePlanDialog key={editor.plan?.id || "new"} initial={editor.form} options={options} catalogRevision={catalogRevision} mode="draft" publishAvailable={allowNew && Boolean(editor.plan?.allowedActions.includes("publish"))} busy={busy} error={error} uncertain={uncertain} onClose={()=>{onCloseForm();setEditor(null);setError("");void query.refetch();}} onSaveDraft={save} onPublish={publish} onAmend={async()=>{}}/></ConfigurationScope> : null}
  </section>;
}
