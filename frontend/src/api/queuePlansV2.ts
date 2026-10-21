import { executeQueueWrite } from '../vendor/queueCommandOwner';
import type { QueueDraftInputV2, QueueDraftV2 } from "../../../shared/queuePlanV2";
import { apiRequest } from "./client";
export const queuePlanBase = (tenant: string, location: string, id?: string) => `/vendor/tenant/${encodeURIComponent(tenant)}/queue/plans${id ? `/${encodeURIComponent(id)}` : ""}?location=${encodeURIComponent(location)}`;
export async function listQueueDrafts(token: string, tenant: string, location: string, signal?: AbortSignal, cursor?: string) {
  const response=await apiRequest<{plans: QueueDraftV2[];nextCursor: string|null}>(`${queuePlanBase(tenant,location)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,{token,signal});
 return {...response,plans:response.plans.filter(plan=>plan.contractVersion===2)};
}
export function readQueueDraft(token: string, tenant: string, location: string, id: string) {
  return apiRequest<{plan: QueueDraftV2}>(queuePlanBase(tenant,location,id),{token});
}
export function saveQueueDraft(token: string, tenant: string, location: string, id: string|null, body: QueueDraftInputV2 & {expectedPlanRevision?: string}, key: string) {
  return executeQueueWrite<{plan: QueueDraftV2}>({path:queuePlanBase(tenant,location,id || undefined),method:id ? "PATCH" : "POST",token,body,key});
}

export async function listPublishedQueuePlans(token:string,tenant:string,location:string,signal?:AbortSignal,cursor?:string) {
 const response=await apiRequest<{plans:import('../../../shared/queuePlanV2').QueuePublishedPlanV2[];nextCursor:string|null}>(`${queuePlanBase(tenant,location)}&state=active${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,{token,signal});
 return {...response,plans:response.plans.filter(plan=>plan.contractVersion===2)};
}
export function commandQueuePlan(token:string,tenant:string,location:string,id:string,action:'publish'|'call'|'start'|'complete'|'interrupt'|'amend',body:object,key:string) {
 const url=`/vendor/tenant/${encodeURIComponent(tenant)}/queue/plans/${encodeURIComponent(id)}/${action}?location=${encodeURIComponent(location)}`;
 return executeQueueWrite<{plan:import('../../../shared/queuePlanV2').QueuePublishedPlanV2}>({path:url,token,body,key});
}
