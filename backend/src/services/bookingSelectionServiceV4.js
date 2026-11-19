const {createHash}=require('node:crypto');
const captureV4=require('./queueSelectionCaptureV4');
const future=require('./bookingScheduledCapacityV4');
const time=require('./queueDayTime');
const {isValidTimeZone}=require('../utils/timezones');
const {normalizePhilippineMobileNumber}=require('../utils/phone');
const {instant}=require('./bookingSelectionContractV4');
function fail(code,message,statusCode=409){throw Object.assign(new Error(message),{code,statusCode});}
function enabled(){return process.env.BOOKING_SELECTION_V4_ENABLED==='1';}
function assertEnabled(){if(!enabled())fail('BOOKING_V4_NOT_ENABLED','Resource bookings are not enabled for this location.');}
function scopeOf(booking){return{tenantId:String(booking.tenantId),locationId:String(booking.locationId)};}
function version(service){return createHash('sha256').update(JSON.stringify([service.id,service.durationPolicy])).digest('hex');}
function serviceChoice(service){
 return {id:service.id,name:service.name,assignment:service.assignmentPolicy.mode,
   duration:{baseMinutes:service.durationPolicy.baseMinutes,minCount:service.durationPolicy.minCount,maxCount:service.durationPolicy.maxCount,
     stepCount:service.durationPolicy.stepCount,defaultCount:service.durationPolicy.defaultCount,visible:service.durationPolicy.visible,version:version(service)},
   resourceReady:service.resourceReady,quantityMax:service.quantityMax,
   resources:service.resourceMembers.map(member=>({id:member.id,name:member.name,enabled:member.isActive!==false&&!member.archivedAt})),
   extras:service.extras.map(extra=>({serviceId:extra.serviceId,required:extra.selectionRequirement==='required'}))};
}
async function catalog(client,scope){
 assertEnabled();
 const raw=await captureV4.readCatalog(client,scope);
 const mapped=(await client.query(`SELECT s.id::text,s.name,s.slug,s.manual_payment_required FROM vendor_services s
 JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
 JOIN service_resource_requirements r ON(r.service_id,r.tenant_id,r.location_id)=(s.id,s.tenant_id,l.location_id)
 WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.is_active AND l.is_active`,[scope.tenantId,scope.locationId])).rows;
 const slugs=new Map(mapped.map(row=>[row.id,row]));
 if(raw.workflow.mode!=='linear')return{contractVersion:4,enabled:true,reasonCode:'BOOKING_WORKFLOW_UNSUPPORTED',resourceServiceIds:mapped.map(row=>row.id),resourceServiceSlugs:mapped.map(row=>row.slug),blockedServices:mapped.map(row=>({id:row.id,name:row.name})),services:[]};
 return{contractVersion:4,enabled:true,resourceServiceIds:mapped.map(row=>row.id),resourceServiceSlugs:mapped.map(row=>row.slug),blockedServices:mapped.filter(row=>!raw.services.some(service=>service.id===row.id)).map(row=>({id:row.id,name:row.name})),catalogVersion:raw.catalogRevision,services:raw.services.map(service=>({...serviceChoice(service),slug:slugs.get(service.id)?.slug,manualPaymentRequired:Boolean(slugs.get(service.id)?.manual_payment_required)}))};
}
async function configurationSummary(client,tenantId){
 const rows=(await client.query(`SELECT l.id::text,l.slug,r.service_id::text,p.tracking_enabled,to_jsonb(p)->>'archived_at' AS archived_at
 FROM store_locations l LEFT JOIN service_resource_requirements r ON(r.tenant_id,r.location_id)=(l.tenant_id,l.id)
 LEFT JOIN location_resource_pools p ON(p.id,p.tenant_id,p.location_id)=(r.pool_id,r.tenant_id,r.location_id)
 WHERE l.tenant_id=$1 ORDER BY l.id,r.service_id`,[tenantId])).rows,result=[];
 for(const locationId of [...new Set(rows.map(row=>row.id))]){
   const raw=await captureV4.readCatalog(client,{tenantId:String(tenantId),locationId});
   for(const row of rows.filter(row=>row.id===locationId&&row.service_id)){
     const service=raw.services.find(service=>service.id===row.service_id);
     result.push({locationSlug:row.slug,serviceId:row.service_id,contractVersion:4,capabilityEnabled:enabled(),resourceConfigured:true,
       ready:Boolean(service?.resourceReady&&raw.workflow.mode==='linear'&&row.tracking_enabled&&!row.archived_at),
       assignment:service?.assignmentPolicy.mode||null,duration:service?{baseMinutes:service.durationPolicy.baseMinutes,defaultCount:service.durationPolicy.defaultCount}:null,
       extrasCount:service?.extras.length||0,workflowSupported:raw.workflow.mode==='linear'});
   }
 }
 return{locations:result};
}
async function resolvePublicScope(tenantSlug,locationSlug){
 const tenant=await require('../repositories/tenants').findTenantBySlug(tenantSlug,{activeOnly:true});
 if(!tenant||!tenant.publicProfileEnabled||tenant.vendorApprovalStatus!=='approved')fail('BOOKING_NOT_FOUND','Booking location not found.',404);
 const location=await require('../repositories/storeLocations').findLocationByTenantAndSlug(tenant._id,locationSlug);
 if(!location?.isActive)fail('BOOKING_NOT_FOUND','Booking location not found.',404);
 await require('./entitlementAdmissionService').admit({tenantId:tenant._id,featureKey:'booking',mode:'create'});
 return{tenantId:String(tenant._id),locationId:String(location._id)};
}
async function slots(client,scope,body,booking=null){
 if(!booking)assertEnabled();
 const frozen=booking?await current(client,booking):null;
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(body.date||''))fail('INVALID_BOOKING_DATE','Choose a booking date.',400);
 const location=(await client.query('SELECT timezone FROM store_locations WHERE tenant_id=$1 AND id=$2',[scope.tenantId,scope.locationId])).rows[0];
 if(!location||!isValidTimeZone(location.timezone))fail('BOOKING_HOURS_UNAVAILABLE','The location hours could not be verified.');
 const [year,month,day]=body.date.split('-').map(Number),start=time.localDateTimeToInstant({year,month,day,hour:0,minute:0},location.timezone),end=time.localDateTimeToInstant({...localDate({year,month,day},1),hour:0,minute:0},location.timezone),result=[];
 for(let at=start.getTime();at<end.getTime();at+=30*60000){
   const scheduledStartAt=new Date(at).toISOString();
   try{const snapshot=frozen?frozen.snapshot:await capturePlan(client,scope,{...body,scheduledStartAt});
     if(frozen){await assertFrozenResources(client,booking,snapshot);await assertSchedule(client,scope,snapshot.captured.items,scheduledStartAt);}
     await future.assertFutureAdmission(client,scope,snapshot.captured.items,scheduledStartAt,{lockPools:false,...(frozen?{excludeBookingId:booking?._id,excludeSelectionRevision:frozen.revision}:{})});
     result.push({startAt:scheduledStartAt,endAt:new Date(at+Math.max(...snapshot.captured.items.map(item=>item.durationMinutes))*60000).toISOString(),remainingCapacity:1,isAvailable:true});
   }catch(error){if(!['INVALID_BOOKING_START','BOOKING_DURATION_EXCEEDS_STORE_HOURS','BOOKING_TIME_UNAVAILABLE','BOOKING_RESOURCE_CONFLICT'].includes(error.code))throw error;}
 }
 return{slots:result,provisional:true};
}
async function publicDetails(client,booking){
 const record=await current(client,booking);if(!record)return null;
 let warning=null;try{await assertFrozenResources(client,booking,record.snapshot);await assertSchedule(client,scopeOf(booking),record.snapshot.captured.items,record.snapshot.scheduledStartAt,{allowPast:true});}
 catch(error){if(!['BOOKING_HOURS_UNAVAILABLE','BOOKING_DURATION_EXCEEDS_STORE_HOURS','BOOKING_TIME_UNAVAILABLE','BOOKING_RESOURCE_NEEDS_REVIEW'].includes(error.code))throw error;warning='The booking needs staff review. Its reserved resources are kept until staff reschedule or cancel it.';}
 return{...display(record.snapshot),warning,amountPendingConfirmation:true};
}
function sanitizePublicSelections(input){
 if(!Array.isArray(input))fail('INVALID_BOOKING_SELECTION','Select services and resources.',400);
 const normalized=input.map(root=>{
   if(!root||typeof root!=='object'||Array.isArray(root)||!Array.isArray(root.resources))fail('INVALID_BOOKING_SELECTION','Review the selected service.',400);
   const convert=leaf=>{if(!leaf||typeof leaf.durationVersion!=='string'||!/^[a-f0-9]{64}$/u.test(leaf.durationVersion))fail('INVALID_BOOKING_SELECTION','Review the selected duration.',400);const value={...leaf,durationPolicyRevision:'1'};delete value.durationVersion;return value;};
   return{...root,resources:root.resources.map(leaf=>{const result=convert(leaf);if(!Array.isArray(leaf.extras))fail('INVALID_BOOKING_SELECTION','Review the selected extras.',400);result.extras=leaf.extras.map(convert);return result;})};
 });
 captureV4.validateSelections(normalized,{complete:true});return structuredClone(input);
}
function assertVerifiedSelections(verified,request){
 if(verified.selectionContractVersion!==4&&request.selectionContractVersion!==4)return;
 const normalize=value=>({selectionContractVersion:value.selectionContractVersion,catalogVersion:value.catalogVersion,serviceSelections:sanitizePublicSelections(value.serviceSelections),
   tenantSlug:String(value.tenantSlug||'').trim().toLowerCase(),locationSlug:String(value.locationSlug||'').trim().toLowerCase(),serviceSlug:String(value.serviceSlug||'').trim().toLowerCase(),
   scheduledStartAt:String(value.scheduledStartAt||'').trim(),customerName:String(value.customerName||'').trim(),customerEmail:String(value.customerEmail||'').trim().toLowerCase(),
   customerPhone:normalizePhilippineMobileNumber(value.customerPhone),notes:String(value.notes||'').trim(),notifyBySms:Boolean(value.notifyBySms),
   executionMode:value.executionMode||'parallel',bookingQuantity:Number(value.bookingQuantity||1),
   bundleItems:value.bundleItems?.map(item=>({serviceSlug:String(item.serviceSlug||'').trim().toLowerCase(),bookingQuantity:Number(item.bookingQuantity||1)}))});
 if(commandHash('verify',normalize(verified))!==commandHash('verify',normalize(request)))fail('BOOKING_VERIFICATION_MISMATCH','Your resource choices changed. Please verify this booking again.',400);
}
function normalizePublicSelections(input,raw){
 if(!Array.isArray(input)||!input.length||input.length>20)fail('INVALID_BOOKING_SELECTION','Select at least one service.',400);
 const services=new Map(raw.services.map(service=>[service.id,service]));
 const translate=(leaf,service,isExtra=false)=>{
   if(!leaf||typeof leaf!=='object'||Array.isArray(leaf))fail('INVALID_BOOKING_SELECTION','Review the resource selection.',400);
   const allowed=isExtra?['extraSelectionId','serviceId','quantity','durationCount','durationVersion','resourceMemberIds']:['resourceSelectionId','resourceMemberId','quantity','durationCount','durationVersion','extras'];
   if(Object.keys(leaf).some(key=>!allowed.includes(key))||leaf.durationVersion!==version(service))fail('BOOKING_CATALOG_CHANGED','The service settings changed. Review your choices.');
   const result={...leaf,durationPolicyRevision:service.durationPolicy.revision};delete result.durationVersion;
   if(!isExtra){if(!Array.isArray(leaf.extras))fail('INVALID_BOOKING_SELECTION','Select extras explicitly.',400);
     result.extras=leaf.extras.map(extra=>{const option=services.get(extra.serviceId);if(!option)fail('EXTRA_NOT_ELIGIBLE','An extra is no longer offered.');return translate(extra,option,true);});}
   return result;
 };
 return input.map(root=>{if(!root||typeof root!=='object'||Array.isArray(root))fail('INVALID_BOOKING_SELECTION','Review the selected service.',400);const service=services.get(root.serviceId);if(!service)fail('SERVICE_POLICY_REQUIRED','A selected service is no longer offered.');
   if(Object.keys(root).some(key=>!['serviceSelectionId','serviceId','resources'].includes(key))||!Array.isArray(root.resources))fail('INVALID_BOOKING_SELECTION','Review the service selection.',400);
   return{serviceSelectionId:root.serviceSelectionId,serviceId:root.serviceId,resources:root.resources.map(leaf=>translate(leaf,service))};});
}
function localDate(parts,days=0){const d=new Date(Date.UTC(parts.year,parts.month-1,parts.day)+days*time.DAY_MS);return{year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),weekday:d.getUTCDay()};}
function ruleInterval(rule,date,timezone){
 if(!rule.starts_at||!rule.ends_at)return{start:time.localDateTimeToInstant({...date,hour:0,minute:0},timezone),end:time.localDateTimeToInstant({...localDate(date,1),hour:0,minute:0},timezone)};
 const [sh,sm]=String(rule.starts_at).split(':').map(Number),[eh,em]=String(rule.ends_at).split(':').map(Number);
 return{start:time.localDateTimeToInstant({...date,hour:sh,minute:sm},timezone),end:time.localDateTimeToInstant({...localDate(date,rule.ends_next_day?1:0),hour:eh,minute:em},timezone)};
}
function covers(intervals,start,end){let cursor=start.getTime();for(const interval of intervals.sort((a,b)=>a.start-b.start)){if(interval.start.getTime()>cursor)break;cursor=Math.max(cursor,interval.end.getTime());if(cursor>=end.getTime())return true;}return false;}
async function assertSchedule(client,scope,items,scheduledStartAt,{allowPast=false}={}){
 const start=instant(scheduledStartAt);
 const location=(await client.query('SELECT timezone,is_active,clock_timestamp() AS observed_at FROM store_locations WHERE tenant_id=$1 AND id=$2',[scope.tenantId,scope.locationId])).rows[0];
 if(!location?.is_active||!isValidTimeZone(location.timezone))fail('BOOKING_HOURS_UNAVAILABLE','The location hours could not be verified.');
 if(!allowPast&&start<=new Date(location.observed_at))fail('INVALID_BOOKING_START','Choose a future booking time.',400);
 const hours=(await client.query('SELECT weekday,opens_at::text AS "opensAt",closes_at::text AS "closesAt",is_closed AS "isClosed" FROM store_hours WHERE location_id=$1 ORDER BY weekday,opens_at,id',[scope.locationId])).rows;
 for(const item of items){
   const end=new Date(start.getTime()+item.durationMinutes*60000),interval=time.resolveEffectiveStoreInterval({now:start,timezone:location.timezone,hours});
   if(!interval||end>interval.closesAt)fail('BOOKING_DURATION_EXCEEDS_STORE_HOURS','Choose a time and duration that finish before closing.');
   const dates=[localDate(time.getZonedParts(start,location.timezone),-1),localDate(time.getZonedParts(start,location.timezone)),localDate(time.getZonedParts(end,location.timezone))];
   const uniqueDates=[...new Map(dates.map(date=>[time.formatBusinessDate(date),date])).values()];
   const exceptions=(await client.query(`SELECT exception_date::text,starts_at::text,ends_at::text,is_available FROM vendor_availability_exceptions
     WHERE tenant_id=$1 AND location_id=$2 AND (service_id IS NULL OR service_id=$3) AND exception_date=ANY($4::date[])`,
     [scope.tenantId,scope.locationId,item.serviceId,uniqueDates.map(time.formatBusinessDate)])).rows;
   const blocks=(await client.query(`SELECT weekday,starts_at::text,ends_at::text,ends_next_day FROM vendor_availability_blocks
     WHERE tenant_id=$1 AND location_id=$2 AND (service_id IS NULL OR service_id=$3) AND is_active`,[scope.tenantId,scope.locationId,item.serviceId])).rows;
   const positive=[],negative=[];
   for(const date of uniqueDates)for(const rule of exceptions.filter(row=>row.exception_date===time.formatBusinessDate(date))){const interval=ruleInterval(rule,date,location.timezone);(rule.is_available?positive:negative).push(interval);}
   if(negative.some(interval=>interval.start<end&&interval.end>start))fail('BOOKING_TIME_UNAVAILABLE','This service is unavailable during the selected time.');
   if(blocks.length){const allowed=[...positive];for(const date of uniqueDates)for(const block of blocks.filter(row=>row.weekday===date.weekday))allowed.push(ruleInterval(block,date,location.timezone));
     if(!covers(allowed,start,end))fail('BOOKING_TIME_UNAVAILABLE','Choose a time within this service’s booking schedule.');}
 }
 return{timezone:location.timezone,hours,observedAt:new Date(location.observed_at).toISOString()};
}
async function capturePlan(client,scope,body){
 assertEnabled();
 if(body.selectionContractVersion!==4||body.executionMode&&body.executionMode!=='parallel'||body.bookingQuantity&&body.bookingQuantity!==1)
   fail('UNSUPPORTED_BOOKING_SELECTION','Resource bookings use parallel selections and an independent duration count.',400);
 const raw=await captureV4.readCatalog(client,scope);
 if(raw.workflow.mode!=='linear')fail('BOOKING_WORKFLOW_UNSUPPORTED','Scheduled resource bookings currently require one simultaneous service stage.');
 if(body.catalogVersion!==raw.catalogRevision)fail('BOOKING_CATALOG_CHANGED','The service settings changed. Review your choices.');
 const selections=normalizePublicSelections(body.serviceSelections,raw);
 const captured=await captureV4.capture(client,scope,selections,raw.catalogRevision);
 const schedule=await assertSchedule(client,scope,captured.items,body.scheduledStartAt);
 const paymentRows=(await client.query('SELECT id::text,manual_payment_required FROM vendor_services WHERE tenant_id=$1 AND id=ANY($2::bigint[])',[scope.tenantId,[...new Set(captured.items.map(item=>item.serviceId))]])).rows;
 if(paymentRows.length!==new Set(captured.items.map(item=>item.serviceId)).size)fail('BOOKING_CATALOG_CHANGED','The selected services changed.');
 const paymentRequired=paymentRows.some(row=>row.manual_payment_required);
 const start=instant(body.scheduledStartAt),end=new Date(start.getTime()+Math.max(...captured.items.map(item=>item.durationMinutes))*60000);
 return{contractVersion:4,paymentRequired,input:structuredClone(body.serviceSelections),internalSelections:selections,catalogVersion:body.catalogVersion,captured,
   scheduledStartAt:start.toISOString(),scheduledEndAt:end.toISOString(),...schedule};
}
async function current(client,booking,{lock=false}={}){
 if(booking.selectionContractVersion!==4)return null;
 const row=(await client.query(`SELECT snapshot,revision::text FROM booking_v4_selection_versions WHERE booking_id=$1 AND revision=$2 AND tenant_id=$3 AND location_id=$4${lock?' FOR SHARE':''}`,
 [booking._id,booking.selectionRevision,booking.tenantId,booking.locationId])).rows[0];
 if(!row)fail('BOOKING_CAPTURE_MISSING','This booking needs resource reconciliation before continuing.');return row;
}
async function persist(client,booking,inputSnapshot,actorUserId,revision='1'){
 const snapshot=structuredClone(inputSnapshot);
 const workflow=await require('./queueWorkflowService').read(client,scopeOf(booking),{initialize:true});
 if(workflow.configurationRevision!==snapshot.captured.workflow.configurationRevision)fail('BOOKING_CATALOG_CHANGED','The service workflow changed. Review your choices.');
 for(const item of snapshot.captured.items){const root=snapshot.captured.serviceSelections.find(root=>root.serviceSelectionId===item.serviceSelectionId);const bookingItem=booking.bundleItems?.find(child=>child.serviceId===root.serviceId);
   if(!bookingItem)fail('BOOKING_CAPTURE_MISSING','The booking service lineage needs reconciliation.');
   item.bookingId=String(booking._id);item.bookingItemId=String(bookingItem.id);item.bookingSelectionRevision=String(revision);}
 await client.query(`INSERT INTO booking_v4_selection_versions(booking_id,revision,tenant_id,location_id,scheduled_start_at,scheduled_end_at,snapshot,actor_user_id)
 VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,[booking._id,revision,booking.tenantId,booking.locationId,snapshot.scheduledStartAt,snapshot.scheduledEndAt,JSON.stringify(snapshot),actorUserId]);
 for(const item of snapshot.captured.items)await client.query(`INSERT INTO booking_v4_selection_leaves(booking_id,selection_revision,selection_id,tenant_id,location_id,service_id,pool_id,resource_member_id,resource_member_revision,units,duration_minutes,starts_at,ends_at,snapshot)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,[booking._id,revision,item.selectionId,booking.tenantId,booking.locationId,item.serviceId,item.resource.poolId,item.resourceMemberId||null,item.resourceMemberRevision||null,item.resource.totalUnits,item.durationMinutes,snapshot.scheduledStartAt,new Date(instant(snapshot.scheduledStartAt).getTime()+item.durationMinutes*60000),JSON.stringify(item)]);
 await client.query('UPDATE bookings SET selection_contract_version=4,selection_revision=$2,selection_payment_required=$3 WHERE id=$1',[booking._id,revision,Boolean(snapshot.paymentRequired)]);
}
async function assertFrozenResources(client,booking,snapshot){
 const scope=scopeOf(booking);
 for(const item of snapshot.captured.items){
   const row=(await client.query(`SELECT s.is_active AS service_active,l.is_active AS offered,p.capacity,p.tracking_enabled,p.archived_at,
      m.is_active AS member_active,m.archived_at AS member_archived FROM vendor_services s
      JOIN location_services l ON(l.service_id,l.tenant_id)=(s.id,s.tenant_id)
      JOIN location_resource_pools p ON(p.tenant_id,p.location_id)=(l.tenant_id,l.location_id) AND p.id=$4
      LEFT JOIN resource_pool_members m ON(m.tenant_id,m.location_id,m.pool_id)=(p.tenant_id,p.location_id,p.id) AND m.id=$5
      WHERE s.tenant_id=$1 AND l.location_id=$2 AND s.id=$3`,[scope.tenantId,scope.locationId,item.serviceId,item.resource.poolId,item.resourceMemberId||null])).rows[0];
   if(!row?.service_active||!row.offered||!row.tracking_enabled||row.archived_at||item.resource.totalUnits>row.capacity
     ||item.resourceMemberId&&(!row.member_active||row.member_archived))fail('BOOKING_RESOURCE_NEEDS_REVIEW','A booked resource is no longer enabled. Please reschedule or cancel this booking.');
 }
}
async function assertCurrentProtection(client,booking){
 const record=await current(client,booking,{lock:true});if(!record)return;
 await assertFrozenResources(client,booking,record.snapshot);
 if(!['confirmed','rescheduled'].includes(booking.status))return;
 const rows=(await client.query('SELECT selection_id,state FROM booking_v4_reservations WHERE booking_id=$1 AND selection_revision=$2 ORDER BY selection_id FOR UPDATE',[booking._id,record.revision])).rows;
 if(rows.length!==record.snapshot.captured.items.length||rows.some(row=>!['protected','converted'].includes(row.state)||!record.snapshot.captured.items.some(item=>item.selectionId===row.selection_id)))
   fail('BOOKING_RESERVATION_INCONSISTENT','The booking reservation needs staff review.');
 return record;
}
function assertPaymentVerified(booking){
 if(booking.selectionContractVersion===4&&booking.serviceManualPaymentRequired&&!(booking.paymentStatus==='paid'&&booking.paymentVerifiedAt))
   fail('BOOKING_PAYMENT_VERIFICATION_REQUIRED','Staff must verify the required payment proof before confirming or starting this booking.');
}
async function confirm(client,booking){
 assertPaymentVerified(booking);
 const record=await current(client,booking,{lock:true});if(!record)return;
 const snapshot=record.snapshot,scope=scopeOf(booking);
 await assertFrozenResources(client,booking,snapshot);
 await assertSchedule(client,scope,snapshot.captured.items,snapshot.scheduledStartAt);
 const existing=(await client.query('SELECT selection_id,state FROM booking_v4_reservations WHERE booking_id=$1 AND selection_revision=$2 ORDER BY selection_id FOR UPDATE',[booking._id,record.revision])).rows;
 if(existing.length){if(existing.length!==snapshot.captured.items.length||existing.some(row=>row.state!=='protected'||!snapshot.captured.items.some(item=>item.selectionId===row.selection_id)))fail('BOOKING_RESERVATION_INCONSISTENT','This booking needs resource reconciliation.');return;}
 await future.assertFutureAdmission(client,scope,snapshot.captured.items,snapshot.scheduledStartAt);
 for(const item of snapshot.captured.items)await client.query(`INSERT INTO booking_v4_reservations(booking_id,selection_revision,selection_id,tenant_id,location_id,pool_id,resource_member_id,units,starts_at,ends_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[booking._id,record.revision,item.selectionId,scope.tenantId,scope.locationId,item.resource.poolId,item.resourceMemberId||null,item.resource.totalUnits,
 snapshot.scheduledStartAt,new Date(instant(snapshot.scheduledStartAt).getTime()+item.durationMinutes*60000)]);
}
async function cancel(client,booking,reason){
 const record=await current(client,booking,{lock:true});if(!record)return;
 const live=(await client.query('SELECT state FROM booking_v4_reservations WHERE booking_id=$1 AND selection_revision=$2 FOR UPDATE',[booking._id,record.revision])).rows;
 if(live.some(row=>row.state==='converted'))fail('BOOKING_ALREADY_STARTED','Resolve this booking through its service request.');
 await client.query("UPDATE booking_v4_reservations SET state='released',released_reason=$3,resolved_at=clock_timestamp() WHERE booking_id=$1 AND selection_revision=$2 AND state='protected'",[booking._id,record.revision,reason]);
}
async function linkedBooking(client,scope,ticketId){
 const row=(await client.query(`SELECT b.id::text FROM bookings b JOIN ticket_service_plans p
   ON(p.booking_id,p.tenant_id,p.location_id)=(b.id,b.tenant_id,b.location_id)
   WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.ticket_id=$3 AND p.source='booking' AND p.contract_version=4
     AND b.queue_ticket_id=p.ticket_id AND b.selection_contract_version=4`,[scope.tenantId,scope.locationId,ticketId])).rows[0];
 return row?require('../repositories/bookings').findBookingByIdForUpdate(row.id,{client}):null;
}
async function assertLinkedAdmission(client,scope,ticketId,{required=false}={}){
 const booking=await linkedBooking(client,scope,ticketId);
 if(!booking){if(required)fail('BOOKING_CAPTURE_MISSING','The linked booking needs staff review.');return null;}
 if(!['confirmed','rescheduled'].includes(booking.status))fail('BOOKING_NOT_ACTIVE','This booking is no longer available for service.');
 const record=await current(client,booking,{lock:true});
 const observed=(await client.query('SELECT clock_timestamp() AS now')).rows[0].now;
 if(new Date(observed)<instant(record.snapshot.scheduledStartAt))fail('BOOKING_NOT_STARTED','This booking can be called when its scheduled time begins.');
 assertPaymentVerified(booking);
 await assertFrozenResources(client,booking,record.snapshot);
 await assertSchedule(client,scope,record.snapshot.captured.items,record.snapshot.scheduledStartAt,{allowPast:true});
 return{booking,record};
}
async function convertChild(client,scope,ticketId,selectionId,allocationId){
 const booking=await linkedBooking(client,scope,ticketId);if(!booking)return;
 const result=await client.query(`UPDATE booking_v4_reservations r SET state='converted' FROM resource_allocations a
   JOIN queue_selection_definitions d ON(d.ticket_id,d.plan_revision,d.selection_id)=(a.ticket_id,a.child_plan_revision,a.line_id)
   WHERE r.booking_id=$1 AND r.selection_revision=$2 AND r.selection_id=$3 AND r.state='protected'
     AND r.tenant_id=$4 AND r.location_id=$5 AND a.id=$6 AND a.ticket_id=$7
     AND a.tenant_id=r.tenant_id AND a.location_id=r.location_id AND a.pool_id=r.pool_id AND a.units=r.units
     AND a.resource_member_id IS NOT DISTINCT FROM r.resource_member_id AND a.released_at IS NULL
     AND d.snapshot->>'bookingId'=r.booking_id::text AND d.snapshot->>'bookingSelectionRevision'=r.selection_revision::text`,
   [booking._id,booking.selectionRevision,selectionId,scope.tenantId,scope.locationId,allocationId,ticketId]);
 if(result.rowCount===0){const prior=(await client.query('SELECT state FROM booking_v4_reservations WHERE booking_id=$1 AND selection_revision=$2 AND selection_id=$3',[booking._id,booking.selectionRevision,selectionId])).rows[0];
   if(!prior||!['converted','released'].includes(prior.state))fail('BOOKING_RESERVATION_INCONSISTENT','The booking protection could not be transferred safely.');}
}
async function resolveChild(client,scope,ticketId,selectionId,outcome){
 const booking=await linkedBooking(client,scope,ticketId);if(!booking)return;
 await client.query(`UPDATE booking_v4_reservations SET state='released',released_reason=$4,resolved_at=clock_timestamp()
   WHERE booking_id=$1 AND selection_revision=$2 AND selection_id=$3 AND state='converted'`,[booking._id,booking.selectionRevision,selectionId,outcome]);
}
async function resolveUnstartedTicket(client,scope,ticketId,reason){
 const booking=await linkedBooking(client,scope,ticketId);if(!booking)return;
 const active=(await client.query('SELECT id FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND released_at IS NULL LIMIT 1',[scope.tenantId,scope.locationId,ticketId])).rows;
 if(active.length)fail('BOOKING_ALREADY_STARTED','Record an explicit service outcome before resolving this booking.');
 await client.query("UPDATE booking_v4_reservations SET state='released',released_reason=$3,resolved_at=clock_timestamp() WHERE booking_id=$1 AND selection_revision=$2 AND state='protected'",[booking._id,booking.selectionRevision,reason]);
}
async function completeLinkedBooking(client,scope,ticketId){
 const booking=await linkedBooking(client,scope,ticketId);if(!booking)return;
 const state=(await client.query(`SELECT t.status,count(c.id)::int AS total,count(c.id) FILTER(WHERE c.state='completed')::int AS completed
   FROM tickets t JOIN ticket_service_plans p ON(p.ticket_id,p.tenant_id,p.location_id)=(t.id,t.tenant_id,t.location_id)
   JOIN queue_child_attempts c ON(c.ticket_id,c.plan_revision)=(p.ticket_id,p.revision) AND c.is_current
   WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.id=$3 GROUP BY t.status`,[scope.tenantId,scope.locationId,ticketId])).rows[0];
 if(state?.status==='served'&&state.total>0&&state.total===state.completed){
   await client.query("UPDATE bookings SET status='completed',fulfillment_outcome_reason='booked_service_completed',fulfillment_resolved_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",[booking._id]);
   await client.query("UPDATE booking_v4_reservations SET state='released',released_reason='completed',resolved_at=clock_timestamp() WHERE booking_id=$1 AND selection_revision=$2 AND state IN('protected','converted')",[booking._id,booking.selectionRevision]);
 }
}
// Staff-only resolution runs inside the caller's location lock and permission-checked transaction.
async function detachUnstartedForStaffResolution(client,ledger,booking,reason){
 if(booking.selectionContractVersion!==4||!booking.queueTicketId)return booking;
 const scope=scopeOf(booking),ticket=(await client.query('SELECT id,status,service_started_at FROM tickets WHERE tenant_id=$1 AND location_id=$2 AND id=$3 FOR UPDATE',[scope.tenantId,scope.locationId,booking.queueTicketId])).rows[0];
 if(!ticket||ticket.service_started_at)fail('BOOKING_ALREADY_STARTED','Record the service outcome before changing this booking.');
 const active=(await client.query('SELECT id FROM resource_allocations WHERE tenant_id=$1 AND location_id=$2 AND ticket_id=$3 AND released_at IS NULL LIMIT 1',[scope.tenantId,scope.locationId,booking.queueTicketId])).rows;
 if(active.length)fail('BOOKING_ALREADY_STARTED','Complete or interrupt the active service before resolving this booking.');
 await require('./ticketResourceOutcomeService').cancelTicketReservations(client,ledger,{tenantId:scope.tenantId,locationId:scope.locationId,_id:booking.queueTicketId},reason);
 await client.query("UPDATE tickets SET status='cancelled',status_reason=$4,terminal_at=clock_timestamp(),current_queue_day_id=NULL,updated_at=clock_timestamp() WHERE tenant_id=$1 AND location_id=$2 AND id=$3",[scope.tenantId,scope.locationId,booking.queueTicketId,reason]);
 await client.query('UPDATE bookings SET queue_ticket_id=NULL,checked_in_at=NULL,updated_at=clock_timestamp() WHERE id=$1',[booking._id]);
 return{...booking,queueTicketId:null,checkedInAt:null};
}
async function reschedule(client,booking,scheduledStartAt,actorUserId){
 const record=await current(client,booking,{lock:true});if(!record)fail('BOOKING_CAPTURE_MISSING','The booking resource selections are missing.');
 const scope=scopeOf(booking),snapshot=structuredClone(record.snapshot),start=instant(scheduledStartAt);
 await assertFrozenResources(client,booking,snapshot);
 const schedule=await assertSchedule(client,scope,snapshot.captured.items,start.toISOString());
 const wasConfirmed=['confirmed','rescheduled'].includes(booking.status);
 if(wasConfirmed)await future.assertFutureAdmission(client,scope,snapshot.captured.items,start,{excludeBookingId:booking._id,excludeSelectionRevision:record.revision});
 const end=new Date(start.getTime()+Math.max(...snapshot.captured.items.map(item=>item.durationMinutes))*60000);
 Object.assign(snapshot,{scheduledStartAt:start.toISOString(),scheduledEndAt:end.toISOString(),...schedule});
 await cancel(client,booking,'staff_rescheduled');
 const revision=String(BigInt(record.revision)+1n);
 await persist(client,booking,snapshot,actorUserId,revision);
 const repository=require('../repositories/bookings');
 if(booking.bundleItems?.length)await repository.updateBookingBundleItemIntervals(booking._id,{tenantId:booking.tenantId,locationId:booking.locationId,
   items:booking.bundleItems.map(item=>{const root=snapshot.captured.serviceSelections.find(root=>root.serviceId===item.serviceId),minutes=Math.max(...snapshot.captured.items.filter(leaf=>leaf.serviceSelectionId===root.serviceSelectionId&&leaf.selectionKind==='resource').map(leaf=>leaf.durationMinutes));return{id:item.id,startsAt:start.toISOString(),endsAt:new Date(start.getTime()+minutes*60000).toISOString()};})},{client});
 const updated=await repository.updateBooking(booking._id,{scheduledStartAt:start.toISOString(),scheduledEndAt:end.toISOString(),status:wasConfirmed?'rescheduled':'pending'},{client,requireUnarrived:true});
 if(wasConfirmed)await confirm(client,updated);
 return updated;
}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort((a,b)=>a<b?-1:a>b?1:0).map(key=>[key,canonical(value[key])]));return value;}
function commandHash(action,body){return createHash('sha256').update(JSON.stringify(canonical({action,body}))).digest('hex');}
function commandKey(value){if(typeof value!=='string'||!/^[-A-Za-z0-9_:]{1,120}$/u.test(value))fail('BOOKING_REQUEST_KEY_REQUIRED','Refresh this booking form before trying again.',400);return value;}
async function readReceipt(client,scope,actorUserId,operationKey,hash){
 const row=(await client.query('SELECT payload_hash,result FROM booking_v4_command_receipts WHERE tenant_id=$1 AND location_id=$2 AND actor_user_id=$3 AND operation_key=$4',[scope.tenantId,scope.locationId,actorUserId,commandKey(operationKey)])).rows[0];
 if(row&&row.payload_hash!==hash)fail('IDEMPOTENCY_CONFLICT','This action was already used for different booking details.');return row?.result||null;
}
async function writeReceipt(client,scope,actorUserId,operationKey,hash,result){
 await client.query('INSERT INTO booking_v4_command_receipts(tenant_id,location_id,actor_user_id,operation_key,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[scope.tenantId,scope.locationId,actorUserId,commandKey(operationKey),hash,JSON.stringify(result)]);
}
function display(snapshot){return{contractVersion:4,scheduledStartAt:snapshot.scheduledStartAt,scheduledEndAt:snapshot.scheduledEndAt,
 services:snapshot.captured.serviceSelections.map(service=>({name:service.serviceName,resources:service.resources.map(resource=>({name:resource.resourceMemberName||service.serviceName,quantity:resource.quantity,durationCount:resource.durationCount,durationMinutes:resource.durationMinutes,
 extras:resource.extras.map(extra=>({name:extra.serviceName,quantity:extra.quantity,durationCount:extra.durationCount,durationMinutes:extra.durationMinutes}))}))}))};}
module.exports={enabled,assertEnabled,catalog,configurationSummary,resolvePublicScope,slots,publicDetails,capturePlan,current,persist,assertPaymentVerified,confirm,cancel,assertSchedule,display,normalizePublicSelections,sanitizePublicSelections,assertVerifiedSelections,assertFrozenResources,assertCurrentProtection,linkedBooking,assertLinkedAdmission,convertChild,resolveChild,resolveUnstartedTicket,completeLinkedBooking,detachUnstartedForStaffResolution,reschedule,commandHash,commandKey,readReceipt,writeReceipt};
