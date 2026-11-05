// Confirmation records a credential-verified arrival; it never starts a stage
// or changes resource promises. All resource mutations retain their plan boundary.
async function assertConfirmationScope(client, ticket) {
 const plan=(await client.query(`SELECT p.contract_version,a.state AS stage_state,a.started_at
  FROM ticket_service_plans p JOIN queue_stage_attempts a ON a.id=p.stage_attempt_id
  WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.ticket_id=$3 FOR UPDATE OF p,a`,
  [ticket.tenantId,ticket.locationId,ticket._id])).rows[0];
 if(plan&&(![2,3,4].includes(Number(plan.contract_version))||ticket.status!=='called'||ticket.serviceStartedAt||plan.started_at||plan.stage_state!=='called'))
  throw Object.assign(new Error('Only the current unstarted call can be confirmed. Reload the request.'),{statusCode:409,code:'INVALID_STATE'});
}
module.exports={assertConfirmationScope};
