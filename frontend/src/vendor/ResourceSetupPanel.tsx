import { useEffect,useState,type ReactNode } from 'react';
import type { QueueResourceSetupV1 } from '../../../shared/queueResourceSetupV1';
import { resourceSetupReason } from './queueResourceCatalog';
import { Button } from './components/ui/button';
import { Alert,AlertDescription,AlertTitle } from './components/ui/alert';

export function ResourceSetupPanel({setup,poolFilter,onReviewSetup,managementActions}:{setup:QueueResourceSetupV1|undefined;poolFilter:string;onReviewSetup?:()=>void;managementActions?:(poolId:string,visible:boolean)=>ReactNode}) {
  // Keep activation owners mounted: a catalog hint cannot settle an unknown POST.
  const [ownerIds,setOwnerIds]=useState<string[]>(()=>setup?.pools.map(pool=>pool.id)||[]);
  useEffect(()=>{
    const currentIds=setup?.pools.map(pool=>pool.id)||[];
    setOwnerIds(previous=>{const added=currentIds.filter(id=>!previous.includes(id));return added.length?[...previous,...added]:previous;});
  },[setup]);
  const owners=managementActions?ownerIds.map(id=>{const pool=setup?.pools.find(item=>item.id===id);return <div key={id}>{managementActions(id,Boolean(pool&&!pool.trackingEnabled&&(poolFilter==='all'||pool.id===poolFilter)))}</div>;}):null;
  if(!setup)return <><Alert variant="warning"><AlertTitle>Resource setup unavailable</AlertTitle><AlertDescription>Refresh the resource list to check this location’s setup.</AlertDescription></Alert>{owners}</>;
  const services=setup.services.filter(service=>!service.requestable&&(poolFilter==='all'||service.poolId===poolFilter));
  const emptyPools=setup.pools.filter(pool=>!pool.serviceIds.length&&(poolFilter==='all'||pool.id===poolFilter));
  if(!services.length&&!emptyPools.length)return <>{null}{owners}</>;
  return <><section className="queue-stack" aria-label="Resource setup">
    <p className="request-metadata">Some resources need setup before they can be used in a service request.</p>
    {services.map(service=><div className="queue-stack" key={service.id}>
      <strong>{service.name}</strong>
      {service.poolId?<span className="request-metadata">{setup.pools.find(pool=>pool.id===service.poolId)?.name||'Linked pool unavailable'}</span>:null}
      <ul>{service.reasonCodes.map(reason=><li key={reason}>{resourceSetupReason(reason)}</li>)}</ul>
    </div>)}
    {emptyPools.map(pool=><div key={pool.id}><strong>{pool.name}</strong><p className="request-metadata">No services are linked to this resource pool.</p></div>)}
    {onReviewSetup?<><Button type="button" variant="outline" onClick={onReviewSetup}>Review queue setup</Button><p className="request-metadata">Queue policies and resource tracking are separate setup steps.</p></>:<p className="request-metadata">Ask an administrator to complete this location’s queue setup.</p>}
  </section>{owners}</>;
}
