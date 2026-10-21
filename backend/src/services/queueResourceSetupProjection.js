// Read-only setup facts. This does not authorize admission or activate tracking.
function build({pools,services,choices,workflow}) {
  const byPool=new Map(pools.map(pool=>[String(pool.id),pool]));
  const byChoice=new Map(choices.map(choice=>[String(choice.id),choice]));
  const rows=services.map(service=>({...byPool.get(String(service.pool_id)),...service}));
  return {
    pools:pools.map(pool=>({id:String(pool.id),name:pool.name,capacity:pool.capacity,
      trackingEnabled:pool.tracking_enabled===true,archivedAt:pool.archived_at||null,
      serviceIds:services.filter(service=>String(service.pool_id)===String(pool.id)).map(service=>String(service.id))})),
    services:services.map(service=>{
      const pool=byPool.get(String(service.pool_id)),choice=byChoice.get(String(service.id));
      const reasonCodes=[];
      if(!service.has_configuration)reasonCodes.push('SERVICE_POLICY_NOT_CONFIGURED');
      if(!pool)reasonCodes.push('RESOURCE_MAPPING_MISSING');
      if(pool?.archived_at)reasonCodes.push('RESOURCE_POOL_ARCHIVED');
      if(pool&&pool.tracking_enabled!==true)reasonCodes.push('RESOURCE_TRACKING_DISABLED');
      const feasible=reasonCodes.length?{requestable:false}:require('./queueResourceMinimumFeasibility').evaluate(rows.find(row=>String(row.id)===String(service.id)),rows,{workflow});
      if(!reasonCodes.length&&!feasible.requestable)reasonCodes.push(feasible.reasonCode);
      if(!reasonCodes.length&&choice?.resourceReady!==true)reasonCodes.push('REQUIRED_EXTRA_NOT_READY');
      return {id:String(service.id),name:service.name,poolId:service.pool_id==null?null:String(service.pool_id),
        requestable:choice?.resourceReady===true&&feasible.requestable,reasonCodes};
    }),
  };
}
module.exports={build};
