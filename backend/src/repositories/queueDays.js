const db = require("../config/db");

const QUEUE_DAY_COLUMNS = `
  id, tenant_id, location_id, business_date::text AS business_date, state, intake_mode,
  timezone_snapshot, effective_opens_at, effective_closes_at,
  initial_closes_at, current_closes_at, opened_at, opened_by_user_id,
  closed_at, closed_by_user_id, close_reason, close_source, closure_note,
  last_reopened_at, last_reopened_by_user_id, reopen_reason,
  version, deadline_version, next_sequence, last_reconciled_at,
  reconciliation_attempt_count, last_reconciliation_error,
  created_at, updated_at
`;

function mapQueueDay(row) {
  if (!row) {
    return null;
  }
  const businessDate = row.business_date instanceof Date
    ? row.business_date.toISOString().slice(0, 10)
    : String(row.business_date).slice(0, 10);
  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    businessDate,
    state: row.state,
    intakeMode: row.intake_mode,
    timezone: row.timezone_snapshot,
    effectiveOpensAt: row.effective_opens_at,
    effectiveClosesAt: row.effective_closes_at,
    initialClosesAt: row.initial_closes_at,
    currentClosesAt: row.current_closes_at,
    openedAt: row.opened_at,
    openedByUserId: row.opened_by_user_id ? String(row.opened_by_user_id) : null,
    closedAt: row.closed_at,
    closedByUserId: row.closed_by_user_id ? String(row.closed_by_user_id) : null,
    closeReason: row.close_reason,
    closeSource: row.close_source,
    closureNote: row.closure_note,
    lastReopenedAt: row.last_reopened_at,
    lastReopenedByUserId: row.last_reopened_by_user_id
      ? String(row.last_reopened_by_user_id)
      : null,
    reopenReason: row.reopen_reason,
    version: Number(row.version),
    deadlineVersion: Number(row.deadline_version),
    nextSequence: Number(row.next_sequence),
    lastReconciledAt: row.last_reconciled_at,
    reconciliationAttemptCount: Number(row.reconciliation_attempt_count || 0),
    lastReconciliationError: row.last_reconciliation_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function queryClient(client) {
  return client || db.pool;
}

async function findByScope(tenantId, locationId, businessDate, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const result = await queryClient(options.client).query(
    `SELECT ${QUEUE_DAY_COLUMNS}
     FROM queue_days
     WHERE tenant_id = $1 AND location_id = $2 AND business_date = $3${lock}`,
    [Number(tenantId), Number(locationId), businessDate]
  );
  return mapQueueDay(result.rows[0]);
}

async function findById(id, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const result = await queryClient(options.client).query(
    `SELECT ${QUEUE_DAY_COLUMNS} FROM queue_days WHERE id = $1${lock}`,
    [Number(id)]
  );
  return mapQueueDay(result.rows[0]);
}

async function findLatestByLocation(tenantId, locationId, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  const stateFilter = options.state ? " AND state = $3" : "";
  const values = [Number(tenantId), Number(locationId)];
  if (options.state) {
    values.push(options.state);
  }
  const result = await queryClient(options.client).query(
    `SELECT ${QUEUE_DAY_COLUMNS}
     FROM queue_days
     WHERE tenant_id = $1 AND location_id = $2${stateFilter}
     ORDER BY business_date DESC, id DESC
     LIMIT 1${lock}`,
    values
  );
  return mapQueueDay(result.rows[0]);
}

async function insertUnopened(data, options = {}) {
  const result = await queryClient(options.client).query(
    `INSERT INTO queue_days (tenant_id, location_id, business_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, location_id, business_date) DO NOTHING
     RETURNING ${QUEUE_DAY_COLUMNS}`,
    [Number(data.tenantId), Number(data.locationId), data.businessDate]
  );
  return mapQueueDay(result.rows[0]);
}

async function lockOrCreate(data, options = {}) {
  await insertUnopened(data, options);
  return findByScope(data.tenantId, data.locationId, data.businessDate, {
    client: options.client,
    forUpdate: true
  });
}

async function transitionOpen(queueDayId, data, options = {}) {
  const values = [
    Number(queueDayId),
    data.timezone,
    data.effectiveOpensAt,
    data.effectiveClosesAt,
    data.actorUserId ? Number(data.actorUserId) : null,
    data.expectedVersion == null ? null : Number(data.expectedVersion)
  ];
  const result = await queryClient(options.client).query(
    `UPDATE queue_days
     SET state = 'open',
         intake_mode = 'accepting',
         timezone_snapshot = $2,
         effective_opens_at = $3,
         effective_closes_at = $4,
         initial_closes_at = $4,
         current_closes_at = $4,
         opened_at = NOW(),
         opened_by_user_id = $5,
         closed_at = NULL,
         closed_by_user_id = NULL,
         close_reason = NULL,
         close_source = NULL,
         closure_note = NULL,
         version = version + 1,
         deadline_version = 1,
         updated_at = NOW()
     WHERE id = $1
       AND state = 'unopened'
       AND ($6::INTEGER IS NULL OR version = $6)
     RETURNING ${QUEUE_DAY_COLUMNS}`,
    values
  );
  return mapQueueDay(result.rows[0]);
}

async function setIntakeMode(queueDayId, intakeMode, expectedVersion, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE queue_days
     SET intake_mode = $2,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $1
       AND state = 'open'
       AND ($3::INTEGER IS NULL OR version = $3)
     RETURNING ${QUEUE_DAY_COLUMNS}`,
    [Number(queueDayId), intakeMode, expectedVersion == null ? null : Number(expectedVersion)]
  );
  return mapQueueDay(result.rows[0]);
}

async function extendDeadline(queueDayId, data, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE queue_days
     SET current_closes_at = current_closes_at + INTERVAL '30 minutes',
         version = version + 1,
         deadline_version = deadline_version + 1,
         updated_at = NOW()
     WHERE id = $1
       AND state = 'open'
       AND current_closes_at > NOW()
       AND current_closes_at <= NOW() + INTERVAL '15 minutes'
       AND ($2::INTEGER IS NULL OR version = $2)
     RETURNING ${QUEUE_DAY_COLUMNS}`,
    [Number(queueDayId), data.expectedVersion == null ? null : Number(data.expectedVersion)]
  );
  return mapQueueDay(result.rows[0]);
}

async function close(queueDayId, data, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE queue_days
     SET state = 'closed',
         intake_mode = NULL,
         closed_at = COALESCE(closed_at, NOW()),
         closed_by_user_id = COALESCE($2, closed_by_user_id),
         close_reason = COALESCE(close_reason, $3),
         close_source = COALESCE(close_source, $4),
         closure_note = COALESCE(closure_note, $5),
         version = version + 1,
         last_reconciled_at = NOW(),
         reconciliation_attempt_count = reconciliation_attempt_count + 1,
         last_reconciliation_error = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND state = 'open'
       AND ($6::INTEGER IS NULL OR version = $6)
     RETURNING ${QUEUE_DAY_COLUMNS}`,
    [
      Number(queueDayId),
      data.actorUserId ? Number(data.actorUserId) : null,
      data.reason,
      data.source,
      data.note || null,
      data.expectedVersion == null ? null : Number(data.expectedVersion)
    ]
  );
  return mapQueueDay(result.rows[0]);
}

async function reopen(queueDayId, data, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE queue_days
     SET state = 'open',
         intake_mode = 'accepting',
         closed_at = NULL,
         closed_by_user_id = NULL,
         close_reason = NULL,
         close_source = NULL,
         closure_note = NULL,
         last_reopened_at = NOW(),
         last_reopened_by_user_id = $2,
         reopen_reason = $3,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $1
       AND state = 'closed'
       AND close_source = 'manual'
       AND current_closes_at > NOW()
       AND ($4::INTEGER IS NULL OR version = $4)
     RETURNING ${QUEUE_DAY_COLUMNS}`,
    [
      Number(queueDayId),
      data.actorUserId ? Number(data.actorUserId) : null,
      data.reason,
      data.expectedVersion == null ? null : Number(data.expectedVersion)
    ]
  );
  return mapQueueDay(result.rows[0]);
}

async function allocateSequence(queueDayId, options = {}) {
  const result = await queryClient(options.client).query(
    `UPDATE queue_days
     SET next_sequence = next_sequence + 1, updated_at = NOW()
     WHERE id = $1 AND state = 'open' AND intake_mode = 'accepting'
     RETURNING next_sequence - 1 AS sequence`,
    [Number(queueDayId)]
  );
  return result.rows[0] ? Number(result.rows[0].sequence) : null;
}

async function listDue(limit = 50, options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT ${QUEUE_DAY_COLUMNS}
     FROM queue_days
     WHERE state = 'open' AND current_closes_at <= NOW()
       AND EXISTS (
         SELECT 1 FROM store_locations
         WHERE store_locations.id = queue_days.location_id
           AND store_locations.queue_lifecycle_mode = 'enforced'
       )
     ORDER BY current_closes_at, id
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [Math.max(1, Math.min(Number(limit) || 50, 200))]
  );
  return result.rows.map(mapQueueDay);
}

async function listDueCandidateIds(limit = 50, options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT id
     FROM queue_days
     WHERE state = 'open' AND current_closes_at <= NOW()
       AND EXISTS (
         SELECT 1 FROM store_locations
         WHERE store_locations.id = queue_days.location_id
           AND store_locations.queue_lifecycle_mode = 'enforced'
       )
     ORDER BY current_closes_at, id
     LIMIT $1`,
    [Math.max(1, Math.min(Number(limit) || 50, 200))]
  );
  return result.rows.map((row) => String(row.id));
}

async function recordReconciliationError(id, errorMessage, options = {}) {
  await queryClient(options.client).query(
    `UPDATE queue_days
     SET reconciliation_attempt_count = reconciliation_attempt_count + 1,
         last_reconciliation_error = $2,
         updated_at = NOW()
     WHERE id = $1 AND state = 'open'`,
    [Number(id), String(errorMessage || "Reconciliation failed").slice(0, 500)]
  );
}

async function listWarningCandidates(limit = 100, options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT ${QUEUE_DAY_COLUMNS}
     FROM queue_days
     WHERE state = 'open'
       AND current_closes_at > NOW()
       AND current_closes_at <= NOW() + INTERVAL '15 minutes'
       AND EXISTS (
         SELECT 1 FROM store_locations
         WHERE store_locations.id = queue_days.location_id
           AND store_locations.queue_lifecycle_mode = 'enforced'
       )
     ORDER BY current_closes_at, id
     LIMIT $1`,
    [Math.max(1, Math.min(Number(limit) || 100, 500))]
  );
  return result.rows.map(mapQueueDay);
}

async function listDiagnostics(options = {}) {
  const values = [Math.max(1, Math.min(Number(options.limit) || 100, 250))];
  const filters = [];
  if (options.state) {
    values.push(options.state);
    filters.push(`queue_days.state = $${values.length}`);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await queryClient(options.client).query(
    `SELECT ${QUEUE_DAY_COLUMNS},
            (
              SELECT COUNT(*)::INTEGER
              FROM tickets
              WHERE tickets.current_queue_day_id = queue_days.id
                AND tickets.status IN ('waiting', 'called', 'skipped')
            ) AS unresolved_ticket_count,
            (
              SELECT COUNT(*)::INTEGER
              FROM queue_notification_outbox
              WHERE queue_notification_outbox.queue_day_id = queue_days.id
                AND status IN ('pending', 'retry', 'dead')
            ) AS notification_backlog_count
     FROM queue_days
     ${whereClause}
     ORDER BY business_date DESC, id DESC
     LIMIT $1`,
    values
  );
  return result.rows.map((row) => ({
    ...mapQueueDay(row),
    unresolvedTicketCount: Number(row.unresolved_ticket_count || 0),
    notificationBacklogCount: Number(row.notification_backlog_count || 0)
  }));
}

module.exports = {
  allocateSequence,
  close,
  extendDeadline,
  findById,
  findByScope,
  findLatestByLocation,
  insertUnopened,
  listDue,
  listDueCandidateIds,
  listDiagnostics,
  listWarningCandidates,
  lockOrCreate,
  mapQueueDay,
  reopen,
  recordReconciliationError,
  setIntakeMode,
  transitionOpen
};
