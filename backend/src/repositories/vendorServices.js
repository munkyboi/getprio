const db = require("../config/db");

const SERVICE_COLUMNS = `
  id,
  tenant_id,
  name,
  slug,
  description,
  duration_minutes,
  allow_booking_quantity,
  booking_quantity_label,
  manual_payment_required,
  booking_capacity_scope,
  price_amount_cents,
  currency,
  price_display,
  is_active,
  sort_order,
  created_at,
  updated_at
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function normalizeServiceSlug(value) {
  const source = String(value || "").trim().toLowerCase();
  let normalizedSlug = "";
  let previousWasDash = false;

  for (const char of source) {
    const isAlphaNumeric = (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
    if (isAlphaNumeric) {
      normalizedSlug += char;
      previousWasDash = false;
    } else if (!previousWasDash && normalizedSlug.length > 0) {
      normalizedSlug += "-";
      previousWasDash = true;
    }
  }

  if (normalizedSlug.endsWith("-")) {
    normalizedSlug = normalizedSlug.slice(0, -1);
  }

  normalizedSlug = normalizedSlug.slice(0, 80);

  return normalizedSlug;
}

function mapVendorService(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: String(row.tenant_id),
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    durationMinutes: Number(row.duration_minutes),
    allowBookingQuantity: Boolean(row.allow_booking_quantity),
    bookingQuantityLabel: row.booking_quantity_label || "Units",
    manualPaymentRequired: Boolean(row.manual_payment_required),
    bookingCapacityScope: row.booking_capacity_scope || "service",
    priceAmountCents: Number(row.price_amount_cents),
    currency: row.currency || "PHP",
    priceDisplay: row.price_display || "",
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listServicesByTenantId(tenantId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${SERVICE_COLUMNS}
      FROM vendor_services
      WHERE tenant_id = $1
      ORDER BY is_active DESC, sort_order ASC, name ASC
    `,
    [Number(tenantId)]
  );

  return result.rows.map(mapVendorService);
}

async function findServiceByTenantAndSlug(tenantId, slug, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${SERVICE_COLUMNS}
      FROM vendor_services
      WHERE tenant_id = $1 AND slug = $2
      LIMIT 1
    `,
    [Number(tenantId), normalizeServiceSlug(slug)]
  );

  return mapVendorService(result.rows[0]);
}

async function isServiceSlugAvailable(tenantId, slug, excludeServiceId = null, options = {}) {
  const normalizedSlug = normalizeServiceSlug(slug);
  if (!normalizedSlug) {
    return { available: false, valid: false, message: "Enter a service slug." };
  }

  const queryClient = buildQueryClient(options.client);
  const values = [Number(tenantId), normalizedSlug];
  let query = `
    SELECT id
    FROM vendor_services
    WHERE tenant_id = $1 AND slug = $2
  `;

  if (excludeServiceId) {
    values.push(Number(excludeServiceId));
    query += ` AND id <> $${values.length}`;
  }

  query += " LIMIT 1";

  const result = await queryClient.query(query, values);
  return {
    available: result.rows.length === 0,
    valid: Boolean(normalizedSlug),
    message: result.rows.length === 0 ? "Slug is available." : "That service slug is already taken."
  };
}

async function createService(data, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      INSERT INTO vendor_services (
        tenant_id,
        name,
        slug,
        description,
        duration_minutes,
        allow_booking_quantity,
        booking_quantity_label,
        manual_payment_required,
        booking_capacity_scope,
        price_amount_cents,
        currency,
        price_display,
        is_active,
        sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING ${SERVICE_COLUMNS}
    `,
    [
      Number(data.tenantId),
      data.name,
      normalizeServiceSlug(data.slug || data.name),
      data.description || null,
      Number(data.durationMinutes),
      Boolean(data.allowBookingQuantity),
      data.bookingQuantityLabel || "Units",
      Boolean(data.manualPaymentRequired),
      data.bookingCapacityScope || "service",
      Number(data.priceAmountCents || 0),
      data.currency || "PHP",
      data.priceDisplay || "",
      data.isActive !== false,
      Number(data.sortOrder || 0)
    ]
  );

  return mapVendorService(result.rows[0]);
}

async function updateService(serviceId, changes, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const updates = [];
  const values = [Number(serviceId)];
  const setters = {
    name: "name",
    slug: "slug",
    description: "description",
    durationMinutes: "duration_minutes",
    allowBookingQuantity: "allow_booking_quantity",
    bookingQuantityLabel: "booking_quantity_label",
    manualPaymentRequired: "manual_payment_required",
    bookingCapacityScope: "booking_capacity_scope",
    priceAmountCents: "price_amount_cents",
    currency: "currency",
    priceDisplay: "price_display",
    isActive: "is_active",
    sortOrder: "sort_order"
  };

  for (const [key, column] of Object.entries(setters)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) {
      continue;
    }

    let value = changes[key];
    if (key === "slug") {
      value = normalizeServiceSlug(value);
    }
    if (key === "description" && value === "") {
      value = null;
    }

    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (!updates.length) {
    const result = await queryClient.query(
      `SELECT ${SERVICE_COLUMNS} FROM vendor_services WHERE id = $1 LIMIT 1`,
      [Number(serviceId)]
    );
    return mapVendorService(result.rows[0]);
  }

  const result = await queryClient.query(
    `
      UPDATE vendor_services
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING ${SERVICE_COLUMNS}
    `,
    values
  );

  return mapVendorService(result.rows[0]);
}

async function deactivateService(serviceId, options = {}) {
  return updateService(serviceId, { isActive: false }, options);
}

module.exports = {
  normalizeServiceSlug,
  listServicesByTenantId,
  findServiceByTenantAndSlug,
  isServiceSlugAvailable,
  createService,
  updateService,
  deactivateService
};
