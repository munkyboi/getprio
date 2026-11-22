import {useEffect,useState} from 'react';
import type {QueueType,QueueTypeConfiguration} from '../../../shared/queueTypes';
import {OperationButton} from './OperationsUi';

const labels:Record<QueueType,{name:string;description:string}>={simple:{name:'Simple queue',description:'Call customers in order. You can include a service without reserving resources.'},resource:{name:'Resource-based queue',description:'Manage requests that share limited people, rooms or equipment.'},workflow:{name:'Queue workflow',description:'Guide one customer journey through sequential service stations.'}};

export function QueueTypeSettings({configuration,canEdit,busy,onSave}:{configuration:QueueTypeConfiguration|null;canEdit:boolean;busy:boolean;onSave:(type:QueueType)=>Promise<void>}){
 const [selected,setSelected]=useState<QueueType>('simple');
 const [confirmed,setConfirmed]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{setSelected(configuration?.type||'simple');setConfirmed(false);setError('');},[configuration?.type,configuration?.scope.tenantSlug,configuration?.scope.locationSlug,configuration?.revision]);
 if(!configuration)return <p role="status">Loading this location’s queue type…</p>;
 return <section aria-labelledby="queue-type-heading" className="queue-settings-panel queue-type-settings">
  <div className="queue-settings-heading"><h2 id="queue-type-heading">Queue type</h2><p>{configuration.notice}</p></div>
  <fieldset disabled={!canEdit||busy} className="queue-type-fieldset">
   <legend>How should new requests move through this location?</legend>
   <div className="queue-type-options">
    {(Object.keys(labels) as QueueType[]).map(type=>{
     const allowed=configuration.capabilities[type];
     const ready=configuration.readiness[type];
     const reason=!allowed?'Not included in your current plan.':!ready.ready?ready.reason:null;
     return <label key={type} className="queue-type-option" data-selected={selected===type} data-unavailable={!allowed||!ready.ready}>
      <input type="radio" name="queue-type" value={type} checked={selected===type} disabled={!allowed||!ready.ready} aria-describedby={`queue-type-${type}-description${reason?` queue-type-${type}-reason`:''}`} onChange={()=>{setSelected(type);setConfirmed(false);setError('');}}/>
      <span className="queue-type-option-copy"><strong>{labels[type].name}</strong><span id={`queue-type-${type}-description`}>{labels[type].description}</span>{reason?<span id={`queue-type-${type}-reason`} className="queue-type-reason">{reason}</span>:null}</span>
     </label>;
    })}
   </div>
  </fieldset>
  <div className="queue-type-actions">
   <label className="queue-type-confirm"><input type="checkbox" checked={confirmed} disabled={!canEdit||busy||selected===configuration.type} onChange={event=>setConfirmed(event.target.checked)}/><span>Apply this change to future requests only.</span></label>
   <OperationButton type="button" disabled={!canEdit||busy||!confirmed||selected===configuration.type} onClick={()=>{setError('');void onSave(selected).catch(reason=>setError(reason instanceof Error?reason.message:'The queue type could not be saved.'));}}>{busy?'Saving…':'Save queue type'}</OperationButton>
  </div>
  {error?<p role="alert" className="queue-settings-error">{error}</p>:null}
 </section>;
}
