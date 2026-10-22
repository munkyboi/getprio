import type { QueueSelectionOptionsV4 } from '../../../shared/queueSelectionPlanV4';
import type { QueueResourceSetupReasonV1 } from '../../../shared/queueResourceSetupV1';
import type { ResourceCatalogItem } from './NamedQueuePlanDialog';

export type ScopedResourceCatalogItem = ResourceCatalogItem & {poolId:string};
/** Setup is authoritative about requestability; members/policies remain the executable V4 choices. */
export function queueResourceCatalog(options:QueueSelectionOptionsV4):ScopedResourceCatalogItem[] {
  if(!options.resourceSetup)return [];
  return options.resourceSetup.services.flatMap<ScopedResourceCatalogItem>(mapping=>{
    const pool=options.resourceSetup.pools.find(item=>item.id===mapping.poolId);
    const service=options.services.find(item=>item.id===mapping.id);
    if(!mapping.requestable||!pool||!service||!service.resourceReady||!pool.serviceIds.includes(service.id))return [];
    const common={poolId:pool.id,category:pool.name,serviceId:service.id,durationBaseMinutes:service.durationPolicy.baseMinutes};
    if(service.assignmentPolicy.mode==='automatic')return [{...common,id:`pool-${service.id}`,name:service.name,assignmentMode:'automatic' as const,active:true}];
    return service.resourceMembers.map((member,index)=>({member,index})).sort((a,b)=>(a.member.displayOrder??a.index)-(b.member.displayOrder??b.index)||a.index-b.index).map(({member})=>({...common,id:member.id,name:member.name,assignmentMode:'named' as const,active:member.isActive&&!member.archivedAt,availabilityLabel:member.availability.state}));
  });
}
export function resourceSetupReason(reason:QueueResourceSetupReasonV1):string {
  switch(reason){
    case 'SERVICE_POLICY_NOT_CONFIGURED':return 'Set a queue policy for this service at this location.';
    case 'RESOURCE_MAPPING_MISSING':return 'Link this service to a resource pool.';
    case 'RESOURCE_POOL_ARCHIVED':return 'The linked resource pool is archived.';
    case 'RESOURCE_TRACKING_DISABLED':return 'Resource tracking is not enabled for this pool.';
    case 'REQUIRED_EXTRA_NOT_READY':return 'A required extra needs its queue setup completed.';
    case 'RESOURCE_REQUIREMENT_INVALID':return 'Review the resource quantity required by this service.';
    case 'NAMED_RESOURCES_UNAVAILABLE':return 'This service needs enough enabled named resources.';
    case 'RESOURCE_SELECTION_INFEASIBLE':return 'The minimum selection cannot fit the configured resource pool and required extras.';
  }
}
