const db = require("../config/db");
const storeLocationRepository = require("./storeLocations");

const TENANT_COLUMNS = `
  id,
  name,
  slug,
  queue_prefix,
  average_service_minutes,
  notification_threshold,
  auto_pause_enabled,
  auto_pause_threshold,
  auto_resume_enabled,
  auto_resume_vacancy_percent,
  contact_email,
  contact_phone,
  is_active,
  created_at,
  updated_at
`;

function mapTenant(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    name: row.name,
    slug: row.slug,
    queuePrefix: row.queue_prefix,
    averageServiceMinutes: row.average_service_minutes,
    notificationThreshold: row.notification_threshold,
    autoPauseEnabled: row.auto_pause_enabled,
    autoPauseThreshold: row.auto_pause_threshold,
    autoResumeEnabled: row.auto_resume_enabled,
    autoResumeVacancyPercent: row.auto_resume_vacancy_percent,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildQueryClient(client) {
  return client || db.pool;
}

async function findTenantBySlug(slug, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const whereClause = options.activeOnly ? "slug = $1 AND is_active = TRUE" : "slug = $1";
  const result = await queryClient.query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE ${whereClause} LIMIT 1`,
    [slug]
  );

  return mapTenant(result.rows[0]);
}

async function findTenantById(id, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE id = $1 LIMIT 1`,
    [Number(id)]
  );

  return mapTenant(result.rows[0]);
}

async function findTenantsByIds(ids, options = {}) {
  const tenantIds = [...new Set(ids.filter(Boolean).map((id) => Number(id)))];
  if (!tenantIds.length) {
    return [];
  }

  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${TENANT_COLUMNS} FROM tenants WHERE id = ANY($1::bigint[]) ORDER BY name ASC`,
    [tenantIds]
  );

  return result.rows.map(mapTenant);
}

async function createTenant(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO tenants (
        name,
        slug,
        queue_prefix,
        average_service_minutes,
        notification_threshold,
        auto_pause_enabled,
        auto_pause_threshold,
        auto_resume_enabled,
        auto_resume_vacancy_percent,
        contact_email,
        contact_phone,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${TENANT_COLUMNS}
    `,
    [
      data.name,
      data.slug,
      data.queuePrefix || "P",
      data.averageServiceMinutes ?? 5,
      data.notificationThreshold ?? 2,
      data.autoPauseEnabled ?? false,
      data.autoPauseThreshold ?? null,
      data.autoResumeEnabled ?? false,
      data.autoResumeVacancyPercent ?? null,
      data.contactEmail || null,
      data.contactPhone || null,
      data.isActive ?? true
    ]
  );

  const tenant = mapTenant(result.rows[0]);
  const location = await storeLocationRepository.createLocation(
    {
      tenantId: tenant._id,
      name: "Main location",
      slug: "main",
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      isPrimary: true,
      isActive: true
    },
    { client: queryClient }
  );
  await storeLocationRepository.createAlwaysOpenHours(location._id, { client: queryClient });

  return tenant;
}

async function updateTenant(tenantId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const updates = [];
  const values = [Number(tenantId)];

  const setters = {
    name: "name",
    slug: "slug",
    queuePrefix: "queue_prefix",
    averageServiceMinutes: "average_service_minutes",
    notificationThreshold: "notification_threshold",
    autoPauseEnabled: "auto_pause_enabled",
    autoPauseThreshold: "auto_pause_threshold",
    autoResumeEnabled: "auto_resume_enabled",
    autoResumeVacancyPercent: "auto_resume_vacancy_percent",
    contactEmail: "contact_email",
    contactPhone: "contact_phone",
    isActive: "is_active"
  };

  for (const [key, column] of Object.entries(setters)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) {
      continue;
    }

    values.push(changes[key]);
    updates.push(`${column} = $${values.length}`);
  }

  if (!updates.length) {
    return findTenantById(tenantId, { client: queryClient });
  }

  const result = await queryClient.query(
    `
      UPDATE tenants
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING ${TENANT_COLUMNS}
    `,
    values
  );

  return mapTenant(result.rows[0]);
}

module.exports = {
  mapTenant,
  findTenantBySlug,
  findTenantById,
  findTenantsByIds,
  createTenant,
  updateTenant
};
