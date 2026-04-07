const db = require("../config/db");

const TICKET_COLUMNS = `
  id,
  tenant_id,
  user_id,
  ticket_number,
  sequence,
  date_key,
  lookup_code,
  customer_name,
  customer_email,
  customer_phone,
  notify_by_email,
  notify_by_sms,
  join_channel,
  status,
  notes,
  notified_almost_there_at,
  notified_called_at,
  called_at,
  served_at,
  skipped_at,
  cancelled_at,
  created_at,
  updated_at
`;

function mapTicket(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    userId: row.user_id ? String(row.user_id) : null,
    ticketNumber: row.ticket_number,
    sequence: row.sequence,
    dateKey: row.date_key,
    lookupCode: row.lookup_code,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notifyByEmail: row.notify_by_email,
    notifyBySms: row.notify_by_sms,
    joinChannel: row.join_channel,
    status: row.status,
    notes: row.notes,
    notifiedAlmostThereAt: row.notified_almost_there_at,
    notifiedCalledAt: row.notified_called_at,
    calledAt: row.called_at,
    servedAt: row.served_at,
    skippedAt: row.skipped_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildQueryClient(client) {
  return client || db.pool;
}

async function createTicket(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO tickets (
        tenant_id,
        user_id,
        ticket_number,
        sequence,
        date_key,
        lookup_code,
        customer_name,
        customer_email,
        customer_phone,
        notify_by_email,
        notify_by_sms,
        join_channel,
        status,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING ${TICKET_COLUMNS}
    `,
    [
      Number(data.tenantId),
      data.userId ? Number(data.userId) : null,
      data.ticketNumber,
      data.sequence,
      data.dateKey,
      data.lookupCode,
      data.customerName,
      data.customerEmail || null,
      data.customerPhone || null,
      Boolean(data.notifyByEmail),
      Boolean(data.notifyBySms),
      data.joinChannel || "online",
      data.status || "waiting",
      data.notes || null
    ]
  );

  return mapTicket(result.rows[0]);
}

async function findTicketByLookupCode(lookupCode, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${TICKET_COLUMNS} FROM tickets WHERE lookup_code = $1 LIMIT 1`,
    [lookupCode]
  );

  return mapTicket(result.rows[0]);
}

async function findTicketByTenantAndLookupCode(tenantId, lookupCode, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${TICKET_COLUMNS} FROM tickets WHERE tenant_id = $1 AND lookup_code = $2 LIMIT 1`,
    [Number(tenantId), lookupCode]
  );

  return mapTicket(result.rows[0]);
}

async function listWaitingTickets(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [Number(tenantId)];
  let query = `SELECT ${TICKET_COLUMNS} FROM tickets WHERE tenant_id = $1 AND status = 'waiting' ORDER BY created_at ASC`;

  if (options.limit) {
    values.push(Number(options.limit));
    query += ` LIMIT $${values.length}`;
  }

  const result = await queryClient.query(query, values);
  return result.rows.map(mapTicket);
}

async function listHistoryTickets(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Number(options.limit || 10);
  const result = await queryClient.query(
    `
      SELECT ${TICKET_COLUMNS}
      FROM tickets
      WHERE tenant_id = $1 AND status = ANY($2::text[])
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $3
    `,
    [Number(tenantId), ["served", "skipped", "cancelled"], limit]
  );

  return result.rows.map(mapTicket);
}

async function countServedToday(tenantId, dateKey, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT COUNT(*)::int AS count
      FROM tickets
      WHERE tenant_id = $1 AND status = 'served' AND date_key = $2
    `,
    [Number(tenantId), dateKey]
  );

  return result.rows[0]?.count || 0;
}

async function findCurrentCalledTicket(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${TICKET_COLUMNS}
      FROM tickets
      WHERE tenant_id = $1 AND status = 'called'
      ORDER BY called_at ASC NULLS LAST, created_at ASC
      LIMIT 1
    `,
    [Number(tenantId)]
  );

  return mapTicket(result.rows[0]);
}

async function callNextWaitingTicket(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      WITH next_ticket AS (
        SELECT id
        FROM tickets
        WHERE tenant_id = $1 AND status = 'waiting'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE tickets
      SET status = 'called', called_at = NOW(), notified_called_at = NOW()
      WHERE id IN (SELECT id FROM next_ticket)
      RETURNING ${TICKET_COLUMNS}
    `,
    [Number(tenantId)]
  );

  return mapTicket(result.rows[0]);
}

async function updateCurrentCalledTicketStatus(tenantId, status, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const timestampColumnByStatus = {
    served: "served_at",
    skipped: "skipped_at",
    cancelled: "cancelled_at"
  };
  const timestampColumn = timestampColumnByStatus[status];

  if (!timestampColumn) {
    throw new Error("Unsupported ticket status update.");
  }

  const result = await queryClient.query(
    `
      WITH current_ticket AS (
        SELECT id
        FROM tickets
        WHERE tenant_id = $1 AND status = 'called'
        ORDER BY called_at ASC NULLS LAST, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE tickets
      SET status = $2, ${timestampColumn} = NOW()
      WHERE id IN (SELECT id FROM current_ticket)
      RETURNING ${TICKET_COLUMNS}
    `,
    [Number(tenantId), status]
  );

  return mapTicket(result.rows[0]);
}

async function cancelWaitingTicket(tenantId, lookupCode, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      WITH cancellable_ticket AS (
        SELECT id
        FROM tickets
        WHERE tenant_id = $1 AND lookup_code = $2 AND status = 'waiting'
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE tickets
      SET status = 'cancelled', cancelled_at = NOW()
      WHERE id IN (SELECT id FROM cancellable_ticket)
      RETURNING ${TICKET_COLUMNS}
    `,
    [Number(tenantId), lookupCode]
  );

  return mapTicket(result.rows[0]);
}

async function markTicketNotifiedAlmostThere(ticketId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE tickets
      SET notified_almost_there_at = NOW()
      WHERE id = $1
      RETURNING ${TICKET_COLUMNS}
    `,
    [Number(ticketId)]
  );

  return mapTicket(result.rows[0]);
}

module.exports = {
  mapTicket,
  createTicket,
  findTicketByLookupCode,
  findTicketByTenantAndLookupCode,
  listWaitingTickets,
  listHistoryTickets,
  countServedToday,
  findCurrentCalledTicket,
  callNextWaitingTicket,
  updateCurrentCalledTicketStatus,
  cancelWaitingTicket,
  markTicketNotifiedAlmostThere
};
