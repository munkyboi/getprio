import { useRef,useState } from 'react';
import type { ResourceConfiguration } from '../components/VendorResourceConfigurationForms';
import { ApiError } from '../api/client';
import { prepareResourceActivation,submitResourceActivation,type ResourceActivationAttempt } from './resourceActivationCommand';
import { Button } from './components/ui/button';

export function LocalResourceActivation({configuration,poolId,tenant,location,token,disabled,visible=true,onBusy,onChanged,onRefresh}:{configuration:ResourceConfiguration|undefined;poolId:string;tenant:string;location:string;token:string;disabled:boolean;visible?:boolean;onBusy:(busy:boolean)=>void;onChanged:(result:ResourceConfiguration)=>void;onRefresh:()=>void}) {
  const [working,setWorking]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
  const pending=useRef<ResourceActivationAttempt|null>(null);
  const capability=configuration?.localActivation,record=capability?.pools.find(pool=>pool.poolId===poolId);
  const allowed=capability?.capability==='local-resource-activation-v1'&&capability.available&&record?.status==='ready';
  async function activate(){
    if(working||(!pending.current&&disabled))return;
    try{if(!pending.current){if(!configuration)return;pending.current=prepareResourceActivation(configuration,poolId,tenant,location,crypto.randomUUID());}}catch(e){setError(e instanceof Error?e.message:'Refresh resource setup.');return;}
    setWorking(true);setError('');onBusy(true);
    try{const result=await submitResourceActivation(token,pending.current);pending.current=null;setUncertain(false);onChanged(result);onBusy(false);}
    catch(e){const unknown=!(e instanceof ApiError)||e.status>=500;setUncertain(unknown);setError(e instanceof Error?e.message:'Resource tracking could not be enabled.');if(!unknown){pending.current=null;onBusy(false);onRefresh();}}
    finally{setWorking(false);}
  }
  if(!visible&&!pending.current)return null;
  return <div className="queue-stack">
    {record?.blockReason?<p className="request-metadata">{record.blockReason.message}</p>:!capability?.available?<p className="request-metadata">Enabling resource tracking is unavailable in this preview.</p>:null}
    {record?.status==='enabled'&&!pending.current?<p role="status">Resource tracking is enabled. Refresh the resource list to review availability.</p>:<Button type="button" variant="outline" disabled={working||(!pending.current&&(disabled||!allowed))} onClick={()=>void activate()}>{working?'Enabling tracking…':uncertain?'Retry same activation':'Enable resource tracking'}</Button>}
    {error?<p role="alert">{error}</p>:null}
    {uncertain?<p role="status">The result is unknown. Retry the same activation before making other setup changes.</p>:null}
  </div>;
}
