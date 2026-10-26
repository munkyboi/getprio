const db=require('../config/db');
const STATES=new Set(['pending','awaiting_readiness','awaiting_arrival','waiting','called','in_service','paused','completed','interrupted','cancelled','skipped']);
// Caller must first authenticate ownership or validate opaque ticket access.
// Every read retains tenant+location+ticket scope from that authorized record.
async function forTicket(ticket,{client=db.pool}={}){
 if(!ticket?._id||!ticket.tenantId||!ticket.locationId)return null;
 const args=[String(ticket.tenantId),String(ticket.locationId),String(ticket._id)];
 const plan=(await client.query(`SELECT p.stage_attempt_id FROM ticket_service_plans p WHERE p.tenant_id=$1 AND p.location_id=$2 AND p.ticket_id=$3 AND p.workflow_mode='multi_station'`,args)).rows[0];
 if(!plan)return null;
 const rows=(await client.query(`SELECT a.id,a.ordinal,a.label,a.state,
 CASE WHEN a.state='waiting' AND a.station_queue_sequence IS NOT NULL THEN
 (SELECT count(*)::int FROM queue_stage_attempts w JOIN ticket_service_plans wp ON wp.stage_attempt_id=w.id
 WHERE w.tenant_id=a.tenant_id AND w.location_id=a.location_id AND w.station_id=a.station_id AND w.state='waiting'
 AND w.station_queue_date_key=a.station_queue_date_key AND w.station_queue_sequence<=a.station_queue_sequence) ELSE NULL END AS queue_position
 FROM queue_stage_attempts a WHERE (a.tenant_id,a.location_id,a.ticket_id)=($1,$2,$3)
 AND NOT EXISTS(SELECT 1 FROM queue_stage_attempts newer WHERE newer.ticket_id=a.ticket_id AND newer.stage_id=a.stage_id AND newer.attempt>a.attempt)
 AND a.state<>'superseded' ORDER BY a.ordinal`,args)).rows;
 if(!rows.length||rows.some(row=>!STATES.has(row.state)))return null;
 const current=rows.find(row=>String(row.id)===String(plan.stage_attempt_id));if(!current)return null;
 const reference=String(ticket.ticketNumber);
 return {contract:'queue-journey-progress-v1',reference,currentStage:Number(current.ordinal),stages:rows.map(row=>({ordinal:Number(row.ordinal),label:String(row.label||'Service station').slice(0,120),state:row.state,reference:`${reference}-${row.ordinal}`,queuePosition:row.state==='waiting'&&Number.isInteger(row.queue_position)&&row.queue_position>0?row.queue_position:null}))};
}
async function attach(snapshot,ticket,options){
 if(!snapshot?.focusTicket||String(snapshot.focusTicket.id)!==String(ticket?._id))return snapshot;
 const journey=await forTicket(ticket,options);if(!journey)return snapshot;
 const current=journey.stages.find(stage=>stage.ordinal===journey.currentStage);
 return {...snapshot,focusTicket:{...snapshot.focusTicket,journey,position:current?.queuePosition||null,estimatedWaitMinutes:0}};
}
module.exports={forTicket,attach};
