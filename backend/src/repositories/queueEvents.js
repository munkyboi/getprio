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

module.exports = {
  createQueueEvent,
  mapQueueEvent
};
