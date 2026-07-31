const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapQueueEvent(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    ticketId: row.ticket_id ? String(row.ticket_id) : null,
    tenantId: String(row.tenant_id),
    locationId: row.location_id ? String(row.location_id) : null,
    queueDateKey: row.queue_date_key,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorRole: row.actor_role,
    source: row.source,
    metadata: row.metadata || {},
    queueDayId: row.queue_day_id ? String(row.queue_day_id) : null,
    eventKey: row.event_key || null,
    correlationKey: row.correlation_key || null,
    reasonCode: row.reason_code || null,
    deadlineVersion: row.deadline_version == null ? null : Number(row.deadline_version),
    previousState: row.previous_state || null,
    nextState: row.next_state || null,
    staffNote: row.staff_note || null,
    createdAt: row.created_at
  };
}

const QUEUE_EVENT_COLUMNS = `
  id,
  ticket_id,
  tenant_id,
  location_id,
  queue_date_key,
  event_type,
  from_status,
  to_status,
  actor_user_id,
  actor_role,
  source,
  metadata,
  queue_day_id,
  event_key,
  correlation_key,
  reason_code,
  deadline_version,
  previous_state,
  next_state,
  staff_note,
  created_at
`;

async function createQueueEvent(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO queue_events (
        ticket_id,
        tenant_id,
        location_id,
        queue_date_key,
        event_type,
        from_status,
        to_status,
        actor_user_id,
        actor_role,
        source,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING ${QUEUE_EVENT_COLUMNS}
    `,
    [
      data.ticketId ? Number(data.ticketId) : null,
      Number(data.tenantId),
      data.locationId ? Number(data.locationId) : null,
      data.queueDateKey,
      data.eventType,
      data.fromStatus || null,
      data.toStatus || null,
      data.actorUserId ? Number(data.actorUserId) : null,
      data.actorRole || null,
      data.source,
      data.metadata || {}
    ]
  );

  return mapQueueEvent(result.rows[0]);
}

async function createLifecycleEvent(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO queue_events (
        ticket_id, tenant_id, location_id, queue_date_key, event_type,
        from_status, to_status, actor_user_id, actor_role, source, metadata,
        queue_day_id, event_key, correlation_key, reason_code, deadline_version,
        previous_state, next_state, staff_note
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19
      )
      ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING
      RETURNING ${QUEUE_EVENT_COLUMNS}
    `,
    [
      data.ticketId ? Number(data.ticketId) : null,
      Number(data.tenantId),
      data.locationId ? Number(data.locationId) : null,
      data.queueDateKey,
      data.eventType,
      data.fromStatus || null,
      data.toStatus || null,
      data.actorUserId ? Number(data.actorUserId) : null,
      data.actorRole || null,
      data.source || "system",
      data.metadata || {},
      data.queueDayId ? Number(data.queueDayId) : null,
      data.eventKey,
      data.correlationKey || null,
      data.reasonCode || null,
      data.deadlineVersion == null ? null : Number(data.deadlineVersion),
      data.previousState || null,
      data.nextState || null,
      data.staffNote || null
    ]
  );
  return mapQueueEvent(result.rows[0]);
}

async function findLatestLifecycleEvent(queueDayId, eventType, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `SELECT ${QUEUE_EVENT_COLUMNS}
     FROM queue_events
     WHERE queue_day_id = $1
       AND event_type = $2
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [Number(queueDayId), eventType]
  );
  return mapQueueEvent(result.rows[0]);
}

module.exports = {
  createQueueEvent,
  createLifecycleEvent,
  findLatestLifecycleEvent,
  mapQueueEvent
};
