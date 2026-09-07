const db = require("../config/db");

const BLOCK_COLUMNS = `
  id,
  tenant_id,
  location_id,
  service_id,
  weekday,
  starts_at,
  ends_at,
  ends_next_day,
  capacity,
  is_active,
  notes,
  created_at,
  updated_at
`;

const EXCEPTION_COLUMNS = `
  id,
  tenant_id,
  location_id,
  service_id,
  exception_date,
  starts_at,
  ends_at,
  is_available,
  capacity,
  reason,
  created_at,
  updated_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function mapTime(value) {
  return value ? String(value).slice(0, 5) : "";
}

function mapBlock(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    serviceId: row.service_id ? String(row.service_id) : null,
    weekday: Number(row.weekday),
    startsAt: mapTime(row.starts_at),
    endsAt: mapTime(row.ends_at),
    endsNextDay: Boolean(row.ends_next_day),
    capacity: Number(row.capacity),
    isActive: Boolean(row.is_active),
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapException(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    serviceId: row.service_id ? String(row.service_id) : null,
    exceptionDate: row.exception_date,
    startsAt: mapTime(row.starts_at),
    endsAt: mapTime(row.ends_at),
    isAvailable: Boolean(row.is_available),
    capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
    reason: row.reason || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listAvailabilityByLocation(tenantId, locationId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const [blocksResult, exceptionsResult] = await Promise.all([
    queryClient.query(
      `
        SELECT ${BLOCK_COLUMNS}
        FROM vendor_availability_blocks
        WHERE tenant_id = $1 AND location_id = $2
        ORDER BY weekday ASC, starts_at ASC, ends_at ASC
      `,
      [Number(tenantId), Number(locationId)]
    ),
    queryClient.query(
      `
        SELECT ${EXCEPTION_COLUMNS}
        FROM vendor_availability_exceptions
        WHERE tenant_id = $1 AND location_id = $2
        ORDER BY exception_date ASC, starts_at ASC NULLS FIRST
      `,
      [Number(tenantId), Number(locationId)]
    )
  ]);

  return {
    blocks: blocksResult.rows.map(mapBlock),
    exceptions: exceptionsResult.rows.map(mapException)
  };
}

async function findBlockByTenantAndId(tenantId, blockId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${BLOCK_COLUMNS}
      FROM vendor_availability_blocks
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
    `,
    [Number(tenantId), Number(blockId)]
  );

  return mapBlock(result.rows[0]);
}

async function createBlock(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO vendor_availability_blocks (
        tenant_id,
        location_id,
        service_id,
        weekday,
        starts_at,
        ends_at,
        ends_next_day,
        capacity,
        is_active,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${BLOCK_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.locationId),
      data.serviceId ? Number(data.serviceId) : null,
      Number(data.weekday),
      data.startsAt,
      data.endsAt,
      Boolean(data.endsNextDay),
      Number(data.capacity || 1),
      data.isActive !== false,
      data.notes || null
    ]
  );

  return mapBlock(result.rows[0]);
}

async function updateBlock(blockId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const updates = [];
  const values = [Number(blockId)];
  const setters = {
    locationId: "location_id",
    serviceId: "service_id",
    weekday: "weekday",
    startsAt: "starts_at",
    endsAt: "ends_at",
    endsNextDay: "ends_next_day",
    capacity: "capacity",
    isActive: "is_active",
    notes: "notes"
  };

  for (const [key, column] of Object.entries(setters)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) {
      continue;
    }

    let value = changes[key];
    if (key === "locationId" || key === "serviceId") {
      value = value ? Number(value) : null;
    }
    if (key === "notes" && value === "") {
      value = null;
    }
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (!updates.length) {
    const result = await queryClient.query(
      `SELECT ${BLOCK_COLUMNS} FROM vendor_availability_blocks WHERE id = $1 LIMIT 1`,
      [Number(blockId)]
    );
    return mapBlock(result.rows[0]);
  }

  const result = await queryClient.query(
    `
      UPDATE vendor_availability_blocks
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING ${BLOCK_COLUMNS}
    `,
    values
  );

  return mapBlock(result.rows[0]);
}

async function deleteBlock(blockId, options = {}) {
  await buildQueryClient(options.client).query(
    `DELETE FROM vendor_availability_blocks WHERE id = $1`,
    [Number(blockId)]
  );
}

async function findExceptionByTenantAndId(tenantId, exceptionId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${EXCEPTION_COLUMNS}
      FROM vendor_availability_exceptions
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
    `,
    [Number(tenantId), Number(exceptionId)]
  );

  return mapException(result.rows[0]);
}

async function createException(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO vendor_availability_exceptions (
        tenant_id,
        location_id,
        service_id,
        exception_date,
        starts_at,
        ends_at,
        is_available,
        capacity,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${EXCEPTION_COLUMNS}
    `,
    [
      Number(data.tenantId),
      Number(data.locationId),
      data.serviceId ? Number(data.serviceId) : null,
      data.exceptionDate,
      data.startsAt || null,
      data.endsAt || null,
      data.isAvailable === true,
      data.capacity === null || data.capacity === undefined ? null : Number(data.capacity),
      data.reason || null
    ]
  );

  return mapException(result.rows[0]);
}

async function updateException(exceptionId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const updates = [];
  const values = [Number(exceptionId)];
  const setters = {
    locationId: "location_id",
    serviceId: "service_id",
    exceptionDate: "exception_date",
    startsAt: "starts_at",
    endsAt: "ends_at",
    isAvailable: "is_available",
    capacity: "capacity",
    reason: "reason"
  };

  for (const [key, column] of Object.entries(setters)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) {
      continue;
    }

    let value = changes[key];
    if (key === "locationId" || key === "serviceId") {
      value = value ? Number(value) : null;
    }
    if ((key === "startsAt" || key === "endsAt" || key === "reason") && value === "") {
      value = null;
    }
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  const result = await queryClient.query(
    `
      UPDATE vendor_availability_exceptions
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING ${EXCEPTION_COLUMNS}
    `,
    values
  );

  return mapException(result.rows[0]);
}

async function deleteException(exceptionId, options = {}) {
  await buildQueryClient(options.client).query(
    `DELETE FROM vendor_availability_exceptions WHERE id = $1`,
    [Number(exceptionId)]
  );
}

module.exports = {
  listAvailabilityByLocation,
  findBlockByTenantAndId,
  createBlock,
  updateBlock,
  deleteBlock,
  findExceptionByTenantAndId,
  createException,
  updateException,
  deleteException
};
