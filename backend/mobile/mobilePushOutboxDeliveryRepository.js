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

async function claimPending(outboxId, workerId, options = {}) {
  const client = queryClient(options.client);
  const result = await client.query(
    `WITH candidates AS (
       SELECT registration_id
       FROM mobile_push_outbox_deliveries
       WHERE outbox_id = $1
         AND status = 'pending'
         AND (leased_until IS NULL OR leased_until < NOW())
       ORDER BY registration_id
       FOR UPDATE SKIP LOCKED
     )
     UPDATE mobile_push_outbox_deliveries AS delivery
     SET lease_owner = $2,
         leased_until = NOW() + INTERVAL '90 seconds',
         updated_at = NOW()
     FROM candidates
     WHERE delivery.outbox_id = $1
       AND delivery.registration_id = candidates.registration_id
     RETURNING delivery.registration_id`,
    [Number(outboxId), String(workerId)]
  );

  if (!result.rows.length) return [];
  const registrations = await client.query(
    `SELECT delivery.outbox_id,
            delivery.registration_id AS id,
            registration.user_id,
            registration.installation_id AS "installationId",
            registration.token,
            registration.platform
     FROM mobile_push_outbox_deliveries AS delivery
     JOIN mobile_push_registrations AS registration
       ON registration.id = delivery.registration_id
     JOIN users AS account_user ON account_user.id = registration.user_id
     LEFT JOIN developer_project_test_accounts AS test_account
       ON test_account.user_id = account_user.id AND test_account.status = 'active'
     LEFT JOIN developer_projects AS test_project
       ON test_project.id = test_account.developer_project_id
     WHERE delivery.outbox_id = $1
       AND delivery.lease_owner = $2
       AND delivery.status = 'pending'
       AND registration.is_active = TRUE
       AND NOT (
         account_user.is_sandbox_test_account = TRUE
         AND (
           account_user.sandbox_test_account_expires_at IS NULL
           OR account_user.sandbox_test_account_expires_at <= NOW()
           OR test_project.status IS DISTINCT FROM 'active'
         )
       )
     ORDER BY delivery.registration_id`,
    [Number(outboxId), String(workerId)]
  );
  return registrations.rows;
}

async function releasePending(outboxId, workerId, options = {}) {
  await queryClient(options.client).query(
    `UPDATE mobile_push_outbox_deliveries
     SET lease_owner = NULL, leased_until = NULL, updated_at = NOW()
     WHERE outbox_id = $1 AND lease_owner = $2 AND status = 'pending'`,
    [Number(outboxId), String(workerId)]
  );
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
     JOIN users AS account_user ON account_user.id = registration.user_id
     LEFT JOIN developer_project_test_accounts AS test_account
       ON test_account.user_id = account_user.id AND test_account.status = 'active'
     LEFT JOIN developer_projects AS test_project
       ON test_project.id = test_account.developer_project_id
     WHERE delivery.outbox_id = $1
       AND delivery.status = 'pending'
       AND (delivery.leased_until IS NULL OR delivery.leased_until < NOW())
       AND registration.is_active = TRUE
       AND NOT (
         account_user.is_sandbox_test_account = TRUE
         AND (
           account_user.sandbox_test_account_expires_at IS NULL
           OR account_user.sandbox_test_account_expires_at <= NOW()
           OR test_project.status IS DISTINCT FROM 'active'
         )
       )
     ORDER BY delivery.registration_id`,
    [Number(outboxId)]
  );
  return result.rows;
}

async function markSent(outboxId, registrationId, options = {}) {
  await queryClient(options.client).query(
    `UPDATE mobile_push_outbox_deliveries
     SET status = 'sent', sent_at = NOW(), attempt_count = attempt_count + 1,
         last_error = NULL, lease_owner = NULL, leased_until = NULL, updated_at = NOW()
     WHERE outbox_id = $1 AND registration_id = $2 AND status = 'pending'
       AND lease_owner = $3`,
    [Number(outboxId), Number(registrationId), String(options.workerId)]
  );
}

async function markStale(outboxId, registrationId, options = {}) {
  await queryClient(options.client).query(
    `UPDATE mobile_push_outbox_deliveries
     SET status = 'stale', attempt_count = attempt_count + 1,
         last_error = NULL, lease_owner = NULL, leased_until = NULL, updated_at = NOW()
     WHERE outbox_id = $1 AND registration_id = $2 AND status = 'pending'
       AND lease_owner = $3`,
    [Number(outboxId), Number(registrationId), String(options.workerId)]
  );
}

async function markFailure(outboxId, registrationId, errorMessage, options = {}) {
  await queryClient(options.client).query(
    `UPDATE mobile_push_outbox_deliveries
     SET attempt_count = attempt_count + 1,
         last_error = $3, lease_owner = NULL, leased_until = NULL, updated_at = NOW()
     WHERE outbox_id = $1 AND registration_id = $2 AND status = 'pending'
       AND lease_owner = $4`,
    [Number(outboxId), Number(registrationId), String(errorMessage || "Delivery failed").slice(0, 500), String(options.workerId)]
  );
}

module.exports = {
  ensurePending,
  claimPending,
  listPending,
  releasePending,
  markFailure,
  markSent,
  markStale
};
