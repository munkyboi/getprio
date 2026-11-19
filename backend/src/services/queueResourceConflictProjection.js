const capture = require("./queueSelectionCaptureV4");
const availability = require("./queueNamedAvailabilityService");

function durationInput(value, service) {
  if (value.durationCount != null) return { durationCount: value.durationCount, durationPolicyRevision: value.durationPolicyRevision };
  const baseMinutes = service?.durationPolicy?.baseMinutes;
  const minutes = Number(value.durationMinutes);
  const count = Number.isInteger(minutes) && Number.isInteger(baseMinutes) && baseMinutes > 0 && minutes % baseMinutes === 0 ? minutes / baseMinutes : null;
  return { durationCount: count, durationPolicyRevision: service?.durationPolicy?.revision || null };
}
function requestBody(serviceSelections, catalogRevision, catalog) {
  const services = new Map((catalog?.services || []).map((service) => [service.id, service]));
  const selections = (serviceSelections || []).map((service) => ({
    serviceSelectionId: service.serviceSelectionId,
    serviceId: service.serviceId,
    resources: (service.resources || []).map((resource) => ({
      resourceSelectionId: resource.resourceSelectionId,
      resourceMemberId: resource.resourceMemberId || null,
      quantity: resource.quantity,
      ...durationInput(resource, services.get(service.serviceId)),
      extras: (resource.extras || []).map((extra) => ({
        extraSelectionId: extra.extraSelectionId,
        serviceId: extra.serviceId,
        quantity: extra.quantity,
        ...durationInput(extra, services.get(extra.serviceId)),
        resourceMemberIds: extra.resourceMemberIds || (extra.resourceMembers || []).map((member) => member.id),
      })),
    })),
  }));
  const requests = selections.flatMap((service) => service.resources.flatMap((resource) => [
    {
      selectionId: resource.resourceSelectionId,
      serviceId: service.serviceId,
      quantity: resource.quantity,
      durationCount: durationInput(resource, services.get(service.serviceId)).durationCount,
      durationPolicyRevision: durationInput(resource, services.get(service.serviceId)).durationPolicyRevision,
      resourceMemberIds: resource.resourceMemberId ? [resource.resourceMemberId] : [],
    },
    ...resource.extras.map((extra) => ({
      selectionId: extra.extraSelectionId,
      serviceId: extra.serviceId,
      parentServiceId: service.serviceId,
      quantity: extra.quantity,
      durationCount: durationInput(extra, services.get(extra.serviceId)).durationCount,
      durationPolicyRevision: durationInput(extra, services.get(extra.serviceId)).durationPolicyRevision,
      resourceMemberIds: extra.resourceMemberIds || [],
    })),
  ]));
  return { serviceSelections: selections, requests, catalogRevision, requestKey: `projection-${Date.now()}` };
}

async function bookedConflict(client,scope,draft){
 const row=(await client.query(`SELECT b.id::text FROM bookings b JOIN ticket_service_plans p ON(p.booking_id,p.tenant_id,p.location_id)=(b.id,b.tenant_id,b.location_id)
   WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.ticket_id=$3 AND p.source='booking' AND p.contract_version=4
     AND b.queue_ticket_id=p.ticket_id AND to_jsonb(b)->>'selection_contract_version'='4'`,[scope.tenantId,scope.locationId,draft.published_ticket_id])).rows[0];
 if(!row)return undefined;
 const v4=require('./bookingSelectionServiceV4'),future=require('./bookingScheduledCapacityV4'),booking=await require('../repositories/bookings').findBookingById(row.id,{client}),record=await v4.current(client,booking);
 try{
   const now=new Date((await client.query('SELECT clock_timestamp() AS at')).rows[0].at);
   if(now<new Date(record.snapshot.scheduledStartAt))throw Object.assign(new Error('This booking can be called when its scheduled time begins.'),{code:'BOOKING_NOT_STARTED'});
   await v4.assertFrozenResources(client,booking,record.snapshot);
   await v4.assertSchedule(client,scope,record.snapshot.captured.items,record.snapshot.scheduledStartAt,{allowPast:true});
   await v4.assertSchedule(client,scope,record.snapshot.captured.items,now.toISOString(),{allowPast:true});
   const groups=new Map();for(const item of record.snapshot.captured.items){const id=String(item.resource.poolId);groups.set(id,[...(groups.get(id)||[]),item]);}
   for(const [poolId,items] of groups){
     const end=new Date(now.getTime()+Math.max(...items.map(item=>item.durationMinutes))*60000),pool=(await client.query('SELECT capacity FROM location_resource_pools WHERE tenant_id=$1 AND location_id=$2 AND id=$3',[scope.tenantId,scope.locationId,poolId])).rows[0];
     const active=(await client.query('SELECT units,resource_member_id FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND released_at IS NULL',[scope.tenantId,scope.locationId,poolId])).rows.map(row=>({...row,starts_at:now,ends_at:end}));
     const held=(await client.query("SELECT units,resource_member_id,starts_at,ends_at FROM resource_ledger_reservations WHERE tenant_id=$1 AND location_id=$2 AND pool_id=$3 AND state='protected' AND ticket_id IS DISTINCT FROM $4::bigint AND starts_at<$6 AND ends_at>$5",[scope.tenantId,scope.locationId,poolId,booking.queueTicketId,now,end])).rows;
     const promises=(await future.readFuturePromises(client,scope,poolId,now,end)).filter(row=>!(row.booking_id===booking._id&&row.selection_revision===record.revision&&items.some(item=>item.selectionId===row.selection_id)));
     future.assertIntervalCapacity(items.map(item=>({units:item.resource.totalUnits,resource_member_id:item.resourceMemberId||null,starts_at:now,ends_at:new Date(now.getTime()+item.durationMinutes*60000)})),[...active,...held,...promises],pool?.capacity);
   }
   return null;
 }catch(error){if(!error.code)throw error;return{code:error.code,message:error.message,planRevision:draft.revision,stageId:'linear'};}
}
async function readWaitingConflict(client, scope, draft, serviceSelections, { contractVersion = 4, resourceWait = null } = {}) {
  if (!Array.isArray(serviceSelections) || !serviceSelections.length) return null;
  const booked=await bookedConflict(client,scope,draft);
  if(booked!==undefined)return booked;
  const catalog = await capture.readCatalog(client, scope);
  // Legacy selections can predate V4 policy configuration. Keep their recorded
  // conflict when the V4 preview cannot represent the complete captured plan.
  if (Number(contractVersion) === 3) {
    const configured = new Set(catalog.services.map((service) => service.id));
    const serviceIds = serviceSelections.flatMap((service) => [service.serviceId,
      ...service.resources.flatMap((resource) => (resource.extras || []).map((extra) => extra.serviceId))]);
    if (serviceIds.some((id) => !configured.has(id))) return resourceWait;
  }
  const body = requestBody(serviceSelections, catalog.catalogRevision, catalog);
  const preview = await availability.evaluate(client, scope, {
    ...body,
    draftId: draft.id,
  });
  let unavailable, detail;
  for (const selection of preview.selections) {
    const requested = body.requests.find((request) => request.selectionId === selection.selectionId);
    const selectedMember = selection.resourceMembers?.find((member) => requested?.resourceMemberIds.includes(member.id) && member.availability?.state !== 'available');
    const blocked = selectedMember?.availability || (selection.availability?.state !== 'available' ? selection.availability : null);
    if (blocked) { unavailable = selection; detail = blocked; break; }
  }
  if (!unavailable) return null;
  return {
    code: detail?.reasonCode || "RESOURCE_CAPACITY_UNAVAILABLE",
    message: detail?.message || "Waiting for the requested resource capacity.",
    planRevision: draft.revision,
    stageId: unavailable.stageId || "linear",
    observedAt: preview.checkedAt,
  };
}

module.exports = { readWaitingConflict };
