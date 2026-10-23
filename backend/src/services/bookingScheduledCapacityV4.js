// All callers must hold the shared location-first resource transaction lock.
// Future admission uses scheduled intervals. Actual Start still checks every
// unreleased allocation through the existing ledger; expected end never releases.
function conflict(message='The selected resource is reserved for this time.') {
  throw Object.assign(new Error(message),{code:'BOOKING_RESOURCE_CONFLICT',statusCode:409});
}
function instant(value) {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())) throw Object.assign(new Error('Invalid capacity interval.'),{code:'INVALID_BOOKING_INTERVAL',statusCode:400});
  return date.getTime();
}
function assertIntervalCapacity(demands, existing, capacity) {
  if(!Array.isArray(demands)||!demands.length||!Number.isInteger(capacity)||capacity<1||capacity>100)
    throw Object.assign(new Error('Resource capacity needs reconciliation.'),{code:'RESOURCE_CONFIGURATION_REQUIRED',statusCode:409});
  const normalized=rows=>rows.map(row=>{
    const start=instant(row.starts_at),end=instant(row.ends_at);
    if(end<=start||!Number.isInteger(row.units)||row.units<1||row.units>100||(row.resource_member_id&&row.units!==1))
      throw Object.assign(new Error('Resource demand needs reconciliation.'),{code:'RESOURCE_CONFIGURATION_REQUIRED',statusCode:409});
    return {...row,start,end};
  });
  const proposed=normalized(demands),held=normalized(existing);
  const overlaps=(a,b)=>a.start<b.end&&a.end>b.start;
  for(let i=0;i<proposed.length;i++) {
    const row=proposed[i];
    for(const other of [...held,...proposed.slice(i+1)])
      if(overlaps(row,other)&&(row.resource_member_id||other.resource_member_id)
        &&(!row.resource_member_id||!other.resource_member_id||row.resource_member_id===other.resource_member_id)) conflict();
  }
  // Evaluate each candidate's interval; unrelated historical overload cannot
  // reject an otherwise independent slot. Release events precede equal acquires.
  for(const candidate of proposed) {
    const changes=[];
    for(const row of [...held,...proposed])if(overlaps(candidate,row))
      changes.push([Math.max(candidate.start,row.start),row.units],[Math.min(candidate.end,row.end),-row.units]);
    changes.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let used=0;
    for(const [,delta] of changes){used+=delta;if(used>capacity)conflict('There is not enough resource capacity for this time.');}
  }
}
async function readFuturePromises(client,scope,poolId,start,end,{ticketId=null,selectionId=null,excludeBookingId=null,excludeSelectionRevision=null}={}) {
  // Intake capability OFF must never hide already-confirmed promises. Legacy
  // installations/test schemas without the additive migration remain unchanged.
  const schema=(await client.query("SELECT to_regclass(format('%I.booking_v4_reservations',current_schema())) IS NOT NULL AS available")).rows[0];
  if(schema?.available!==true)return [];
  if(excludeBookingId!==null&&excludeSelectionRevision===null) throw new Error("Exact owned selection revision is required.");
  // Exclude only an authoritative booking binding. Queue callers cannot pass
  // client booking IDs: ticket ownership + exact selection identity is checked.
  return (await client.query(`SELECT r.units,r.resource_member_id,r.starts_at,r.ends_at,r.booking_id::text,r.selection_revision::text,r.selection_id
    FROM booking_v4_reservations r JOIN bookings b ON (b.id,b.tenant_id,b.location_id)=(r.booking_id,r.tenant_id,r.location_id)
    WHERE r.tenant_id=$1 AND r.location_id=$2 AND r.pool_id=$3 AND r.state='protected'
      AND r.starts_at<$5 AND r.ends_at>$4
      AND ($6::bigint IS NULL OR NOT(r.booking_id=$6 AND r.selection_revision=$9::bigint))
      AND NOT($7::bigint IS NOT NULL AND COALESCE(b.queue_ticket_id=$7 AND r.selection_revision=b.selection_revision AND r.selection_id=$8
       AND EXISTS(SELECT 1 FROM queue_selection_definitions d JOIN ticket_service_plans p ON(p.ticket_id,p.tenant_id,p.location_id)=(d.ticket_id,d.tenant_id,d.location_id)
        WHERE d.ticket_id=$7 AND d.selection_id=r.selection_id AND d.plan_revision=p.revision AND p.booking_id=b.id
          AND d.snapshot->>'bookingId'=r.booking_id::text AND d.snapshot->>'bookingSelectionRevision'=r.selection_revision::text),FALSE))
      AND NOT EXISTS(SELECT 1 FROM resource_ledger_reservations held
        JOIN queue_selection_definitions d ON(d.ticket_id,d.plan_revision,d.selection_id)=(held.ticket_id,held.child_plan_revision,held.line_id)
        WHERE held.tenant_id=r.tenant_id AND held.location_id=r.location_id AND held.ticket_id=b.queue_ticket_id
          AND held.line_id=r.selection_id AND held.pool_id=r.pool_id AND held.units=r.units
          AND held.resource_member_id IS NOT DISTINCT FROM r.resource_member_id AND held.state='protected'
          AND held.starts_at<=GREATEST(r.starts_at,$4) AND held.ends_at>=LEAST(r.ends_at,$5)
          AND d.snapshot->>'bookingId'=r.booking_id::text AND d.snapshot->>'bookingSelectionRevision'=r.selection_revision::text)`,
    [scope.tenantId,scope.locationId,poolId,start,end,excludeBookingId,ticketId,selectionId,excludeSelectionRevision])).rows;
}
async function assertFutureAdmission(client,scope,items,start,{excludeBookingId=null,excludeSelectionRevision=null,lockPools=true}={}) {
  const groups=new Map();
  for(const item of items) {
    const poolId=String(item.resource.poolId),rows=groups.get(poolId)||[];
    rows.push({selection_id:item.selectionId,units:item.resource.totalUnits,resource_member_id:item.resourceMemberId||null,
      starts_at:new Date(start),ends_at:new Date(instant(start)+item.durationMinutes*60000)});groups.set(poolId,rows);
  }
  if(excludeBookingId!==null&&excludeSelectionRevision===null) throw new Error("Exact owned selection revision is required.");
  for(const poolId of [...groups.keys()].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)) {
    const pool=(await client.query(`SELECT capacity FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND id=$3${lockPools?' FOR UPDATE':''}`,[scope.tenantId,scope.locationId,poolId])).rows[0];
    if(!pool)conflict('The resource mapping no longer exists.');
    const demands=groups.get(poolId),end=new Date(Math.max(...demands.map(x=>instant(x.ends_at))));
    const future=await readFuturePromises(client,scope,poolId,start,end,{excludeBookingId,excludeSelectionRevision});
    // Protected live Queue holds overlap only their recorded interval. Current
    // occupancy contributes its projected interval to FUTURE planning, never an
    // infinite lifetime. This is not permission to start over an unreleased row.
    const other=(await client.query(`SELECT units,resource_member_id,starts_at,ends_at FROM resource_ledger_reservations
       WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND state='protected' AND starts_at<$5 AND ends_at>$4

       UNION ALL SELECT units,resource_member_id,started_at AS starts_at,expected_end_at AS ends_at FROM resource_allocations
       WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND released_at IS NULL AND started_at<$5 AND expected_end_at>$4`,
      [scope.tenantId,scope.locationId,poolId,start,end])).rows;
    assertIntervalCapacity(demands,[...future,...other],pool.capacity);
  }
}
module.exports={assertIntervalCapacity,readFuturePromises,assertFutureAdmission};
