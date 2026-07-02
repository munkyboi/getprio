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
  bookings.booking_quantity,
  bookings.scheduled_start_at,
  bookings.scheduled_end_at,
  bookings.status,
  bookings.notes,
  bookings.payment_reference,
  bookings.payment_status,
  bookings.payment_proof_object_key,
  bookings.payment_proof_file_name,
  bookings.payment_proof_content_type,
  bookings.payment_proof_size_bytes,
  bookings.payment_proof_uploaded_at,
  bookings.payment_verified_at,
  bookings.payment_verified_by_user_id,
  bookings.payment_rejected_at,
  bookings.payment_rejected_by_user_id,
  bookings.payment_rejection_reason,
  bookings.pending_expires_at,
  bookings.expired_at,
  bookings.expiration_reason,
  bookings.notify_by_email,
  bookings.notify_by_sms,
  bookings.sms_alert_fee_payment_id,
  bookings.contact_verified_at,
  bookings.contact_verification_channel,
  bookings.queue_ticket_id,
  bookings.checked_in_at,
  bookings.checked_in_by_user_id,
  bookings.no_show_at,
  bookings.no_show_by_user_id,
  bookings.created_at,
  bookings.updated_at,
  tenants.name AS tenant_name,
  tenants.slug AS tenant_slug,
  store_locations.name AS location_name,
  store_locations.slug AS location_slug,
  vendor_services.name AS service_name,
  vendor_services.slug AS service_slug,
  vendor_services.manual_payment_required AS service_manual_payment_required,
  vendor_services.price_amount_cents AS service_price_amount_cents,
  vendor_services.currency AS service_currency,
  vendor_services.price_display AS service_price_display,
  store_locations.payment_method_label AS location_payment_method_label,
  store_locations.payment_account_display_name AS location_payment_account_display_name,
  store_locations.payment_account_identifier_display AS location_payment_account_identifier_display,
  store_locations.payment_qr_image_url AS location_payment_qr_image_url,
  store_locations.payment_qr_active AS location_payment_qr_active,
  tickets.ticket_number AS queue_ticket_number,
  tickets.lookup_code AS queue_ticket_lookup_code,
  tickets.status AS queue_ticket_status
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
    serviceManualPaymentRequired: Boolean(row.service_manual_payment_required),
    servicePriceAmountCents: Number(row.service_price_amount_cents || 0),
    serviceCurrency: row.service_currency || "PHP",
    servicePriceDisplay: row.service_price_display || "",
    locationPaymentMethodLabel: row.location_payment_method_label || "",
    locationPaymentAccountDisplayName: row.location_payment_account_display_name || "",
    locationPaymentAccountIdentifierDisplay: row.location_payment_account_identifier_display || "",
    locationPaymentQrImageUrl: row.location_payment_qr_image_url || "",
    locationPaymentQrActive: Boolean(row.location_payment_qr_active),
    customerUserId: row.customer_user_id ? String(row.customer_user_id) : null,
    customerName: row.customer_name,
    customerEmail: row.customer_email || "",
    customerPhone: row.customer_phone || "",
    bookingQuantity: Number(row.booking_quantity || 1),
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    status: row.status,
    notes: row.notes || "",
    paymentReference: row.payment_reference || "",
    paymentStatus: row.payment_status,
    paymentProofObjectKey: row.payment_proof_object_key || "",
    paymentProofFileName: row.payment_proof_file_name || "",
    paymentProofContentType: row.payment_proof_content_type || "",
    paymentProofSizeBytes: row.payment_proof_size_bytes ? Number(row.payment_proof_size_bytes) : null,
    paymentProofUploadedAt: row.payment_proof_uploaded_at || null,
    paymentVerifiedAt: row.payment_verified_at || null,
    paymentVerifiedByUserId: row.payment_verified_by_user_id ? String(row.payment_verified_by_user_id) : null,
    paymentRejectedAt: row.payment_rejected_at || null,
    paymentRejectedByUserId: row.payment_rejected_by_user_id ? String(row.payment_rejected_by_user_id) : null,
    paymentRejectionReason: row.payment_rejection_reason || "",
    pendingExpiresAt: row.pending_expires_at || null,
    expiredAt: row.expired_at || null,
    expirationReason: row.expiration_reason || "",
    notifyByEmail: row.notify_by_email !== false,
    notifyBySms: Boolean(row.notify_by_sms),
    smsAlertFeePaymentId: row.sms_alert_fee_payment_id || "",
    contactVerifiedAt: row.contact_verified_at || null,
    contactVerificationChannel: row.contact_verification_channel || null,
    queueTicketId: row.queue_ticket_id ? String(row.queue_ticket_id) : null,
    queueTicketNumber: row.queue_ticket_number || "",
    queueTicketLookupCode: row.queue_ticket_lookup_code || "",
    queueTicketStatus: row.queue_ticket_status || null,
    checkedInAt: row.checked_in_at || null,
    checkedInByUserId: row.checked_in_by_user_id ? String(row.checked_in_by_user_id) : null,
    noShowAt: row.no_show_at || null,
    noShowByUserId: row.no_show_by_user_id ? String(row.no_show_by_user_id) : null,
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
            booking_quantity,
            scheduled_start_at,
            scheduled_end_at,
            status,
            notes,
            payment_reference,
            payment_status,
            pending_expires_at,
            notify_by_email,
            notify_by_sms,
            sms_alert_fee_payment_id,
            contact_verified_at,
            contact_verification_channel
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13, 'unpaid', $14, $15, $16, $17, $18, $19)
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
          Number(data.bookingQuantity || 1),
          data.scheduledStartAt,
          data.scheduledEndAt,
          data.notes || null,
          data.paymentReference || null,
          data.pendingExpiresAt || null,
          data.notifyByEmail !== false,
          Boolean(data.notifyBySms),
          data.smsAlertFeePaymentId || null,
          data.contactVerifiedAt || null,
          data.contactVerificationChannel || null
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
      LEFT JOIN tickets ON tickets.id = bookings.queue_ticket_id
      WHERE bookings.id = $1
      LIMIT 1
    `,
    [Number(id)]
  );

  return mapBooking(result.rows[0]);
}

async function findBookingByIdForUpdate(id, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${BOOKING_COLUMNS}
      FROM bookings
      INNER JOIN tenants ON tenants.id = bookings.tenant_id
      INNER JOIN store_locations ON store_locations.id = bookings.location_id
      INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
      LEFT JOIN tickets ON tickets.id = bookings.queue_ticket_id
      WHERE bookings.id = $1
      FOR UPDATE OF bookings
      LIMIT 1
    `,
    [Number(id)]
  );

  return mapBooking(result.rows[0]);
}

async function listBookingsForCustomer(userId, options = {}) {
  if (options.page || options.pageSize || options.offset !== undefined) {
    const pageSize = Math.min(Math.max(Number(options.pageSize || options.limit || 10) || 10, 1), 100);
    const offset = Math.max(Number(options.offset || 0) || 0, 0);
    const queryClient = buildQueryClient(options.client);
    const countResult = await queryClient.query(
      `
        SELECT COUNT(*)::int AS count
        FROM bookings
        WHERE bookings.customer_user_id = $1
      `,
      [Number(userId)]
    );
    const result = await queryClient.query(
      `
        SELECT ${BOOKING_COLUMNS}
        FROM bookings
        INNER JOIN tenants ON tenants.id = bookings.tenant_id
        INNER JOIN store_locations ON store_locations.id = bookings.location_id
        INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
        LEFT JOIN tickets ON tickets.id = bookings.queue_ticket_id
        WHERE bookings.customer_user_id = $1
        ORDER BY bookings.scheduled_start_at DESC, bookings.created_at DESC
        LIMIT $2 OFFSET $3
      `,
      [Number(userId), pageSize, offset]
    );

    return {
      bookings: result.rows.map(mapBooking),
      totalItems: Number(countResult.rows[0]?.count || 0)
    };
  }

  const limit = Math.min(Math.max(Number(options.limit || 50) || 50, 1), 100);
  const result = await buildQueryClient(options.client).query(
    `
      SELECT ${BOOKING_COLUMNS}
      FROM bookings
      INNER JOIN tenants ON tenants.id = bookings.tenant_id
      INNER JOIN store_locations ON store_locations.id = bookings.location_id
      INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
      LEFT JOIN tickets ON tickets.id = bookings.queue_ticket_id
      WHERE bookings.customer_user_id = $1
      ORDER BY bookings.scheduled_start_at DESC, bookings.created_at DESC
      LIMIT $2
    `,
    [Number(userId), limit]
  );

  return result.rows.map(mapBooking);
}

async function listBookingsForTenant(tenantId, options = {}) {
  let page = Number(options.page);
  let pageSize = Number(options.pageSize);
  if (isNaN(page) || page < 1) {
    if (options.limit !== undefined) {
      page = 1;
      pageSize = Number(options.limit);
    } else {
      page = 1;
    }
  }
  if (isNaN(pageSize) || pageSize < 1) {
    pageSize = 10;
  }

  const offset = (page - 1) * pageSize;
  const params = [Number(tenantId)];
  const filters = ["bookings.tenant_id = $1"];

  if (options.locationId) {
    params.push(Number(options.locationId));
    filters.push(`bookings.location_id = $${params.length}`);
  }

  if (options.status) {
    params.push(String(options.status));
    filters.push(`bookings.status = $${params.length}`);
  }

  if (options.scheduledDateFrom && options.scheduledDateTo) {
    params.push(String(options.scheduledDateFrom));
    params.push(String(options.scheduledDateTo));
    filters.push(`(bookings.scheduled_start_at AT TIME ZONE store_locations.timezone)::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
  } else if (options.scheduledDateFrom) {
    params.push(String(options.scheduledDateFrom));
    filters.push(`(bookings.scheduled_start_at AT TIME ZONE store_locations.timezone)::date >= $${params.length}::date`);
  } else if (options.scheduledDateTo) {
    params.push(String(options.scheduledDateTo));
    filters.push(`(bookings.scheduled_start_at AT TIME ZONE store_locations.timezone)::date <= $${params.length}::date`);
  }

  if (options.search) {
    const searchPattern = `%${options.search}%`;
    params.push(searchPattern);
    filters.push(`(
      bookings.reference ILIKE $${params.length} OR
      bookings.customer_name ILIKE $${params.length} OR
      bookings.customer_email ILIKE $${params.length} OR
      bookings.customer_phone ILIKE $${params.length} OR
      vendor_services.name ILIKE $${params.length}
    )`);
  }

  const whereClause = filters.join(" AND ");

  // 1. Get total count
  const countParams = [...params];
  const countResult = await buildQueryClient(options.client).query(
    `
      SELECT COUNT(*)::int AS count
      FROM bookings
      INNER JOIN store_locations ON store_locations.id = bookings.location_id
      INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
      WHERE ${whereClause}
    `,
    countParams
  );
  const totalItems = Number(countResult.rows[0]?.count || 0);

  // 2. Fetch paginated records
  const listParams = [...params];
  const limitPlaceholder = listParams.length + 1;
  const offsetPlaceholder = listParams.length + 2;
  listParams.push(pageSize);
  listParams.push(offset);

  const queryText = `
    SELECT ${BOOKING_COLUMNS}
    FROM bookings
    INNER JOIN tenants ON tenants.id = bookings.tenant_id
    INNER JOIN store_locations ON store_locations.id = bookings.location_id
    INNER JOIN vendor_services ON vendor_services.id = bookings.service_id
    LEFT JOIN tickets ON tickets.id = bookings.queue_ticket_id
    WHERE ${whereClause}
    ORDER BY
      bookings.created_at DESC,
      bookings.id DESC
    LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}
  `;

  const result = await buildQueryClient(options.client).query(queryText, listParams);
  const bookings = result.rows.map(mapBooking);

  return {
    bookings,
    totalItems
  };
}

async function countOverlappingActiveBookings(tenantId, options = {}) {
  const result = await buildQueryClient(options.client).query(
    `
      SELECT COUNT(*)::int AS count
      FROM bookings
      WHERE tenant_id = $1
        AND location_id = $2
        AND ($3::bigint IS NULL OR service_id = $3::bigint)
        AND status = ANY($4::text[])
        AND scheduled_start_at < $6::timestamptz
        AND scheduled_end_at > $5::timestamptz
        AND ($7::bigint IS NULL OR id <> $7::bigint)
    `,
    [
      Number(tenantId),
      Number(options.locationId),
      options.serviceId ? Number(options.serviceId) : null,
      ["pending", "confirmed", "rescheduled"],
      options.startsAt,
      options.endsAt,
      options.excludeBookingId ? Number(options.excludeBookingId) : null
    ]
  );

  return Number(result.rows[0]?.count || 0);
}

async function updateBooking(id, data, options = {}) {
  const sets = [];
  const values = [];

  for (const [field, column] of [
    ["status", "status"],
    ["scheduledStartAt", "scheduled_start_at"],
    ["scheduledEndAt", "scheduled_end_at"],
    ["notes", "notes"],
    ["paymentReference", "payment_reference"],
    ["paymentStatus", "payment_status"],
    ["paymentProofObjectKey", "payment_proof_object_key"],
    ["paymentProofFileName", "payment_proof_file_name"],
    ["paymentProofContentType", "payment_proof_content_type"],
    ["paymentProofSizeBytes", "payment_proof_size_bytes"],
    ["paymentProofUploadedAt", "payment_proof_uploaded_at"],
    ["paymentVerifiedAt", "payment_verified_at"],
    ["paymentVerifiedByUserId", "payment_verified_by_user_id"],
    ["paymentRejectedAt", "payment_rejected_at"],
    ["paymentRejectedByUserId", "payment_rejected_by_user_id"],
    ["paymentRejectionReason", "payment_rejection_reason"],
    ["pendingExpiresAt", "pending_expires_at"],
    ["expiredAt", "expired_at"],
    ["expirationReason", "expiration_reason"],
    ["notifyByEmail", "notify_by_email"],
    ["notifyBySms", "notify_by_sms"],
    ["smsAlertFeePaymentId", "sms_alert_fee_payment_id"],
    ["contactVerifiedAt", "contact_verified_at"],
    ["contactVerificationChannel", "contact_verification_channel"],
    ["queueTicketId", "queue_ticket_id"],
    ["checkedInAt", "checked_in_at"],
    ["checkedInByUserId", "checked_in_by_user_id"],
    ["noShowAt", "no_show_at"],
    ["noShowByUserId", "no_show_by_user_id"]
  ]) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      values.push(data[field]);
      sets.push(`${column} = $${values.length}`);
    }
  }

  if (!sets.length) {
    return findBookingById(id, options);
  }

  values.push(Number(id));
  await buildQueryClient(options.client).query(
    `
      UPDATE bookings
      SET ${sets.join(", ")}
      WHERE id = $${values.length}
    `,
    values
  );

  return findBookingById(id, options);
}

async function updateBookingByQueueTicketId(queueTicketId, data, options = {}) {
  const sets = [];
  const values = [];

  for (const [field, column] of [
    ["status", "status"],
    ["notes", "notes"]
  ]) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      values.push(data[field]);
      sets.push(`${column} = $${values.length}`);
    }
  }

  if (!sets.length) {
    return null;
  }

  values.push(Number(queueTicketId));
  const result = await buildQueryClient(options.client).query(
    `
      UPDATE bookings
      SET ${sets.join(", ")}
      WHERE queue_ticket_id = $${values.length}
      RETURNING id
    `,
    values
  );

  if (!result.rows[0]) {
    return null;
  }

  return findBookingById(result.rows[0].id, options);
}

async function expirePendingBookings(options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [
    options.now || new Date().toISOString(),
    options.reason || "Expired after pending booking window."
  ];
  const filters = [
    "status = 'pending'",
    "pending_expires_at IS NOT NULL",
    "pending_expires_at <= $1::timestamptz",
    "payment_proof_object_key IS NULL"
  ];

  if (options.tenantId) {
    values.push(Number(options.tenantId));
    filters.push(`tenant_id = $${values.length}`);
  }

  if (options.customerUserId) {
    values.push(Number(options.customerUserId));
    filters.push(`customer_user_id = $${values.length}`);
  }

  const result = await queryClient.query(
    `
      UPDATE bookings
      SET
        status = 'canceled',
        expired_at = $1::timestamptz,
        expiration_reason = $2
      WHERE ${filters.join(" AND ")}
      RETURNING id
    `,
    values
  );

  return result.rows.map((row) => String(row.id));
}

module.exports = {
  createBooking,
  findBookingById,
  findBookingByIdForUpdate,
  listBookingsForCustomer,
  listBookingsForTenant,
  countOverlappingActiveBookings,
  expirePendingBookings,
  updateBooking,
  updateBookingByQueueTicketId
};
