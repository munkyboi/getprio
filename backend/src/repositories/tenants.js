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
  public_profile_enabled,
  public_profile_description,
  public_profile_category,
  public_profile_image_url,
  vendor_approval_status,
  notification_settings,
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
    publicProfileEnabled: row.public_profile_enabled,
    publicProfileDescription: row.public_profile_description || "",
    publicProfileCategory: row.public_profile_category || "",
    publicProfileImageUrl: row.public_profile_image_url || "",
    vendorApprovalStatus: row.vendor_approval_status || "approved",
    notificationSettings: row.notification_settings || {},
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPublicVendorProfile(row) {
  if (!row) {
    return null;
  }

  const locations = Array.isArray(row.locations)
      ? row.locations.map((location) => ({
        name: location.name || "",
        slug: location.slug || "",
        city: location.city || "",
        province: location.province || "",
        country: location.country || "Philippines",
        addressLine1: location.addressLine1 || "",
        addressLine2: location.addressLine2 || "",
        isPrimary: Boolean(location.isPrimary),
        imageUrl: location.imageUrl || "",
        hours: Array.isArray(location.hours)
          ? location.hours.map((hour) => ({
              weekday: Number(hour.weekday),
              opensAt: hour.opensAt || "",
              closesAt: hour.closesAt || "",
              isClosed: Boolean(hour.isClosed)
            }))
          : []
      }))
    : [];
  const primaryLocation = locations.find((location) => location.isPrimary) || locations[0] || {
    name: "",
    slug: "",
    city: "",
    province: "",
    country: "Philippines",
    isPrimary: false
  };

  return {
    name: row.name,
    slug: row.slug,
    category: row.public_profile_category || "",
    description: row.public_profile_description || "",
    imageUrl: row.public_profile_image_url || "",
    locations,
    location: {
      name: primaryLocation.name,
      slug: primaryLocation.slug,
      city: primaryLocation.city,
      province: primaryLocation.province,
      country: primaryLocation.country
    }
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
        public_profile_enabled,
        public_profile_description,
        public_profile_category,
        public_profile_image_url,
        vendor_approval_status,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
      data.publicProfileEnabled ?? true,
      data.publicProfileDescription || null,
      data.publicProfileCategory || null,
      data.publicProfileImageUrl || null,
      data.vendorApprovalStatus || "approved",
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
    publicProfileEnabled: "public_profile_enabled",
    publicProfileDescription: "public_profile_description",
    publicProfileCategory: "public_profile_category",
    publicProfileImageUrl: "public_profile_image_url",
    vendorApprovalStatus: "vendor_approval_status",
    notificationSettings: "notification_settings",
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

async function listPublicVendorProfiles(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const search = String(options.search || "").trim();
  const limit = Math.min(Math.max(Number(options.limit) || 24, 1), 50);
  const values = [];
  let searchClause = "";

  if (search) {
    values.push(`%${search.toLowerCase()}%`);
    searchClause = `
      AND (
        LOWER(tenants.name) LIKE $${values.length}
        OR LOWER(COALESCE(tenants.public_profile_category, '')) LIKE $${values.length}
        OR LOWER(COALESCE(tenants.public_profile_description, '')) LIKE $${values.length}
        OR EXISTS (
          SELECT 1
          FROM store_locations search_locations
          WHERE search_locations.tenant_id = tenants.id
            AND search_locations.is_active = TRUE
            AND (
              LOWER(search_locations.name) LIKE $${values.length}
              OR LOWER(search_locations.slug) LIKE $${values.length}
              OR LOWER(COALESCE(search_locations.city, '')) LIKE $${values.length}
              OR LOWER(COALESCE(search_locations.province, '')) LIKE $${values.length}
            )
        )
      )
    `;
  }

  values.push(limit);

  const result = await queryClient.query(
    `
      SELECT
        tenants.name,
        tenants.slug,
        tenants.public_profile_description,
        tenants.public_profile_category,
        tenants.public_profile_image_url,
        COALESCE(active_locations.locations, '[]'::JSONB) AS locations
      FROM tenants
      LEFT JOIN LATERAL (
        SELECT JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'name', ordered_locations.name,
            'slug', ordered_locations.slug,
            'city', COALESCE(ordered_locations.city, ''),
            'province', COALESCE(ordered_locations.province, ''),
            'country', COALESCE(ordered_locations.country, 'Philippines'),
            'addressLine1', COALESCE(ordered_locations.address_line1, ''),
            'addressLine2', COALESCE(ordered_locations.address_line2, ''),
            'isPrimary', ordered_locations.is_primary,
            'imageUrl', COALESCE(ordered_locations.image_url, ''),
            'hours', COALESCE(ordered_locations.hours, '[]'::JSONB)
          )
          ORDER BY ordered_locations.is_primary DESC, ordered_locations.name ASC
        ) AS locations
        FROM (
          SELECT
            store_locations.name,
            store_locations.slug,
            store_locations.city,
            store_locations.province,
            store_locations.country,
            store_locations.address_line1,
            store_locations.address_line2,
            store_locations.is_primary,
            store_locations.image_url,
            (
              SELECT JSONB_AGG(
                JSONB_BUILD_OBJECT(
                  'weekday', store_hours.weekday,
                  'opensAt', COALESCE(TO_CHAR(store_hours.opens_at, 'HH24:MI'), ''),
                  'closesAt', COALESCE(TO_CHAR(store_hours.closes_at, 'HH24:MI'), ''),
                  'isClosed', store_hours.is_closed
                )
                ORDER BY store_hours.weekday ASC
              )
              FROM store_hours
              WHERE store_hours.location_id = store_locations.id
            ) AS hours
          FROM store_locations
          WHERE store_locations.tenant_id = tenants.id
            AND store_locations.is_active = TRUE
          ORDER BY store_locations.is_primary DESC, store_locations.name ASC
        ) ordered_locations
      ) active_locations ON TRUE
      WHERE tenants.is_active = TRUE
        AND tenants.public_profile_enabled = TRUE
        AND tenants.vendor_approval_status = 'approved'
        ${searchClause}
      ORDER BY tenants.name ASC
      LIMIT $${values.length}
    `,
    values
  );

  return result.rows.map(mapPublicVendorProfile);
}

async function findPublicVendorProfileBySlug(slug, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT
        tenants.name,
        tenants.slug,
        tenants.public_profile_description,
        tenants.public_profile_category,
        tenants.public_profile_image_url,
        COALESCE(active_locations.locations, '[]'::JSONB) AS locations
      FROM tenants
      LEFT JOIN LATERAL (
        SELECT JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'name', ordered_locations.name,
            'slug', ordered_locations.slug,
            'city', COALESCE(ordered_locations.city, ''),
            'province', COALESCE(ordered_locations.province, ''),
            'country', COALESCE(ordered_locations.country, 'Philippines'),
            'addressLine1', COALESCE(ordered_locations.address_line1, ''),
            'addressLine2', COALESCE(ordered_locations.address_line2, ''),
            'isPrimary', ordered_locations.is_primary,
            'imageUrl', COALESCE(ordered_locations.image_url, ''),
            'hours', COALESCE(ordered_locations.hours, '[]'::JSONB)
          )
          ORDER BY ordered_locations.is_primary DESC, ordered_locations.name ASC
        ) AS locations
        FROM (
          SELECT
            store_locations.name,
            store_locations.slug,
            store_locations.city,
            store_locations.province,
            store_locations.country,
            store_locations.address_line1,
            store_locations.address_line2,
            store_locations.is_primary,
            store_locations.image_url,
            (
              SELECT JSONB_AGG(
                JSONB_BUILD_OBJECT(
                  'weekday', store_hours.weekday,
                  'opensAt', COALESCE(TO_CHAR(store_hours.opens_at, 'HH24:MI'), ''),
                  'closesAt', COALESCE(TO_CHAR(store_hours.closes_at, 'HH24:MI'), ''),
                  'isClosed', store_hours.is_closed
                )
                ORDER BY store_hours.weekday ASC
              )
              FROM store_hours
              WHERE store_hours.location_id = store_locations.id
            ) AS hours
          FROM store_locations
          WHERE store_locations.tenant_id = tenants.id
            AND store_locations.is_active = TRUE
          ORDER BY store_locations.is_primary DESC, store_locations.name ASC
        ) ordered_locations
      ) active_locations ON TRUE
      WHERE tenants.slug = $1
        AND tenants.is_active = TRUE
        AND tenants.public_profile_enabled = TRUE
        AND tenants.vendor_approval_status = 'approved'
      LIMIT 1
    `,
    [slug]
  );

  return mapPublicVendorProfile(result.rows[0]);
}

module.exports = {
  mapTenant,
  findTenantBySlug,
  findTenantById,
  findTenantsByIds,
  findPublicVendorProfileBySlug,
  listPublicVendorProfiles,
  createTenant,
  updateTenant
};
