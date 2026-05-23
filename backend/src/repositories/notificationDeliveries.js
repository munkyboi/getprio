const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

function mapNotificationDelivery(row) {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.id),
    tenantId: row.tenant_id ? String(row.tenant_id) : null,
    ticketId: row.ticket_id ? String(row.ticket_id) : null,
    channel: row.channel,
    purpose: row.purpose,
    recipient: row.recipient,
    subject: row.subject,
    provider: row.provider,
    status: row.status,
    errorMessage: row.error_message,
    metadata: row.metadata || {},
    sentAt: row.sent_at,
    createdAt: row.created_at
  };
}

async function recordDelivery(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const result = await queryClient.query(
    `
      INSERT INTO notification_deliveries (
        tenant_id,
        ticket_id,
        channel,
        purpose,
        recipient,
        subject,
        provider,
        status,
        error_message,
        metadata,
        sent_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $8 = 'sent' THEN NOW() ELSE NULL END)
      RETURNING *
    `,
    [
      data.tenantId ? Number(data.tenantId) : null,
      data.ticketId ? Number(data.ticketId) : null,
      data.channel,
      data.purpose || "general",
      data.recipient,
      data.subject || null,
      data.provider || null,
      data.status,
      data.errorMessage || null,
      JSON.stringify(data.metadata || {})
    ]
  );

  return mapNotificationDelivery(result.rows[0]);
}

async function countSentEmails(tenantId, options = {}) {
  const queryClient = buildQueryClient(options.client);
  const values = [Number(tenantId)];
  const filters = ["tenant_id = $1", "channel = 'email'", "status = 'sent'"];

  if (options.from) {
    values.push(options.from);
    filters.push(`sent_at >= $${values.length}`);
  }

  if (options.to) {
    values.push(options.to);
    filters.push(`sent_at < $${values.length}`);
  }

  if (options.purposes?.length) {
    values.push(options.purposes);
    filters.push(`purpose = ANY($${values.length}::text[])`);
  }

  try {
    const result = await queryClient.query(
      `
        SELECT COUNT(*)::int AS count
        FROM notification_deliveries
        WHERE ${filters.join(" AND ")}
      `,
      values
    );

    return result.rows[0]?.count || 0;
  } catch (error) {
    if (error.code === "42P01" && options.ignoreMissingTable) {
      return 0;
    }

    throw error;
  }
}

async function countSentTransactionalEmails(tenantId, options = {}) {
  return countSentEmails(tenantId, {
    ...options,
    purposes: ["almost_there", "called"]
  });
}

module.exports = {
  recordDelivery,
  countSentEmails,
  countSentTransactionalEmails
};
