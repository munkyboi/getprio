const { createHash } = require('node:crypto');
const repository = require('../repositories/queueTicketDetails');
const events = require('../repositories/queueEvents');
const { withVendorQueueTransaction, readAuthorizedVendorQueueActor } = require('./vendorQueueTransactionService');
const { assertPublicTextFieldsAllowed } = require('./contentModeration');
const { getDateKey } = require('./queueHelpers');
const {assertLegacyTicket}=require('./queuePlanBoundary');

function fail(message,statusCode,code) { throw Object.assign(new Error(message),{statusCode,code}); }
function validId(id) { return typeof id === 'string' && /^[1-9]\d{0,18}$/u.test(id) && Number.isSafeInteger(Number(id)); }
function version(row) {
  return createHash('sha256').update(JSON.stringify([row.tenant_id,row.location_id,row.id,row.exact_updated_at])).digest('hex');
}
function dto(row) {
  return {ticket:{id:row.id,ticketNumber:row.ticket_number,status:row.status,customerName:row.customer_name,
    notes:row.notes,customerEmail:row.customer_email,customerPhone:row.customer_phone,
    serviceName:row.service_name,serviceItemCount:row.service_item_count,version:version(row)},editableFields:['customerName','notes']};
}
function validateBody(body) {
  const keys=['version','expectedStatus','customerName','notes'];
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==keys.length
    || keys.some(key=>!Object.hasOwn(body,key)) || Object.keys(body).some(key=>!keys.includes(key))
    || typeof body.version!=='string' || !/^[a-f0-9]{64}$/u.test(body.version)
    || !['waiting','called'].includes(body.expectedStatus)
    || typeof body.customerName!=='string' || !body.customerName.trim() || body.customerName.trim().length>120
    || (body.notes!==null && (typeof body.notes!=='string' || body.notes.trim().length>1000))) {
    fail('Provide the current version/status, a customer name of 1–120 characters, and notes up to 1000 characters.',400,'INVALID_TICKET_DETAILS');
  }
  const details={customerName:body.customerName.trim(),notes:body.notes?.trim() || null};
  assertPublicTextFieldsAllowed({'Customer name':details.customerName,Notes:details.notes});
  return details;
}
function assertEditable(row) {
  if (!row) fail('Ticket not found at this location.',404,'TICKET_NOT_FOUND');
  if (!['waiting','called'].includes(row.status) || row.service_started_at || row.service_ended_at || row.service_outcome || row.allocated) {
    fail('This ticket is no longer editable. Refresh the queue; started or finished service cannot be edited.',409,'TICKET_NOT_EDITABLE');
  }
}
async function assertOperationsOpen(client,scope,row,{lock=false}={}) {
  const branch=(await client.query(`SELECT l.queue_lifecycle_mode,l.timezone,l.is_active,t.is_active AS tenant_active,
    clock_timestamp() AS observed_at FROM store_locations l JOIN tenants t ON t.id=l.tenant_id
    WHERE l.tenant_id=$1 AND l.id=$2`,[scope.tenantId,scope.locationId])).rows[0];
  if (!branch || !branch.is_active || !branch.tenant_active) fail('This business or location is inactive. Refresh the queue.',409,'TICKET_NOT_EDITABLE');
  let dateKey=getDateKey(branch.observed_at,branch.timezone || 'Asia/Manila');
  if (branch.queue_lifecycle_mode==='enforced') {
    const day=(await client.query(`SELECT id::text,to_char(business_date,'YYYYMMDD') AS date_key,
      current_closes_at>clock_timestamp() AS before_deadline FROM queue_days
      WHERE tenant_id=$1 AND location_id=$2 AND state='open' ORDER BY business_date DESC,id DESC LIMIT 1 ${lock?'FOR SHARE':''}`,
    [scope.tenantId,scope.locationId])).rows[0];
    if (!day?.before_deadline || row.current_queue_day_id!==day.id) fail('This ticket is not in the current open Queue Day. Refresh the queue.',409,'TICKET_NOT_EDITABLE');
    dateKey=day.date_key;
  }
  const closed=(await client.query(`SELECT EXISTS(SELECT 1 FROM queue_day_closures
    WHERE tenant_id=$1 AND location_id=$2 AND queue_date_key=$3 AND reopened_at IS NULL) AS closed`,[scope.tenantId,scope.locationId,dateKey])).rows[0].closed;
  if (closed || row.date_key!==dateKey) fail('This queue is closed or the ticket belongs to another Queue Day. Refresh the queue.',409,'TICKET_NOT_EDITABLE');
}
function createQueueTicketDetailsService({pool}) {
  function scopeFor(tenant,location,actorUserId,ticketId) {
    const scope={tenantId:String(tenant._id),locationId:String(location._id),actorUserId:String(actorUserId)};
    if (![scope.tenantId,scope.locationId,scope.actorUserId,ticketId].every(validId)) fail('A valid scoped ticket is required.',400,'INVALID_TICKET_DETAILS');
    return scope;
  }
  async function get(tenant,location,actorUserId,ticketId) {
    const scope=scopeFor(tenant,location,actorUserId,ticketId);const client=await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      if (!await readAuthorizedVendorQueueActor(client,scope,'tenant.ticket.update_state')) fail('Ticket operation is not authorized.',403,'TICKET_DETAILS_FORBIDDEN');
      const row=await repository.read(client,scope,ticketId);assertEditable(row);
      await assertLegacyTicket(client,{_id:ticketId,tenantId:scope.tenantId,locationId:scope.locationId});
      await assertOperationsOpen(client,scope,row);
      const result=dto(row);await client.query('COMMIT');
      await client.query('BEGIN READ ONLY');
      if (!await readAuthorizedVendorQueueActor(client,scope,'tenant.ticket.update_state')) fail('Ticket operation is not authorized.',403,'TICKET_DETAILS_FORBIDDEN');
      await client.query('COMMIT');return result;
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  }
  async function patch(tenant,location,actorUserId,ticketId,body) {
    const scope=scopeFor(tenant,location,actorUserId,ticketId);const details=validateBody(body);
    return withVendorQueueTransaction({pool,tenant,location,actorUserId,lockTenantActivity:true},async client=>{
      const row=await repository.read(client,scope,ticketId,{forUpdate:true});assertEditable(row);
      await assertLegacyTicket(client,{_id:ticketId,tenantId:scope.tenantId,locationId:scope.locationId});
      if (row.status!==body.expectedStatus || version(row)!==body.version) fail('Ticket details changed while the editor was open. Refresh and review before saving again.',409,'TICKET_DETAILS_CHANGED');
      await assertOperationsOpen(client,scope,row,{lock:true});
      const changedFields=['customerName','notes'].filter(key=>details[key]!==row[key==='customerName'?'customer_name':'notes']);
      if (!changedFields.length) return dto(row);
      const updated=await repository.update(client,scope,ticketId,details);
      await events.createQueueEvent({ticketId,tenantId:scope.tenantId,locationId:scope.locationId,queueDateKey:row.date_key,
        eventType:'ticket_details_updated',fromStatus:row.status,toStatus:row.status,actorUserId,actorRole:'vendor',source:'vendor',
        metadata:{changedFields}}, {client});
      await client.query('UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2',[scope.tenantId,scope.locationId]);
      return dto(updated);
    });
  }
  return {get,patch};
}
module.exports={createQueueTicketDetailsService,validateBody};
