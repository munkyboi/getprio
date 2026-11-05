/** Local editor state only. Wire adapters must use Queue's reviewed shared DTO. */
export interface QueueWorkflowDraft {
 mode:'linear'|'multi_station';
 stations:Array<{stationId:string;name:string;serviceCounterIds:string[]}>;
 stages:Array<{stageId:string;stationId:string;label:string;serviceIds:string[]}>;
}
export interface WorkflowChoice {id:string;name:string}
export function workflowDraftIssues(draft:QueueWorkflowDraft,counters:WorkflowChoice[],services:WorkflowChoice[]):string[] {
 if(draft.mode==='linear')return [];
 const issues:string[]=[];
 if(!draft.stations.length)issues.push('Add a station for the multi-station workflow.');
 if(!draft.stages.length)issues.push('Add an ordered service stage.');
 const stationIds=new Set<string>(),stageIds=new Set<string>(),assignedServices=new Set<string>();
 for(const station of draft.stations){
  if(!station.stationId||stationIds.has(station.stationId))issues.push('Each station needs its own stable identity.');
  stationIds.add(station.stationId);
  if(!station.name.trim())issues.push('Name each station.');
  if(!station.serviceCounterIds.length)issues.push(`Choose permitted counters for ${station.name||'each station'}.`);
  if(station.serviceCounterIds.some(id=>!counters.some(counter=>counter.id===id)))issues.push(`Review unavailable counters for ${station.name||'this station'}.`);
 }
 for(const stage of draft.stages){
  if(!stage.stageId||stageIds.has(stage.stageId))issues.push('Each stage needs its own stable identity.');
  stageIds.add(stage.stageId);
  if(!stage.label.trim())issues.push('Name each stage.');
  if(!stationIds.has(stage.stationId))issues.push(`Choose an available station for ${stage.label||'each stage'}.`);
  if(!stage.serviceIds.length)issues.push(`Assign services to ${stage.label||'each stage'}.`);
  for(const id of stage.serviceIds){
   if(!services.some(service=>service.id===id))issues.push(`Review unavailable services in ${stage.label||'this stage'}.`);
   if(assignedServices.has(id))issues.push('Assign each service to only one stage.');
   assignedServices.add(id);
  }
 }
 return [...new Set(issues)];
}
export function moveWorkflowStage(draft:QueueWorkflowDraft,stageId:string,direction:-1|1):QueueWorkflowDraft {
 const index=draft.stages.findIndex(stage=>stage.stageId===stageId),destination=index+direction;
 if(index<0||destination<0||destination>=draft.stages.length)return draft;
 const stages=[...draft.stages];[stages[index],stages[destination]]=[stages[destination],stages[index]];
 return {...draft,stages};
}
