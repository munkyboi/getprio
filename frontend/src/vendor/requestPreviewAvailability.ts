import type { QueuePublishedSelectionPlanV4, QueueServiceSelectionInputV4, QueueNamedAvailabilityResponseV1 } from '../../../shared/queueSelectionPlanV4';
/** Preserve the whole frozen tree, including pooled demand and named extras. */
export function requestPreviewSelections(plan:QueuePublishedSelectionPlanV4):QueueServiceSelectionInputV4[]{
 return plan.serviceSelections.map(service=>({serviceSelectionId:service.serviceSelectionId,serviceId:service.serviceId,resources:service.resources.map(resource=>({resourceSelectionId:resource.resourceSelectionId,resourceMemberId:resource.resourceMemberId,quantity:resource.quantity,durationCount:resource.durationCount,durationPolicyRevision:resource.durationPolicyRevision,extras:resource.extras.map(extra=>({extraSelectionId:extra.extraSelectionId,serviceId:extra.serviceId,quantity:extra.quantity,durationCount:extra.durationCount,durationPolicyRevision:extra.durationPolicyRevision,...(extra.resourceMemberIds?{resourceMemberIds:extra.resourceMemberIds}:{})}))}))}));
}
/** A named row must match its own member: never spread a selection-wide conflict to sibling members. */
export function requestPreviewAvailability(response:QueueNamedAvailabilityResponseV1|undefined,serviceId:string,selectionId:string,memberId:string|null){
 const matches=response?.selections.filter(row=>row.selectionId===selectionId&&row.serviceId===serviceId);
 if(matches?.length!==1||!matches[0].configurationValid)return undefined;
 const selection=matches[0];
 if(!memberId)return selection.availability;
 const members=selection.resourceMembers.filter(member=>member.id===memberId);
 return members.length===1?members[0].availability:undefined;
}
export function previewAvailabilityPresentation(availability:ReturnType<typeof requestPreviewAvailability>,checking=false){
 if(!availability||availability.state==='unknown')return {label:checking?'Checking availability':'Availability not confirmed',variant:'secondary' as const};
 if(availability.state==='available')return {label:'Available',variant:'success' as const};
 const label=availability.reasonCode==='RESOURCE_OCCUPIED'?'In service on another request':availability.reasonCode==='RESOURCE_PROTECTED'||availability.reasonCode==='NAMED_PROTECTION_REQUIRES_REVIEW'?'Held for another request':availability.reasonCode==='RESOURCE_CAPACITY_UNAVAILABLE'?'Pool capacity is in use':'Resource unavailable';
 return {label,variant:availability.reasonCode==='RESOURCE_CAPACITY_UNAVAILABLE'?'destructive' as const:'warning' as const};
}
