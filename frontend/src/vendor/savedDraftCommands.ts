import type { QueueDraftV2 } from '../../../shared/queuePlanV2';
import type { QueueSelectionDraftV3 } from '../../../shared/queueSelectionPlanV3';
import type { QueueSelectionDraftV4 } from '../../../shared/queueSelectionPlanV4';
import type { QueueWrite } from './queueCommandOwner';
import { queuePlanBase } from '../api/queuePlansV2';
export type SavedQueueDraft=QueueDraftV2|QueueSelectionDraftV3|QueueSelectionDraftV4;
export function savedDraftWrite(draft:SavedQueueDraft,action:'publish'|'delete',scope:{token:string;tenant:string;location:string},key:string):QueueWrite{
 if(draft.state!=='draft'||!draft.allowedActions.includes(action)||!draft.planRevision)throw Error('Refresh this draft before continuing.');
 if(action==='publish'&&(!draft.publishReadiness?.ready||!draft.catalogRevision))throw Error('Review the publication requirements and save the current policies first.');
 return {path:action==='delete'?queuePlanBase(scope.tenant,scope.location,draft.id):`/vendor/tenant/${encodeURIComponent(scope.tenant)}/queue/plans/${encodeURIComponent(draft.id)}/publish?location=${encodeURIComponent(scope.location)}`,method:action==='delete'?'DELETE':'POST',token:scope.token,key,confirmation:{kind:action==='delete'?'draft-delete':'draft-publish',id:draft.id},body:{expectedPlanRevision:draft.planRevision,...(action==='publish'?{expectedCatalogRevision:draft.catalogRevision}:{})}};
}
export { isDeletedDraftResult as confirmedDeletedDraft } from './draftActionResponse';
