const db = require("../config/db");

const QUEUE_DAY_CLOSURE_COLUMNS = `
  id,
  tenant_id,
  location_id,
  queue_date_key,
  next_queue_date_key,
  closed_at,
  closure_reason,
  affected_ticket_ids,
  waiting_carried_count,
  called_unserved_count,
  closed_by_user_id,
  reopened_by_user_id,
  reopened_at,
  created_at,
  updated_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function mapQueueDayClosure(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    queueDateKey: row.queue_date_key,
    nextQueueDateKey: row.next_queue_date_key || row.queue_date_key,
    closureReason: row.closure_reason || "",
    affectedTicketIds: Array.isArray(row.affected_ticket_ids)
      ? row.affected_ticket_ids.map((value) => String(value))
      : [],
    waitingCarriedCount: row.waiting_carried_count || 0,
    calledUnservedCount: row.called_unserved_count || 0,
    closedByUserId: row.closed_by_user_id ? String(row.closed_by_user_id) : null,
    reopenedByUserId: row.reopened_by_user_id ? String(row.reopened_by_user_id) : null,
    reopenedAt: row.reopened_at,
    closedAt: row.closed_at || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findActiveClosure(tenantId, locationId, queueDateKey, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${QUEUE_DAY_CLOSURE_COLUMNS}
      FROM queue_day_closures
      WHERE tenant_id = $1
        AND location_id = $2
        AND queue_date_key = $3
        AND reopened_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [Number(tenantId), Number(locationId), queueDateKey]
  );

  return mapQueueDayClosure(result.rows[0]);
}

async function createClosure(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO queue_day_closures (
        tenant_id,
        location_id,
        queue_date_key,
        next_queue_date_key,
        closure_reason,
        affected_ticket_ids,
        waiting_carried_count,
        called_unserved_count,
        closed_by_user_id,
        closed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::BIGINT[], $7, $8, $9, NOW())
      ON CONFLICT (tenant_id, location_id, queue_date_key)
      DO UPDATE SET
        next_queue_date_key = EXCLUDED.next_queue_date_key,
        closure_reason = EXCLUDED.closure_reason,
        affected_ticket_ids = EXCLUDED.affected_ticket_ids,
        waiting_carried_count = EXCLUDED.waiting_carried_count,
        called_unserved_count = EXCLUDED.called_unserved_count,
        closed_by_user_id = EXCLUDED.closed_by_user_id,
        reopened_by_user_id = NULL,
        reopened_at = NULL,
        closed_at = NOW(),
        updated_at = NOW()
      RETURNING ${QUEUE_DAY_CLOSURE_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.locationId),
      data.queueDateKey,
      data.nextQueueDateKey || data.queueDateKey,
      data.closureReason || null,
      (data.affectedTicketIds || []).map((value) => Number(value)),
      Number(data.waitingCarriedCount || 0),
      Number(data.calledUnservedCount || 0),
      data.closedByUserId ? Number(data.closedByUserId) : null
    ]
  );

  return mapQueueDayClosure(result.rows[0]);
}

async function reopenClosure(closureId, reopenedByUserId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE queue_day_closures
      SET reopened_by_user_id = $2,
          reopened_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND reopened_at IS NULL
      RETURNING ${QUEUE_DAY_CLOSURE_COLUMNS}
    `,
    [Number(closureId), reopenedByUserId ? Number(reopenedByUserId) : null]
  );

  return mapQueueDayClosure(result.rows[0]);
}

module.exports = {
  findActiveClosure,
  createClosure,
  reopenClosure,
  mapQueueDayClosure
};
