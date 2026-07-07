const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapCounter(row) {
  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    locationId: String(row.location_id),
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    assignedUserIds: row.assigned_user_ids || []
  };
}

async function listCountersByLocationId(locationId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        service_counters.*,
        COALESCE(
          ARRAY_AGG(service_counter_assignments.user_id::text)
            FILTER (WHERE service_counter_assignments.user_id IS NOT NULL),
          ARRAY[]::text[]
        ) AS assigned_user_ids
      FROM service_counters
      LEFT JOIN service_counter_assignments ON service_counter_assignments.counter_id = service_counters.id
      WHERE location_id = $1
      GROUP BY service_counters.id
      ORDER BY service_counters.created_at ASC
    `,
    [Number(locationId)]
  );
  return result.rows.map(mapCounter);
}

async function createCounter(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO service_counters (tenant_id, location_id, name, slug, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [Number(data.tenantId), Number(data.locationId), data.name, data.slug, Boolean(data.isActive)]
  );
  return mapCounter({ ...result.rows[0], assigned_user_ids: [] });
}

async function findCounterByLocationAndSlug(locationId, slug, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT
        service_counters.*,
        COALESCE(
          ARRAY_AGG(service_counter_assignments.user_id::text)
            FILTER (WHERE service_counter_assignments.user_id IS NOT NULL),
          ARRAY[]::text[]
        ) AS assigned_user_ids
      FROM service_counters
      LEFT JOIN service_counter_assignments ON service_counter_assignments.counter_id = service_counters.id
      WHERE service_counters.location_id = $1 AND service_counters.slug = $2
      GROUP BY service_counters.id
      LIMIT 1
    `,
    [Number(locationId), slug]
  );
  return mapCounter(result.rows[0]);
}

async function isCounterSlugAvailable(locationId, slug, excludeCounterId = null, options = {}) {
  const normalizedSlug = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (!normalizedSlug) {
    return { available: false, valid: false, message: "Enter a counter slug." };
  }

  const queryClient = buildQueryClient(options.client);
  const values = [Number(locationId), normalizedSlug];
  let query = `
    SELECT id
    FROM service_counters
    WHERE location_id = $1 AND slug = $2
  `;

  if (excludeCounterId) {
    values.push(Number(excludeCounterId));
    query += ` AND id <> $${values.length}`;
  }

  query += " LIMIT 1";

  const result = await queryClient.query(query, values);
  return {
    available: result.rows.length === 0,
    valid: Boolean(normalizedSlug),
    message: result.rows.length === 0 ? "Slug is available." : "That counter slug is already taken."
  };
}

async function updateCounter(counterId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      UPDATE service_counters
      SET name = $2, slug = $3, is_active = $4
      WHERE id = $1
      RETURNING *
    `,
    [Number(counterId), changes.name, changes.slug, Boolean(changes.isActive)]
  );
  return mapCounter({ ...result.rows[0], assigned_user_ids: [] });
}

async function deleteCounter(counterId, options = {}) {
  await buildQueryClient(options.client).query(
    `DELETE FROM service_counters WHERE id = $1`,
    [Number(counterId)]
  );
}

async function listAssignedCounterIdsByUserIds(userIds, options = {}) {
  if (!userIds.length) {
    return new Map();
  }

  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT user_id, ARRAY_AGG(counter_id::text ORDER BY counter_id) AS counter_ids
      FROM service_counter_assignments
      WHERE user_id = ANY($1::bigint[])
      GROUP BY user_id
    `,
    [userIds.map(Number)]
  );

  return new Map(result.rows.map((row) => [String(row.user_id), row.counter_ids || []]));
}

async function replaceAssignments(counterId, userIds, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(`DELETE FROM service_counter_assignments WHERE counter_id = $1`, [Number(counterId)]);
  for (const userId of userIds || []) {
    await queryClient.query(
      `INSERT INTO service_counter_assignments (counter_id, user_id) VALUES ($1, $2)`,
      [Number(counterId), Number(userId)]
    );
  }
}

module.exports = {
  listCountersByLocationId,
  findCounterByLocationAndSlug,
  isCounterSlugAvailable,
  createCounter,
  updateCounter,
  deleteCounter,
  replaceAssignments,
  listAssignedCounterIdsByUserIds
};
