const db = require("../config/db");

const QUEUE_DAY_PAUSE_COLUMNS = `
  id,
  tenant_id,
  location_id,
  queue_date_key,
  pause_reason,
  pause_mode,
  paused_by_user_id,
  resumed_by_user_id,
  paused_at,
  resumed_at,
  created_at,
  updated_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function mapQueueDayPause(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    queueDateKey: row.queue_date_key,
    pauseReason: row.pause_reason || "",
    pauseMode: row.pause_mode || "manual",
    pausedByUserId: row.paused_by_user_id ? String(row.paused_by_user_id) : null,
    resumedByUserId: row.resumed_by_user_id ? String(row.resumed_by_user_id) : null,
    pausedAt: row.paused_at || row.created_at,
    resumedAt: row.resumed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function findActivePause(tenantId, locationId, queueDateKey, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${QUEUE_DAY_PAUSE_COLUMNS}
      FROM queue_day_pauses
      WHERE tenant_id = $1
        AND location_id = $2
        AND queue_date_key = $3
        AND resumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [Number(tenantId), Number(locationId), queueDateKey]
  );

  return mapQueueDayPause(result.rows[0]);
}

async function createPause(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO queue_day_pauses (
        tenant_id,
        location_id,
        queue_date_key,
        pause_reason,
        pause_mode,
        paused_by_user_id,
        paused_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (tenant_id, location_id, queue_date_key)
      WHERE resumed_at IS NULL
      DO UPDATE SET
        pause_reason = EXCLUDED.pause_reason,
        pause_mode = EXCLUDED.pause_mode,
        paused_by_user_id = EXCLUDED.paused_by_user_id,
        resumed_by_user_id = NULL,
        resumed_at = NULL,
        paused_at = NOW(),
        updated_at = NOW()
      RETURNING ${QUEUE_DAY_PAUSE_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.locationId),
      data.queueDateKey,
      data.pauseReason || null,
      data.pauseMode || "manual",
      data.pausedByUserId ? Number(data.pausedByUserId) : null
    ]
  );

  return mapQueueDayPause(result.rows[0]);
}

async function resumePause(pauseId, resumedByUserId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE queue_day_pauses
      SET resumed_by_user_id = $2,
          resumed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND resumed_at IS NULL
      RETURNING ${QUEUE_DAY_PAUSE_COLUMNS}
    `,
    [Number(pauseId), resumedByUserId ? Number(resumedByUserId) : null]
  );

  return mapQueueDayPause(result.rows[0]);
}

module.exports = {
  findActivePause,
  createPause,
  resumePause,
  mapQueueDayPause
};
