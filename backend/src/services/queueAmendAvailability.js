function unavailable() {
  throw Object.assign(new Error("A resource added to this request is currently held or in service. Choose another resource or try again when it is available."), {
    code: "RESOURCE_CAPACITY_UNAVAILABLE", statusCode: 409,
  });
}

// Relative intervals keep a clock tick or regenerated client selection IDs from
// turning unchanged demand into an addition. Stages are checked independently,
// just like the provisional stage-start assumption used by the resource picker.
function demand(items) {
  return items.map(item => ({
    stage: item.stageId || "linear", pool: String(item.resource.poolId),
    member: item.resourceMemberId || null, units: item.resource.totalUnits,
    end: item.durationMinutes * 60000,
  }));
}
function addedIntervals(previous, next) {
  const old = demand(previous), current = demand(next), added = [];
  const keys = new Map(current.map(row => [JSON.stringify([row.stage,row.pool,row.member]), row]));
  for (const [key, identity] of keys) {
    const matches = row => JSON.stringify([row.stage,row.pool,row.member]) === key;
    const before = old.filter(matches), after = current.filter(matches);
    const points = [...new Set([0,...before.map(row=>row.end),...after.map(row=>row.end)])].sort((a,b)=>a-b);
    for (let index=0;index<points.length-1;index++) {
      const start=points[index],end=points[index+1];
      const units = rows => rows.reduce((sum,row)=>sum+(row.end>start?row.units:0),0);
      const increase=units(after)-units(before);
      if (increase>0) added.push({...identity,start,end,units:increase});
    }
  }
  return {added};
}

// The command adapter holds the location-first ledger transaction lock. Take
// the same ordered pool locks as Call/Start before inspecting live occupancy;
// retain them until the amendment commits. This check never reserves capacity.
async function assertAvailable(client, scope, ticketId, previous, next) {
  const {added}=addedIntervals(previous,next);
  if (!added.length) return;
  const tuple=[scope.tenantId,scope.locationId], pools=new Map();
  for (const id of [...new Set(added.map(row=>row.pool))].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)) {
    const row=(await client.query(`SELECT id::text,capacity,tracking_enabled,to_jsonb(location_resource_pools)->>'archived_at' AS archived_at
      FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE`,[...tuple,id])).rows[0];
    if (!row?.tracking_enabled || row.archived_at) unavailable();
    pools.set(id,row);
  }
  const now=(await client.query('SELECT clock_timestamp() AS at')).rows[0].at.getTime();
  for (const [poolId,pool] of pools) {
    const changes=added.filter(row=>row.pool===poolId);
    const latest=new Date(now+Math.max(...changes.map(row=>row.end)));
    const active=(await client.query(`SELECT units,resource_member_id FROM resource_allocations
      WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND released_at IS NULL LIMIT 5001`,[...tuple,poolId])).rows;
    const held=(await client.query(`SELECT units,resource_member_id,starts_at,ends_at FROM resource_ledger_reservations
      WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND state='protected'
      AND ticket_id IS DISTINCT FROM $4::bigint AND starts_at<$6 AND ends_at>$5 LIMIT 5001`,[...tuple,poolId,ticketId,new Date(now),latest])).rows;
    if(active.length>5000||held.length>5000) unavailable();
    for(const change of changes) {
      const start=now+change.start,end=now+change.end;
      const overlapping=held.filter(row=>row.starts_at.getTime()<end&&row.ends_at.getTime()>start);
      if(change.member && [...active,...overlapping].some(row=>!row.resource_member_id||row.resource_member_id===change.member)) unavailable();
      // Existing waiting demand remains demand-only. Validate simultaneous new
      // units together without counting those unchanged, unreserved units again.
      const proposed=changes.filter(row=>row.stage===change.stage);
      const points=[...new Set([start,...proposed.flatMap(row=>[now+row.start,now+row.end]).filter(at=>at>start&&at<end),
        ...overlapping.flatMap(row=>[row.starts_at.getTime(),row.ends_at.getTime()]).filter(at=>at>start&&at<end)])];
      for(const at of points) {
        const used=active.reduce((sum,row)=>sum+row.units,0)
          +overlapping.reduce((sum,row)=>sum+(row.starts_at.getTime()<=at&&row.ends_at.getTime()>at?row.units:0),0)
          +proposed.reduce((sum,row)=>sum+(now+row.start<=at&&now+row.end>at?row.units:0),0);
        if(used>pool.capacity) unavailable();
      }
    }
  }
}
module.exports={assertAvailable,addedIntervals};
