const policy=require('./queueServicePolicyV4');
const no=reasonCode=>({requestable:false,reasonCode});
// A proof that at least one minimum-quantity selection can pass the existing
// canonical capture rules. No selections are written and no runtime work starts.
function evaluate(root,rows,{activatingPoolId,workflow}={}){
 try{
  function leaf(row){
   if(!row||row.pool_id==null)return no('RESOURCE_MAPPING_MISSING');
   if(row.archived_at)return no('RESOURCE_POOL_ARCHIVED');
   if(row.tracking_enabled!==true&&String(row.pool_id)!==activatingPoolId)return no('RESOURCE_TRACKING_DISABLED');
   if(!Number.isInteger(row.capacity)||row.capacity<1||row.capacity>100||!Number.isInteger(row.units_required)||row.units_required<1||row.units_required>row.capacity)return no('RESOURCE_REQUIREMENT_INVALID');
   const configuration=policy.configuration(row.configuration);
   if(configuration.assignment.mode==='named'){
    if(row.units_required!==1)return no('RESOURCE_REQUIREMENT_INVALID');
    if(!Number.isInteger(row.active_members)||row.active_members<1||row.active_members>row.capacity)return no('NAMED_RESOURCES_UNAVAILABLE');
   }
   return {requestable:true,configuration,row};
  }
  const parent=leaf(root);if(!parent.requestable)return parent;
  if(workflow?.mode!=='linear'&&(workflow?.mode!=='multi_station'||!Array.isArray(workflow.stages)||workflow.stages.filter(stage=>Array.isArray(stage.serviceIds)&&stage.serviceIds.includes(String(root.id))).length!==1))return no('RESOURCE_SELECTION_INFEASIBLE');
  const selected=[parent];
  for(const extra of parent.configuration.extras){
   const row=rows.find(item=>String(item.id)===extra.serviceId);
   if(extra.selection!=='required')continue;
   let child;try{child=leaf(row);}catch{return no('REQUIRED_EXTRA_NOT_READY');}
   if(!child.requestable||child.configuration.extras.length)return no('REQUIRED_EXTRA_NOT_READY');
   if(child.configuration.duration.baseMinutes*child.configuration.duration.minCount>parent.configuration.duration.baseMinutes*parent.configuration.duration.maxCount)return no('RESOURCE_SELECTION_INFEASIBLE');
   selected.push(child);
  }
  const grouped=new Map();
  for(const member of selected){const key=String(member.row.pool_id);const current=grouped.get(key)||{units:0,named:0,anonymous:0,capacity:member.row.capacity,active:member.row.active_members};
   current.units+=member.row.units_required;
   if(member.configuration.assignment.mode==='named')current.named++;else current.anonymous++;
   grouped.set(key,current);
  }
  for(const group of grouped.values())if(group.units>group.capacity||(group.named&&group.anonymous)||group.named>group.active)return no('RESOURCE_SELECTION_INFEASIBLE');
  return {requestable:true,reasonCode:null};
 }catch{return no('RESOURCE_SELECTION_INFEASIBLE');}
}
module.exports={evaluate};
