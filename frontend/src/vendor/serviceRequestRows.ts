import type { QueuePublishedSelectionPlanV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueuePublishedSelectionPlanV4 } from '../../../shared/queueSelectionPlanV4';
import type { SavedQueueDraft } from './savedDraftCommands';
export type RequestPlan = QueuePublishedSelectionPlanV3 | QueuePublishedSelectionPlanV4;
export type ServiceRequestRow<P extends RequestPlan = RequestPlan> =
  | {kind:'published'; key:string; plan:P; ordinal:number}
  | {kind:'draft'; key:string; draft:SavedQueueDraft; ordinal:number};
export function draftServiceLabels(draft:SavedQueueDraft,names:Readonly<Record<string,string>>) {
  const ids=draft.contractVersion===2 ? draft.lines.map(line=>line.serviceId) : draft.serviceSelections.map(service=>service.serviceId);
  return ids.map(id=>id&&names[id] || 'Service selection');
}
/** Drafts have no creation timestamp or queue position: retain server-loaded order after dated rows. */
export function serviceRequestRows<P extends RequestPlan>(plans:P[],drafts:SavedQueueDraft[],search:string,status:string,sort:string,names:Readonly<Record<string,string>>={}) {
  const published=[...new Map(plans.map(plan=>[plan.id,plan])).values()];
  const publishedIds=new Set(published.flatMap(plan=>[plan.id,plan.draftId]));
  const uniqueDrafts=[...new Map(drafts.filter(draft=>draft.state==='draft'&&!publishedIds.has(draft.id)&&!publishedIds.has(draft.draftId)).map(draft=>[draft.id,draft])).values()];
  const rows:ServiceRequestRow<P>[]=[...published.map((plan,ordinal)=>({kind:'published' as const,key:`published:${plan.id}`,plan,ordinal})),...uniqueDrafts.map((draft,index)=>({kind:'draft' as const,key:`draft:${draft.id}`,draft,ordinal:published.length+index}))];
  const name=(row:ServiceRequestRow<P>)=>row.kind==='draft'?row.draft.customer.name||'':row.plan.customer.name||'';
  const term=search.trim().toLowerCase();
  return rows.filter(row=>{
    const state=row.kind==='draft'?'draft':row.plan.state;
    const text=row.kind==='draft'?[row.draft.customer.name,'Draft',...draftServiceLabels(row.draft,names)]:[row.plan.ticketNumber,row.plan.customer.name,...row.plan.serviceSelections.map(service=>service.serviceName)];
    return (status==='all'||state===status)&&text.join(' ').toLowerCase().includes(term);
  }).sort((a,b)=>{
    if(sort==='customer')return name(a).localeCompare(name(b))||a.ordinal-b.ordinal;
    if(a.kind==='draft'||b.kind==='draft')return a.kind===b.kind?a.ordinal-b.ordinal:a.kind==='draft'?1:-1;
    if(sort==='ticket')return a.plan.ticketNumber.localeCompare(b.plan.ticketNumber)||a.ordinal-b.ordinal;
    const one=Date.parse(a.plan.publishedAt),two=Date.parse(b.plan.publishedAt);
    return Number.isFinite(one)&&Number.isFinite(two)?(sort==='newest'?two-one:one-two)||a.ordinal-b.ordinal:a.ordinal-b.ordinal;
  });
}

export function serviceRequestPage<T>(rows:T[],page:number) {
  const pages=Math.max(1,Math.ceil(rows.length/10)),currentPage=Math.min(Math.max(0,page),pages-1);
  return {pages,currentPage,visibleRows:rows.slice(currentPage*10,currentPage*10+10)};
}
