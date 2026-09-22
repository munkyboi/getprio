const db = require("../src/config/db");

function queryClient(client) {
  return client || db.pool;
}

async function ensurePending(outboxId, registrations, options = {}) {
  const client = queryClient(options.client);
  for (const registration of registrations) {
    await client.query(
      `INSERT INTO mobile_push_outbox_deliveries (outbox_id, registration_id)
       VALUES ($1, $2)
       ON CONFLICT (outbox_id, registration_id) DO NOTHING`,
      [Number(outboxId), Number(registration.id)]
    );
  }
}

async function listPending(outboxId, options = {}) {
  const result = await queryClient(options.client).query(
    `SELECT delivery.outbox_id,
            delivery.registration_id AS id,
            registration.user_id,
            registration.installation_id AS "installationId",
            registration.token,
            registration.platform
     FROM mobile_push_outbox_deliveries AS delivery
     JOIN mobile_push_registrations AS registration
       ON registration.id = delivery.registration_id
     WHERE delivery.outbox_id = $1
       AND delivery.status = 'pending'
       AND registration.is_active = TRUE
     ORDER BY delivery.registration_id`,
    [Number(outboxId)]
  );
  return result.rows;
}

async function markSent(outboxId, registrationId, options = {}) {
  await queryClient(options.client).query(
    `UPDATE mobile_push_outbox_deliveries
     SET status = 'sent', sent_at = NOW(), attempt_count = attempt_count + 1,
         last_error = NULL, updated_at = NOW()
     WHERE outbox_id = $1 AND registration_id = $2 AND status = 'pending'`,
    [Number(outboxId), Number(registrationId)]
  );
}

async function markStale(outboxId, registrationId, options = {}) {
  await queryClient(options.client).query(
    `UPDATE mobile_push_outbox_deliveries
     SET status = 'stale', attempt_count = attempt_count + 1,
         last_error = NULL, updated_at = NOW()
     WHERE outbox_id = $1 AND registration_id = $2 AND status = 'pending'`,
    [Number(outboxId), Number(registrationId)]
  );
}

async function markFailure(outboxId, registrationId, errorMessage, options = {}) {
  await queryClient(options.client).query(
    `UPDATE mobile_push_outbox_deliveries
     SET attempt_count = attempt_count + 1,
         last_error = $3, updated_at = NOW()
     WHERE outbox_id = $1 AND registration_id = $2 AND status = 'pending'`,
    [Number(outboxId), Number(registrationId), String(errorMessage || "Delivery failed").slice(0, 500)]
  );
}

module.exports = {
  ensurePending,
  listPending,
  markFailure,
  markSent,
  markStale
};
