const crypto = require("node:crypto");
const db = require("../config/db");

const BOOKING_COLUMNS = `
  bookings.id,
  bookings.reference,
  bookings.tenant_id,
  bookings.location_id,
  bookings.service_id,
  bookings.customer_user_id,
  bookings.customer_name,
  bookings.customer_email,
  bookings.customer_phone,
  bookings.scheduled_start_at,
  bookings.scheduled_end_at,
  bookings.status,
  bookings.notes,
  bookings.payment_reference,
  bookings.payment_status,
  bookings.created_at,
  bookings.updated_at,
  tenants.name AS tenant_name,
  tenants.slug AS tenant_slug,
  store_locations.name AS location_name,
  store_locations.slug AS location_slug,
  vendor_services.name AS service_name,
  vendor_services.slug AS service_slug,
  vendor_services.price_display AS service_price_display
`;

function buildQueryClient(client) {
  return client || db.pool;
}

function mapBooking(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    reference: row.reference,
    tenantId: String(row.tenant_id),
    tenantName: row.tenant_name || "",
    tenantSlug: row.tenant_slug || "",
    locationId: String(row.location_id),
    locationName: row.location_name || "",
    locationSlug: row.location_slug || "",
    serviceId: String(row.service_id),
    serviceName: row.service_name || "",
    serviceSlug: row.service_slug || "",
    servicePriceDisplay: row.service_price_display || "",
    customerUserId: row.customer_user_id ? String(row.customer_user_id) : null,
    customerName: row.customer_name,
    customerEmail: row.customer_email || "",
    customerPhone: row.customer_phone || "",
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    status: row.status,
    notes: row.notes || "",
    paymentReference: row.payment_reference || "",
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function generateBookingReference() {
  return `BKG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function createBooking(data, options = {}) {
  const queryClient = buildQueryClient(options.client);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await queryClient.query(
        `
          INSERT INTO bookings (
            reference,
            tenant_id,
            location_id,
            service_id,
            customer_user_id,
            customer_name,
            customer_email,
            customer_phone,
            scheduled_start_at,
            scheduled_end_at,
            status,
            notes,
            payment_reference,
            payment_status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, 'unpaid')
          RETURNING *
        `,
        [
          generateBookingReference(),
          Number(data.tenantId),
          Number(data.locationId),
          Number(data.serviceId),
          data.customerUserId ? Number(data.customerUserId) : null,
          data.customerName,
          data.customerEmail || null,
          data.customerPhone || null,
          data.scheduledStartAt,
          data.scheduledEndAt,
          data.notes || null,
          data.paymentReference || null
        ]
      );

      return findBookingById(result.rows[0].id, { client: queryClient });
    } catch (error) {
      if (error.code !== "23505" || attempt === 4) {
        throw error;
      }
    }
  }

  return null;
}

async function findBookingById(id, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${BOOKING_COLUMNS}
      FROM bookings
      INNER JOIN tenants ON tenants.id = bookings.tenant_id
      INNER JOIN store_locations ON store_locations.id = bookings.location_id
      INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
      WHERE bookings.id = $1
      LIMIT 1
    `,
    [Number(id)]
  );

  return mapBooking(result.rows[0]);
}

async function listBookingsForCustomer(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 50) || 50, 1), 100);
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${BOOKING_COLUMNS}
      FROM bookings
      INNER JOIN tenants ON tenants.id = bookings.tenant_id
      INNER JOIN store_locations ON store_locations.id = bookings.location_id
      INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
      WHERE bookings.customer_user_id = $1
      ORDER BY bookings.scheduled_start_at DESC, bookings.created_at DESC
      LIMIT $2
    `,
    [Number(userId), limit]
  );

  return result.rows.map(mapBooking);
}

module.exports = {
  createBooking,
  findBookingById,
  listBookingsForCustomer
};
