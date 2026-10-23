import type { QueueServiceSelectionInputV3 } from "../../../shared/queueSelectionPlanV3";
/** Local editing hierarchy only; not a transport DTO or executable resource plan. */
export interface QueueExtraSelectionDraft {
 extraSelectionId:string;
 resourceMemberIds?:string[];
 quantity:string;
 serviceId:string;
 durationMinutes:string;
 durationCount?:string;
 durationPolicyRevision?:string;
 durationBaseMinutes?:number;
 resourceQuantity?:string;
}
export interface QueueCourtSelectionDraft {
 courtSelectionId:string;
 resourceMemberId:string|null;
 durationMinutes:string;
 durationCount?:string;
 durationPolicyRevision?:string;
 durationBaseMinutes?:number;
 resourceQuantity?:string;
 extras:QueueExtraSelectionDraft[];
}
export interface NamedQueueServiceDraft {
 serviceSelectionId:string;
 serviceId:string;
 /** A direct resource-pool item, rather than a child extra of another resource. */
 directResource?:boolean;
 courts:QueueCourtSelectionDraft[];
}
export function updateCourtSelection(selections:NamedQueueServiceDraft[],serviceSelectionId:string,courtSelectionId:string,change:Partial<Pick<QueueCourtSelectionDraft,'durationMinutes'|'resourceMemberId'>>):NamedQueueServiceDraft[] {
 return selections.map(service=>service.serviceSelectionId===serviceSelectionId?{...service,courts:service.courts.map(court=>court.courtSelectionId===courtSelectionId?{...court,...change}:court)}:service);
}
export function updateExtraSelection(selections:NamedQueueServiceDraft[],serviceSelectionId:string,courtSelectionId:string,extraSelectionId:string,change:Partial<Pick<QueueExtraSelectionDraft,'durationMinutes'|'serviceId'|'quantity'>>):NamedQueueServiceDraft[] {
 return selections.map(service=>service.serviceSelectionId===serviceSelectionId?{...service,courts:service.courts.map(court=>court.courtSelectionId===courtSelectionId?{...court,extras:court.extras.map(extra=>extra.extraSelectionId===extraSelectionId?{...extra,...change}:extra)}:court)}:service);
}
/** Reordering never counts as removal; parent scope prevents reparenting from hiding one. */
export function removedNamedSelections(before:NamedQueueServiceDraft[],after:NamedQueueServiceDraft[]):string[] {
 const removed:string[]=[];
 for(const service of before){
  const nextService=after.find(next=>next.serviceSelectionId===service.serviceSelectionId && next.serviceId===service.serviceId);
  if(!nextService){removed.push(service.serviceSelectionId);continue;}
  for(const court of service.courts){
   const nextCourt=nextService.courts.find(next=>next.courtSelectionId===court.courtSelectionId && next.resourceMemberId===court.resourceMemberId);
   if(!nextCourt){removed.push(court.courtSelectionId);continue;}
   for(const extra of court.extras){if(!nextCourt.extras.some(next=>next.extraSelectionId===extra.extraSelectionId && next.serviceId===extra.serviceId && (extra.resourceMemberIds||[]).every(id=>(next.resourceMemberIds||[]).includes(id))))removed.push(extra.extraSelectionId);}
  }
 }
 return removed;
}

/** Approved schedule relation only. Catalog duration bounds/steps remain server policy. */
export function namedSelectionScheduleIssues(selections:NamedQueueServiceDraft[]):Array<{courtSelectionId:string;extraSelectionId:string;message:string}> {
 const issues:Array<{courtSelectionId:string;extraSelectionId:string;message:string}>=[];
 for(const service of selections)for(const court of service.courts){
  const parent=Number(court.durationMinutes);
  if(!court.durationMinutes.trim()||!Number.isFinite(parent))continue;
  for(const extra of court.extras){const duration=Number(extra.durationMinutes);if(extra.durationMinutes.trim()&&Number.isFinite(duration)&&duration>parent)issues.push({courtSelectionId:court.courtSelectionId,extraSelectionId:extra.extraSelectionId,message:'An extra starts with its parent resource and cannot outlast its configured duration.'});}
 }
 return issues;
}

/** Canonical proposed v3 input adapter; does not publish or add authoritative demand. */
export function namedSelectionInput(selections:NamedQueueServiceDraft[]):QueueServiceSelectionInputV3[] {
 const number=(value:string|undefined)=>value?.trim() ? Number(value):null;
 const duration=(durationMinutes:string,durationCount?:string,durationBaseMinutes?:number)=>{
  const explicit=number(durationMinutes);
  if(explicit!=null)return explicit;
  const count=number(durationCount);
  return count!=null&&durationBaseMinutes!=null ? count*durationBaseMinutes : null;
 };
 return selections.map(service=>({serviceSelectionId:service.serviceSelectionId,serviceId:service.serviceId||null,resources:service.courts.map(court=>({resourceSelectionId:court.courtSelectionId,resourceMemberId:court.resourceMemberId||null,quantity:number(court.resourceQuantity)??1,durationMinutes:duration(court.durationMinutes,court.durationCount,court.durationBaseMinutes),extras:court.extras.filter(extra=>{const quantity=number(extra.quantity)??1;const durationMinutes=duration(extra.durationMinutes,extra.durationCount,extra.durationBaseMinutes);return Boolean(extra.serviceId)&&durationMinutes!=null&&Number.isInteger(quantity)&&quantity>0&&Number.isInteger(durationMinutes)&&durationMinutes>0;}).map(extra=>({extraSelectionId:extra.extraSelectionId,serviceId:extra.serviceId||null,quantity:number(extra.quantity)??1,durationMinutes:duration(extra.durationMinutes,extra.durationCount,extra.durationBaseMinutes)!}))}))}));
}
export function namedSelectionReduction(before:NamedQueueServiceDraft[],after:NamedQueueServiceDraft[]):boolean {
 if(removedNamedSelections(before,after).length)return true;
 return before.some(service=>service.courts.some(court=>{
  const next=after.find(item=>item.serviceSelectionId===service.serviceSelectionId)?.courts.find(item=>item.courtSelectionId===court.courtSelectionId);
  if(!next)return false;
  return Number(next.durationCount)<Number(court.durationCount)||Number(next.resourceQuantity)<Number(court.resourceQuantity)||Number(next.durationMinutes)<Number(court.durationMinutes)||court.extras.some(extra=>{const changed=next.extras.find(item=>item.extraSelectionId===extra.extraSelectionId);return Boolean(changed&&(Number(changed.durationCount)<Number(extra.durationCount)||Number(changed.durationMinutes)<Number(extra.durationMinutes)||Number(changed.quantity)<Number(extra.quantity)));});
 }));
}
