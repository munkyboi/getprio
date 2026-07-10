const db = require("../config/db");
const queueLifecycle = require("../services/queueLifecycle");

const TICKET_COLUMNS = `
  id,
  tenant_id,
  location_id,
  user_id,
  service_counter_id,
  ticket_number,
  sequence,
  date_key,
  queue_date_key,
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
  unserved_at,
  carried_over_at,
  carry_over_count,
  service_priority_band,
  rejoin_deadline_at,
  created_at,
  updated_at
`;

const WAITING_PRIORITY_ORDER = "CASE service_priority_band WHEN 'carry_over' THEN 0 WHEN 'recovery' THEN 1 WHEN 'checked_in_booking' THEN 2 ELSE 3 END ASC, carry_over_count DESC, created_at ASC";

function mapTicket(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: row.location_id ? String(row.location_id) : null,
    userId: row.user_id ? String(row.user_id) : null,
    serviceCounterId: row.service_counter_id ? String(row.service_counter_id) : null,
    ticketNumber: row.ticket_number,
    sequence: row.sequence,
    dateKey: row.date_key,
    queueDateKey: row.queue_date_key,
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
    unservedAt: row.unserved_at,
    carriedOverAt: row.carried_over_at,
    carryOverCount: row.carry_over_count || 0,
    servicePriorityBand: row.service_priority_band || "normal",
    linkedBookingReference: row.linked_booking_reference || null,
    rejoinDeadlineAt: row.rejoin_deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function withLinkedBookingReferenceSelect() {
  return `
    ${TICKET_COLUMNS},
    (
      SELECT bookings.reference
      FROM bookings
      WHERE bookings.queue_ticket_id = tickets.id
      LIMIT 1
    ) AS linked_booking_reference
  `;
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
        location_id,
        user_id,
        ticket_number,
        sequence,
        date_key,
        queue_date_key,
        lookup_code,
        customer_name,
        customer_email,
        customer_phone,
        notify_by_email,
        notify_by_sms,
        join_channel,
        status,
        notes,
        carried_over_at,
        carry_over_count,
        service_priority_band,
        rejoin_deadline_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING ${TICKET_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.locationId),
      data.userId ? Number(data.userId) : null,
      data.ticketNumber,
      data.sequence,
      data.dateKey,
      data.dateKey,
      data.lookupCode,
      data.customerName,
      data.customerEmail || null,
      data.customerPhone || null,
      Boolean(data.notifyByEmail),
      Boolean(data.notifyBySms),
      data.joinChannel || "online",
      data.status || "waiting",
      data.notes || null,
      data.carriedOverAt || null,
      Number(data.carryOverCount || 0),
      data.servicePriorityBand || "normal",
      data.rejoinDeadlineAt || null
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

async function findTicketById(ticketId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = $1 LIMIT 1`,
    [Number(ticketId)]
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
  let locationFilter = "";
  let dateFilter = "";
  let carryOverFilter = "";

  if (options.locationId) {
    values.push(Number(options.locationId));
    locationFilter = `AND location_id = $${values.length}`;
  }

  if (options.dateKey) {
    values.push(String(options.dateKey));
    dateFilter = `AND date_key = $${values.length}`;
  }

  if (options.onlyCarriedOver) {
    carryOverFilter = "AND (carried_over_at IS NOT NULL OR COALESCE(carry_over_count, 0) > 0)";
  } else if (options.excludeCarriedOver) {
    carryOverFilter = "AND carried_over_at IS NULL AND COALESCE(carry_over_count, 0) = 0";
  }

  let query = `SELECT ${withLinkedBookingReferenceSelect()} FROM tickets WHERE tenant_id = $1 ${locationFilter} ${dateFilter} ${carryOverFilter} AND status = 'waiting' ORDER BY ${WAITING_PRIORITY_ORDER}`;

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
  const values = [Number(tenantId), ["served", "skipped", "cancelled"], limit];
  let dateFilter = "";
  let locationFilter = "";

  if (options.locationId) {
    values.push(Number(options.locationId));
    locationFilter = `AND location_id = $${values.length}`;
  }

  if (options.historyDays) {
    values.push(Number(options.historyDays));
    dateFilter = `AND updated_at >= NOW() - ($${values.length}::int * INTERVAL '1 day')`;
  }

  if (options.dateKey) {
    values.push(String(options.dateKey));
    dateFilter += ` AND date_key = $${values.length}`;
  }

  const result = await queryClient.query(
    `
      SELECT ${TICKET_COLUMNS}
      FROM tickets
      WHERE tenant_id = $1 AND status = ANY($2::text[])
      ${locationFilter}
      ${dateFilter}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $3
    `,
    values
  );

  return result.rows.map(mapTicket);
}

async function listSkippedTickets(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Number(options.limit || 20);
  const values = [Number(tenantId), limit];
  let locationFilter = "";
  let dateFilter = "";

  if (options.locationId) {
    values.push(Number(options.locationId));
    locationFilter = `AND location_id = $${values.length}`;
  }

  if (options.dateKey) {
    values.push(String(options.dateKey));
    dateFilter = `AND date_key = $${values.length}`;
  }

  const result = await queryClient.query(
    `
      SELECT ${TICKET_COLUMNS}
      FROM tickets
      WHERE tenant_id = $1
        AND status = 'skipped'
        ${locationFilter}
        ${dateFilter}
      ORDER BY COALESCE(rejoin_deadline_at, updated_at) DESC, updated_at DESC
      LIMIT $2
    `,
    values
  );

  return result.rows.map(mapTicket);
}

async function listClientTickets(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Number(options.limit || 500);
  const values = [Number(tenantId), limit];
  let dateFilter = "";
  let locationFilter = "";

  if (options.locationId) {
    values.push(Number(options.locationId));
    locationFilter = `AND location_id = $${values.length}`;
  }

  if (options.historyDays) {
    values.push(Number(options.historyDays));
    dateFilter = `AND updated_at >= NOW() - ($${values.length}::int * INTERVAL '1 day')`;
  }

  const result = await queryClient.query(
    `
      SELECT ${TICKET_COLUMNS}
      FROM tickets
      WHERE tenant_id = $1
      ${locationFilter}
      ${dateFilter}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $2
    `,
    values
  );

  return result.rows.map(mapTicket);
}

async function listTicketsByUserId(userId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const limit = Number(options.limit || 50);
  const result = await queryClient.query(
    `
      SELECT
        tickets.*,
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug,
        store_locations.name AS location_name,
        store_locations.slug AS location_slug
      FROM tickets
      INNER JOIN tenants ON tenants.id = tickets.tenant_id
      INNER JOIN store_locations ON store_locations.id = tickets.location_id
      WHERE tickets.user_id = $1
      ORDER BY tickets.created_at DESC
      LIMIT $2
    `,
    [Number(userId), limit]
  );

  return result.rows.map((row) => ({
    ...mapTicket(row),
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    locationName: row.location_name,
    locationSlug: row.location_slug
  }));
}

async function listTicketsForCustomerAccount(user, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [Number(user._id)];
  const identityFilters = [`tickets.user_id = $1`];

  if (user.email) {
    values.push(String(user.email).trim().toLowerCase());
    identityFilters.push(`LOWER(COALESCE(tickets.customer_email, '')) = $${values.length}`);
  }

  if (user.phone) {
    values.push(String(user.phone).trim());
    identityFilters.push(`tickets.customer_phone = $${values.length}`);
  }

  const whereClause = identityFilters.map((filter) => `(${filter})`).join(" OR ");

  if (options.page || options.pageSize || options.offset !== undefined) {
    const pageSize = Math.min(Math.max(Number(options.pageSize || options.limit || 10) || 10, 1), 100);
    const offset = Math.max(Number(options.offset || 0) || 0, 0);
    const countResult = await queryClient.query(
      `
        SELECT COUNT(*)::int AS count
        FROM tickets
        WHERE ${whereClause}
      `,
      values
    );
    const listValues = [...values, pageSize, offset];
    const result = await queryClient.query(
      `
        SELECT
          tickets.*,
          tenants.name AS tenant_name,
          tenants.slug AS tenant_slug,
          store_locations.name AS location_name,
          store_locations.slug AS location_slug
        FROM tickets
        INNER JOIN tenants ON tenants.id = tickets.tenant_id
        INNER JOIN store_locations ON store_locations.id = tickets.location_id
        WHERE ${whereClause}
        ORDER BY tickets.created_at DESC
        LIMIT $${listValues.length - 1} OFFSET $${listValues.length}
      `,
      listValues
    );

    return {
      tickets: result.rows.map((row) => ({
        ...mapTicket(row),
        tenantName: row.tenant_name,
        tenantSlug: row.tenant_slug,
        locationName: row.location_name,
        locationSlug: row.location_slug
      })),
      totalItems: Number(countResult.rows[0]?.count || 0)
    };
  }

  const limit = Number(options.limit || 50);
  values.push(limit);

  const result = await queryClient.query(
    `
      SELECT
        tickets.*,
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug,
        store_locations.name AS location_name,
        store_locations.slug AS location_slug
      FROM tickets
      INNER JOIN tenants ON tenants.id = tickets.tenant_id
      INNER JOIN store_locations ON store_locations.id = tickets.location_id
      WHERE ${whereClause}
      ORDER BY tickets.created_at DESC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map((row) => ({
    ...mapTicket(row),
    tenantName: row.tenant_name,
    tenantSlug: row.tenant_slug,
    locationName: row.location_name,
    locationSlug: row.location_slug
  }));
}

async function countServedToday(tenantId, dateKey, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [Number(tenantId), dateKey];
  let locationFilter = "";

  if (options.locationId) {
    values.push(Number(options.locationId));
    locationFilter = `AND location_id = $${values.length}`;
  }

  const result = await queryClient.query(
    `
      SELECT COUNT(*)::int AS count
      FROM tickets
      WHERE tenant_id = $1 AND status = 'served' AND date_key = $2 ${locationFilter}
    `,
    values
  );

  return result.rows[0]?.count || 0;
}

async function findCurrentCalledTicket(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [Number(tenantId)];
  let locationFilter = "";
  let dateFilter = "";

  if (options.locationId) {
    values.push(Number(options.locationId));
    locationFilter = `AND location_id = $${values.length}`;
  }

  if (options.dateKey) {
    values.push(String(options.dateKey));
    dateFilter = `AND date_key = $${values.length}`;
  }

  const result = await queryClient.query(
    `
      SELECT ${withLinkedBookingReferenceSelect()}
      FROM tickets
      WHERE tenant_id = $1 ${locationFilter} ${dateFilter} AND status = 'called'
      ORDER BY called_at ASC NULLS LAST, created_at ASC
      LIMIT 1
    `,
    values
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
        WHERE tenant_id = $1 AND location_id = $2 AND date_key = $4 AND status = 'waiting'
        ORDER BY ${WAITING_PRIORITY_ORDER}
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE tickets
      SET status = 'called', called_at = NOW(), notified_called_at = NOW(), service_counter_id = $3
      WHERE id IN (SELECT id FROM next_ticket)
      RETURNING ${TICKET_COLUMNS}
    `,
    [
      Number(tenantId),
      Number(options.locationId),
      options.serviceCounterId ? Number(options.serviceCounterId) : null,
      String(options.dateKey)
    ]
  );

  return mapTicket(result.rows[0]);
}

async function updateCurrentCalledTicketStatus(tenantId, status, options = {}) {
  const queryClient = buildQueryClient(options.client);
  queueLifecycle.assertSupportedCurrentTicketResolution(status);
  const timestampColumnByStatus = {
    served: "served_at",
    skipped: "skipped_at",
    cancelled: "cancelled_at",
    unserved: "unserved_at"
  };
  const timestampColumn = timestampColumnByStatus[status];

  const result = await queryClient.query(
    `
      WITH current_ticket AS (
        SELECT id
        FROM tickets
        WHERE tenant_id = $1 AND location_id = $3 AND date_key = $4 AND status = 'called'
        ORDER BY called_at ASC NULLS LAST, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE tickets
      SET status = $2,
          ${timestampColumn} = NOW(),
          service_priority_band = CASE
            WHEN $2 = 'skipped' THEN 'normal'
            WHEN $2 IN ('served', 'cancelled', 'unserved') THEN 'normal'
            ELSE service_priority_band
          END,
          rejoin_deadline_at = CASE
            WHEN $2 = 'skipped' THEN $5::timestamptz
            WHEN $2 IN ('served', 'cancelled', 'unserved') THEN NULL
            ELSE rejoin_deadline_at
          END
      WHERE id IN (SELECT id FROM current_ticket)
      RETURNING ${TICKET_COLUMNS}
    `,
    [
      Number(tenantId),
      status,
      Number(options.locationId),
      String(options.dateKey),
      options.rejoinDeadlineAt || null
    ]
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

async function claimTicketForUser(ticketId, userId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE tickets
      SET user_id = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${TICKET_COLUMNS}
    `,
    [Number(ticketId), Number(userId)]
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

async function listTicketsForQueueClosure(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${TICKET_COLUMNS}
      FROM tickets
      WHERE tenant_id = $1
        AND location_id = $2
        AND date_key = $3
        AND status = ANY($4::text[])
      ORDER BY
        CASE status WHEN 'called' THEN 0 ELSE 1 END,
        called_at ASC NULLS LAST,
        created_at ASC
    `,
    [Number(tenantId), Number(options.locationId), String(options.dateKey), ["called", "waiting"]]
  );

  return result.rows.map(mapTicket);
}

async function markTicketsUnservedForClosure(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const ticketIds = (options.ticketIds || []).map((value) => Number(value)).filter(Boolean);
  if (ticketIds.length === 0) {
    return [];
  }

  const result = await queryClient.query(
    `
      UPDATE tickets
      SET status = 'unserved',
          unserved_at = NOW(),
          service_counter_id = NULL
      WHERE tenant_id = $1
        AND location_id = $2
        AND date_key = $3
        AND id = ANY($4::BIGINT[])
        AND status = ANY($5::text[])
      RETURNING ${TICKET_COLUMNS}
    `,
    [
      Number(tenantId),
      Number(options.locationId),
      String(options.dateKey),
      ticketIds,
      ["called", "waiting"]
    ]
  );

  return result.rows.map(mapTicket);
}

async function reopenTicketsFromClosure(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const ticketIds = (options.ticketIds || []).map((value) => Number(value)).filter(Boolean);
  if (ticketIds.length === 0) {
    return [];
  }

  const result = await queryClient.query(
    `
      UPDATE tickets
      SET status = 'waiting',
          service_counter_id = NULL,
          called_at = NULL,
          notified_called_at = NULL,
          unserved_at = NULL,
          service_priority_band = 'normal',
          rejoin_deadline_at = NULL
      WHERE tenant_id = $1
        AND location_id = $2
        AND date_key = $3
        AND id = ANY($4::BIGINT[])
        AND status = 'unserved'
      RETURNING ${TICKET_COLUMNS}
    `,
    [Number(tenantId), Number(options.locationId), String(options.dateKey), ticketIds]
  );

  return result.rows.map(mapTicket);
}

async function restoreCarriedOverTicketsFromClosure(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const ticketIds = (options.ticketIds || []).map((value) => Number(value)).filter(Boolean);
  const shouldFilterByIds = ticketIds.length > 0;

  const result = await queryClient.query(
    `
      UPDATE tickets
      SET date_key = $4,
          queue_date_key = $4,
          carried_over_at = NULL,
          carry_over_count = GREATEST(COALESCE(carry_over_count, 0) - 1, 0),
          service_priority_band = 'normal',
          updated_at = NOW()
      WHERE tenant_id = $1
        AND location_id = $2
        AND date_key = $3
        AND status = 'waiting'
        AND (carried_over_at IS NOT NULL OR COALESCE(carry_over_count, 0) > 0)
        ${shouldFilterByIds ? "AND id = ANY($5::BIGINT[])" : ""}
      RETURNING ${TICKET_COLUMNS}
    `,
    shouldFilterByIds
      ? [
          Number(tenantId),
          Number(options.locationId),
          String(options.fromDateKey),
          String(options.toDateKey),
          ticketIds
        ]
      : [
          Number(tenantId),
          Number(options.locationId),
          String(options.fromDateKey),
          String(options.toDateKey)
        ]
  );

  return result.rows.map(mapTicket);
}

async function carryOverWaitingTickets(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const ticketIds = (options.ticketIds || []).map((value) => Number(value)).filter(Boolean);
  if (ticketIds.length === 0) {
    return [];
  }

  const result = await queryClient.query(
    `
      UPDATE tickets
      SET date_key = $4,
          queue_date_key = $4,
          carried_over_at = NOW(),
          carry_over_count = COALESCE(carry_over_count, 0) + 1,
          service_priority_band = 'carry_over',
          rejoin_deadline_at = NULL,
          updated_at = NOW()
      WHERE tenant_id = $1
        AND location_id = $2
        AND date_key = $3
        AND id = ANY($5::BIGINT[])
        AND status = 'waiting'
      RETURNING ${TICKET_COLUMNS}
    `,
    [
      Number(tenantId),
      Number(options.locationId),
      String(options.fromDateKey),
      String(options.toDateKey),
      ticketIds
    ]
  );

  return result.rows.map(mapTicket);
}

async function restoreSkippedTicket(tenantId, ticketId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE tickets
      SET status = 'waiting',
          service_counter_id = NULL,
          called_at = NULL,
          notified_called_at = NULL,
          service_priority_band = $4,
          rejoin_deadline_at = NULL,
          updated_at = NOW()
      WHERE tenant_id = $1
        AND location_id = $2
        AND id = $3
        AND status = 'skipped'
      RETURNING ${TICKET_COLUMNS}
    `,
    [
      Number(tenantId),
      Number(options.locationId),
      Number(ticketId),
      options.servicePriorityBand || "recovery"
    ]
  );

  return mapTicket(result.rows[0]);
}

module.exports = {
  mapTicket,
  createTicket,
  findTicketById,
  findTicketByLookupCode,
  findTicketByTenantAndLookupCode,
  listWaitingTickets,
  listHistoryTickets,
  listSkippedTickets,
  listClientTickets,
  listTicketsByUserId,
  listTicketsForCustomerAccount,
  countServedToday,
  findCurrentCalledTicket,
  callNextWaitingTicket,
  updateCurrentCalledTicketStatus,
  cancelWaitingTicket,
  claimTicketForUser,
  markTicketNotifiedAlmostThere,
  listTicketsForQueueClosure,
  markTicketsUnservedForClosure,
  reopenTicketsFromClosure,
  restoreCarriedOverTicketsFromClosure,
  carryOverWaitingTickets,
  restoreSkippedTicket
};
