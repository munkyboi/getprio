const db = require("../config/db");
const ledgerRepository = require("../repositories/resourceLedger");
const queueEvents = require("../repositories/queueEvents");
const outbox = require("../repositories/queueNotificationOutbox");

// Advisory scanning and the locked reread share these eligibility predicates.
// Historical/actual execution requires reconciliation, never implicit release.
const ELIGIBLE = `t.status='pending_carry_over' AND t.carry_over_expires_at <= clock_timestamp()
  AND t.service_started_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM resource_allocations a
    WHERE (a.tenant_id,a.location_id,a.ticket_id)=(t.tenant_id,t.location_id,t.id))
  AND NOT EXISTS (SELECT 1 FROM resource_ledger_reservations r JOIN bookings b
    ON (b.id,b.tenant_id,b.location_id)=(r.booking_id,r.tenant_id,r.location_id)
    LEFT JOIN ticket_service_plans p ON (p.booking_id,p.tenant_id,p.location_id)=(b.id,b.tenant_id,b.location_id) AND p.source='booking'
    WHERE r.tenant_id=t.tenant_id AND r.location_id=t.location_id
      AND (b.queue_ticket_id=t.id OR p.ticket_id=t.id)
      AND (r.state='converted' OR (r.state='protected' AND b.queue_ticket_id IS DISTINCT FROM t.id)))`;

function safeIdentity(value) {
  if (!/^[1-9]\d{0,18}$/u.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw Object.assign(new Error("Carry-over identity requires reconciliation."), { statusCode: 400 });
  }
  return String(value);
}

async function expirePendingCarryOvers(limit = 100) {
  const requested = Number(limit);
  const bounded = Number.isFinite(requested) ? Math.max(1, Math.min(Math.floor(requested) || 100, 500)) : 100;
  const candidates = await db.pool.query(`SELECT t.id::text,t.tenant_id::text,t.location_id::text
    FROM tickets t WHERE ${ELIGIBLE} ORDER BY t.carry_over_expires_at,t.id LIMIT $1`, [bounded]);
  let expired = 0;
  for (const candidate of candidates.rows) {
    const ticketId = safeIdentity(candidate.id);
    const scope = { tenantId: safeIdentity(candidate.tenant_id), locationId: safeIdentity(candidate.location_id) };
    const changed = await ledgerRepository.withCarryOverExpiryTransaction({ pool: db.pool, ...scope, ticketId }, async (client, ledger) => {
      const ticket = (await client.query(`SELECT t.id::text,t.user_id::text,t.notify_by_email,t.carry_over_expires_at
        FROM tickets t WHERE t.tenant_id=$1 AND t.location_id=$2 AND t.id=$3 AND ${ELIGIBLE}
        FOR UPDATE OF t SKIP LOCKED`, [scope.tenantId, scope.locationId, ticketId])).rows[0];
      if (!ticket) return false;
      const bookings = await client.query(`SELECT id::text FROM bookings
        WHERE tenant_id=$1 AND location_id=$2 AND queue_ticket_id=$3 ORDER BY id FOR UPDATE`, [scope.tenantId, scope.locationId, ticketId]);
      await client.query(`UPDATE tickets SET status='expired',status_reason='carry_over_window_expired',
        terminal_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND location_id=$2 AND id=$3`, [scope.tenantId, scope.locationId, ticketId]);
      for (const booking of bookings.rows) {
        const bindings = await client.query(`SELECT id::text FROM resource_ledger_reservations
          WHERE tenant_id=$1 AND location_id=$2 AND booking_id=$3 AND state='protected' ORDER BY id FOR UPDATE`,
        [scope.tenantId, scope.locationId, booking.id]);
        for (const binding of bindings.rows) {
          await ledger.executeCommand({ operationKey: `ticket:${ticketId}:reservation:${binding.id}:carry-over-expiry`,
            command: "cancelReservation", payload: { reservationId: binding.id } });
        }
      }
      await client.query(`UPDATE bookings SET status='unfulfilled',fulfillment_outcome_reason='carry_over_window_expired',
        refund_eligible=TRUE,fulfillment_resolved_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE tenant_id=$1 AND location_id=$2 AND queue_ticket_id=$3
          AND status NOT IN ('completed','canceled','reviewed','disputed')`, [scope.tenantId, scope.locationId, ticketId]);
      const event = await queueEvents.createLifecycleEvent({
        ticketId, ...scope, queueDateKey: "pending", eventType: "ticket_expired",
        fromStatus: "pending_carry_over", toStatus: "expired", source: "system", reasonCode: "carry_over_window_expired",
        eventKey: `ticket:${ticketId}:pending-expiry:${new Date(ticket.carry_over_expires_at).toISOString()}`
      }, { client });
      if (event) {
        safeIdentity(event._id);
        const base = { queueEventId: event._id, ticketId, tenantId: scope.tenantId, templateName: "ticket_expired",
          payload: { ticketId, reasonCode: "carry_over_window_expired" } };
        const intents = [{ channel: "web_push", recipientKey: ticket.user_id ? `user:${ticket.user_id}` : `ticket:${ticketId}` }];
        if (ticket.user_id) intents.push({ channel: "fcm", recipientKey: `user:${ticket.user_id}` });
        if (ticket.notify_by_email) intents.push({ channel: "email", recipientKey: `ticket:${ticketId}:email` });
        for (const intent of intents) await outbox.enqueue({ ...base, ...intent,
          idempotencyKey: `${event.eventKey}:customer:${intent.channel}` }, { client });
      }
      await client.query("UPDATE resource_ledger_scopes SET revision=revision+1 WHERE tenant_id=$1 AND location_id=$2", [scope.tenantId, scope.locationId]);
      return true;
    });
    if (changed) expired++;
  }
  return expired;
}
module.exports = { expirePendingCarryOvers };
