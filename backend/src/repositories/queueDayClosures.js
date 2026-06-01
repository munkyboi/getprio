const db = require("../config/db");

const CLOSURE_COLUMNS = `
  id,
  tenant_id,
  location_id,
  queue_date_key,
  next_queue_date_key,
  closed_by_user_id,
  reason,
  waiting_carried_count,
  called_unserved_count,
  closed_at,
  reopened_by_user_id,
  reopened_at,
  created_at,
  updated_at
`;

function mapClosure(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    queueDateKey: row.queue_date_key,
    nextQueueDateKey: row.next_queue_date_key,
    closedByUserId: row.closed_by_user_id ? String(row.closed_by_user_id) : null,
    reason: row.reason || "",
    waitingCarriedCount: Number(row.waiting_carried_count || 0),
    calledUnservedCount: Number(row.called_unserved_count || 0),
    closedAt: row.closed_at,
    reopenedByUserId: row.reopened_by_user_id ? String(row.reopened_by_user_id) : null,
    reopenedAt: row.reopened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildQueryClient(client) {
  return client || db.pool;
}

async function findClosure(tenantId, locationId, queueDateKey, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${CLOSURE_COLUMNS}
      FROM queue_day_closures
      WHERE tenant_id = $1 AND location_id = $2 AND queue_date_key = $3
        AND reopened_at IS NULL
      LIMIT 1
    `,
    [Number(tenantId), Number(locationId), String(queueDateKey)]
  );

  return mapClosure(result.rows[0]);
}

async function findClosureById(closureId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${CLOSURE_COLUMNS}
      FROM queue_day_closures
      WHERE id = $1
      LIMIT 1
    `,
    [Number(closureId)]
  );

  return mapClosure(result.rows[0]);
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
        closed_by_user_id,
        reason,
        waiting_carried_count,
        called_unserved_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (tenant_id, location_id, queue_date_key) DO UPDATE
      SET next_queue_date_key = EXCLUDED.next_queue_date_key,
          closed_by_user_id = EXCLUDED.closed_by_user_id,
          reason = EXCLUDED.reason,
          waiting_carried_count = 0,
          called_unserved_count = 0,
          closed_at = NOW(),
          reopened_by_user_id = NULL,
          reopened_at = NULL
      RETURNING ${CLOSURE_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.locationId),
      String(data.queueDateKey),
      String(data.nextQueueDateKey),
      data.closedByUserId ? Number(data.closedByUserId) : null,
      data.reason || null,
      Number(data.waitingCarriedCount || 0),
      Number(data.calledUnservedCount || 0)
    ]
  );

  return mapClosure(result.rows[0]);
}

async function updateClosureCounts(closureId, counts, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE queue_day_closures
      SET waiting_carried_count = $2,
          called_unserved_count = $3
      WHERE id = $1
      RETURNING ${CLOSURE_COLUMNS}
    `,
    [
      Number(closureId),
      Number(counts.waitingCarriedCount || 0),
      Number(counts.calledUnservedCount || 0)
    ]
  );

  return mapClosure(result.rows[0]);
}

async function reopenClosure(tenantId, locationId, queueDateKey, reopenedByUserId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE queue_day_closures
      SET reopened_by_user_id = $4,
          reopened_at = NOW()
      WHERE tenant_id = $1
        AND location_id = $2
        AND queue_date_key = $3
        AND reopened_at IS NULL
      RETURNING ${CLOSURE_COLUMNS}
    `,
    [
      Number(tenantId),
      Number(locationId),
      String(queueDateKey),
      reopenedByUserId ? Number(reopenedByUserId) : null
    ]
  );

  return mapClosure(result.rows[0]);
}

module.exports = {
  createClosure,
  findClosureById,
  findClosure,
  reopenClosure,
  updateClosureCounts
};
