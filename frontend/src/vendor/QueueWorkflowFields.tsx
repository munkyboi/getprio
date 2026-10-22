import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react';
import { EntityCard, EntityGrid, EntityIconAction } from './EntityCards';
import { ConfigurationCheck, ConfigurationInput, ConfigurationSelect } from './ConfigurationUi';
import { OperationButton } from './OperationsUi';
import { moveWorkflowStage, workflowDraftIssues, type QueueWorkflowDraft, type WorkflowChoice } from './queueWorkflowDraft';

/** Prepared controlled fields. No API binding, persistence or runtime activation. */
export function QueueWorkflowFields({draft,counters,services,busy,onChange}:{draft:QueueWorkflowDraft;counters:WorkflowChoice[];services:WorkflowChoice[];busy:boolean;onChange:(draft:QueueWorkflowDraft)=>void}) {
 const issues=workflowDraftIssues(draft,counters,services);
 const toggle=(ids:string[],id:string,checked:boolean)=>checked?[...ids,id]:ids.filter(value=>value!==id);
 return <div className="queue-stack">
  <ConfigurationSelect label="Workflow mode" value={draft.mode} disabled={busy} data={[{value:'linear',label:'Linear'},{value:'multi_station',label:'Multi-station'}]} onChange={value=>{if(value==='linear'||value==='multi_station')onChange({...draft,mode:value});}}/>
  <p className="ops-muted">Configuration changes apply to new publications. Existing tickets keep their pinned workflow. A station is a service step; permitted counters dispatch work at that station.</p>
  {draft.mode==='multi_station'?<>
   <div className="ops-list-heading"><h3>Stations</h3><OperationButton variant="outline" disabled={busy} onClick={()=>onChange({...draft,stations:[...draft.stations,{stationId:crypto.randomUUID(),name:'',serviceCounterIds:[]}]})}>Add station</OperationButton></div>
   <EntityGrid label="Workflow stations">{draft.stations.map((station,index)=><EntityCard key={station.stationId} title={station.name||`Station ${index+1}`} footer={<EntityIconAction label={`Remove station ${station.name||index+1}`} disabled={busy||draft.stages.some(stage=>stage.stationId===station.stationId)} onClick={()=>onChange({...draft,stations:draft.stations.filter(item=>item.stationId!==station.stationId)})}><IconTrash aria-hidden="true"/></EntityIconAction>}>
    <ConfigurationInput label={`Name for station ${index+1}`} value={station.name} disabled={busy} onChange={event=>onChange({...draft,stations:draft.stations.map(item=>item.stationId===station.stationId?{...item,name:event.currentTarget.value}:item)})}/>
    <fieldset><legend>Permitted counters</legend>{counters.map(counter=><ConfigurationCheck key={counter.id} label={`${counter.name} for station ${index+1}`} checked={station.serviceCounterIds.includes(counter.id)} disabled={busy} onChange={event=>onChange({...draft,stations:draft.stations.map(item=>item.stationId===station.stationId?{...item,serviceCounterIds:toggle(item.serviceCounterIds,counter.id,event.currentTarget.checked)}:item)})}/>)}</fieldset>
    {draft.stages.some(stage=>stage.stationId===station.stationId)?<p className="ops-muted">Move or remove this station’s stages before removing it.</p>:null}
   </EntityCard>)}</EntityGrid>
   <div className="ops-list-heading"><h3>Stage order</h3><OperationButton variant="outline" disabled={busy||!draft.stations.length} onClick={()=>onChange({...draft,stages:[...draft.stages,{stageId:crypto.randomUUID(),stationId:'',label:'',serviceIds:[]}]})}>Add stage</OperationButton></div>
   <EntityGrid label="Ordered workflow stages">{draft.stages.map((stage,index)=><EntityCard key={stage.stageId} title={`${index+1}. ${stage.label||'Unnamed stage'}`} footer={<div className="queue-row"><EntityIconAction label={`Move stage ${index+1} earlier`} disabled={busy||index===0} onClick={()=>onChange(moveWorkflowStage(draft,stage.stageId,-1))}><IconArrowUp aria-hidden="true"/></EntityIconAction><EntityIconAction label={`Move stage ${index+1} later`} disabled={busy||index===draft.stages.length-1} onClick={()=>onChange(moveWorkflowStage(draft,stage.stageId,1))}><IconArrowDown aria-hidden="true"/></EntityIconAction><EntityIconAction label={`Remove stage ${index+1}`} disabled={busy} onClick={()=>onChange({...draft,stages:draft.stages.filter(item=>item.stageId!==stage.stageId)})}><IconTrash aria-hidden="true"/></EntityIconAction></div>}>
    <ConfigurationInput label={`Label for stage ${index+1}`} value={stage.label} disabled={busy} onChange={event=>onChange({...draft,stages:draft.stages.map(item=>item.stageId===stage.stageId?{...item,label:event.currentTarget.value}:item)})}/>
    <ConfigurationSelect label={`Station for stage ${index+1}`} value={stage.stationId} disabled={busy} data={draft.stations.map(station=>({value:station.stationId,label:station.name||'Unnamed station'}))} onChange={value=>onChange({...draft,stages:draft.stages.map(item=>item.stageId===stage.stageId?{...item,stationId:value||''}:item)})}/>
    <fieldset><legend>Services in this stage</legend>{services.map(service=><ConfigurationCheck key={service.id} label={`${service.name} in stage ${index+1}`} checked={stage.serviceIds.includes(service.id)} disabled={busy} onChange={event=>onChange({...draft,stages:draft.stages.map(item=>item.stageId===stage.stageId?{...item,serviceIds:toggle(item.serviceIds,service.id,event.currentTarget.checked)}:item)})}/>)}</fieldset>
   </EntityCard>)}</EntityGrid>
   {issues.length?<ul aria-label="Workflow draft needs review">{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
   <p className="ops-muted">Only the current stage may reserve resources. Future stages wait for an explicit handoff. This editor does not activate runtime processing.</p>
  </>:null}
 </div>;
}
