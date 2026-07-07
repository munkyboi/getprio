const db = require("../config/db");

const LOCATION_COLUMNS = `
  id,
  tenant_id,
  name,
  slug,
  address_line1,
  address_line2,
  city,
  province,
  postal_code,
  country,
  contact_email,
  contact_phone,
  timezone,
  payment_method_label,
  payment_account_display_name,
  payment_account_identifier_display,
  payment_qr_image_url,
  payment_qr_active,
  is_primary,
  is_active,
  created_at,
  updated_at
`;

const HOUR_COLUMNS = `
  id,
  location_id,
  weekday,
  opens_at,
  closes_at,
  is_closed,
  created_at,
  updated_at
`;

function mapLocation(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    name: row.name,
    slug: row.slug,
    addressLine1: row.address_line1 || "",
    addressLine2: row.address_line2 || "",
    city: row.city || "",
    province: row.province || "",
    postalCode: row.postal_code || "",
    country: row.country || "Philippines",
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    timezone: row.timezone || "Asia/Manila",
    paymentMethodLabel: row.payment_method_label || "",
    paymentAccountDisplayName: row.payment_account_display_name || "",
    paymentAccountIdentifierDisplay: row.payment_account_identifier_display || "",
    paymentQrImageUrl: row.payment_qr_image_url || "",
    paymentQrActive: Boolean(row.payment_qr_active),
    isPrimary: Boolean(row.is_primary),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapHour(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    locationId: String(row.location_id),
    weekday: Number(row.weekday),
    opensAt: row.opens_at ? String(row.opens_at).slice(0, 5) : "",
    closesAt: row.closes_at ? String(row.closes_at).slice(0, 5) : "",
    isClosed: Boolean(row.is_closed),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildQueryClient(client) {
  return client || db.pool;
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function listLocationsByTenantId(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${LOCATION_COLUMNS}
      FROM store_locations
      WHERE tenant_id = $1
      ORDER BY is_primary DESC, name ASC
    `,
    [Number(tenantId)]
  );

  return result.rows.map(mapLocation);
}

async function findLocationByTenantAndSlug(tenantId, slug, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${LOCATION_COLUMNS}
      FROM store_locations
      WHERE tenant_id = $1 AND slug = $2
      LIMIT 1
    `,
    [Number(tenantId), normalizeSlug(slug)]
  );

  return mapLocation(result.rows[0]);
}

async function isLocationSlugAvailable(tenantId, slug, excludeLocationId = null, options = {}) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    return { available: false, valid: false, message: "Enter a location slug." };
  }

  const queryClient = buildQueryClient(options.client);
  const values = [Number(tenantId), normalizedSlug];
  let query = `
    SELECT id
    FROM store_locations
    WHERE tenant_id = $1 AND slug = $2
  `;

  if (excludeLocationId) {
    values.push(Number(excludeLocationId));
    query += ` AND id <> $${values.length}`;
  }

  query += " LIMIT 1";

  const result = await queryClient.query(query, values);
  return {
    available: result.rows.length === 0,
    valid: Boolean(normalizedSlug),
    message: result.rows.length === 0 ? "Slug is available." : "That location slug is already taken."
  };
}

async function findLocationById(id, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `SELECT ${LOCATION_COLUMNS} FROM store_locations WHERE id = $1 LIMIT 1`,
    [Number(id)]
  );

  return mapLocation(result.rows[0]);
}

async function findPrimaryLocationByTenantId(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${LOCATION_COLUMNS}
      FROM store_locations
      WHERE tenant_id = $1
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `,
    [Number(tenantId)]
  );

  return mapLocation(result.rows[0]);
}

async function createLocation(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const isPrimary = Boolean(data.isPrimary);

  if (isPrimary) {
    await queryClient.query(
      `UPDATE store_locations SET is_primary = FALSE WHERE tenant_id = $1`,
      [Number(data.tenantId)]
    );
  }

  const result = await queryClient.query(
    `
      INSERT INTO store_locations (
        tenant_id,
        name,
        slug,
        address_line1,
        address_line2,
        city,
        province,
        postal_code,
        country,
        contact_email,
        contact_phone,
        timezone,
        payment_method_label,
        payment_account_display_name,
        payment_account_identifier_display,
        payment_qr_image_url,
        payment_qr_active,
        is_primary,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING ${LOCATION_COLUMNS}
    `,
    [
      Number(data.tenantId),
      data.name,
      normalizeSlug(data.slug || data.name),
      data.addressLine1 || null,
      data.addressLine2 || null,
      data.city || null,
      data.province || null,
      data.postalCode || null,
      data.country || "Philippines",
      data.contactEmail || null,
      data.contactPhone || null,
      data.timezone || "Asia/Manila",
      data.paymentMethodLabel || null,
      data.paymentAccountDisplayName || null,
      data.paymentAccountIdentifierDisplay || null,
      data.paymentQrImageUrl || null,
      Boolean(data.paymentQrActive),
      isPrimary,
      data.isActive ?? true
    ]
  );

  return mapLocation(result.rows[0]);
}

async function updateLocation(locationId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const updates = [];
  const values = [Number(locationId)];
  const setters = {
    name: "name",
    slug: "slug",
    addressLine1: "address_line1",
    addressLine2: "address_line2",
    city: "city",
    province: "province",
    postalCode: "postal_code",
    country: "country",
    contactEmail: "contact_email",
    contactPhone: "contact_phone",
    timezone: "timezone",
    paymentMethodLabel: "payment_method_label",
    paymentAccountDisplayName: "payment_account_display_name",
    paymentAccountIdentifierDisplay: "payment_account_identifier_display",
    paymentQrImageUrl: "payment_qr_image_url",
    paymentQrActive: "payment_qr_active",
    isPrimary: "is_primary",
    isActive: "is_active"
  };

  if (changes.isPrimary) {
    const existing = await queryClient.query(
      `SELECT tenant_id FROM store_locations WHERE id = $1 LIMIT 1`,
      [Number(locationId)]
    );
    const tenantId = existing.rows[0]?.tenant_id;
    if (tenantId) {
      await queryClient.query(
        `UPDATE store_locations SET is_primary = FALSE WHERE tenant_id = $1`,
        [tenantId]
      );
    }
  }

  for (const [key, column] of Object.entries(setters)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) {
      continue;
    }

    const value = key === "slug" ? normalizeSlug(changes[key]) : changes[key];
    values.push(value === "" ? null : value);
    updates.push(`${column} = $${values.length}`);
  }

  if (!updates.length) {
    const result = await queryClient.query(
      `SELECT ${LOCATION_COLUMNS} FROM store_locations WHERE id = $1 LIMIT 1`,
      [Number(locationId)]
    );
    return mapLocation(result.rows[0]);
  }

  const result = await queryClient.query(
    `
      UPDATE store_locations
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING ${LOCATION_COLUMNS}
    `,
    values
  );

  return mapLocation(result.rows[0]);
}

async function listHoursByLocationId(locationId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      SELECT ${HOUR_COLUMNS}
      FROM store_hours
      WHERE location_id = $1
      ORDER BY weekday ASC
    `,
    [Number(locationId)]
  );

  return result.rows.map(mapHour);
}

async function replaceHours(locationId, hours, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(`DELETE FROM store_hours WHERE location_id = $1`, [Number(locationId)]);

  for (const hour of hours) {
    await queryClient.query(
      `
        INSERT INTO store_hours (location_id, weekday, opens_at, closes_at, is_closed)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        Number(locationId),
        Number(hour.weekday),
        hour.opensAt || null,
        hour.closesAt || null,
        Boolean(hour.isClosed)
      ]
    );
  }

  return listHoursByLocationId(locationId, { client: queryClient });
}

async function createDefaultHours(locationId, options = {}) {
  const hours = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: "",
    closesAt: "",
    isClosed: true
  }));

  return replaceHours(locationId, hours, options);
}

async function createAlwaysOpenHours(locationId, options = {}) {
  const hours = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: "00:00",
    closesAt: "00:00",
    isClosed: false
  }));

  return replaceHours(locationId, hours, options);
}

module.exports = {
  mapLocation,
  mapHour,
  normalizeSlug,
  listLocationsByTenantId,
  findLocationByTenantAndSlug,
  isLocationSlugAvailable,
  findLocationById,
  findPrimaryLocationByTenantId,
  createLocation,
  updateLocation,
  listHoursByLocationId,
  replaceHours,
  createDefaultHours,
  createAlwaysOpenHours
};
