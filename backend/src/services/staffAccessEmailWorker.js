const db = require('../config/db');
const env = require('../config/env');
const notifications = require('./notificationService');

function createWorker({ database = db, sendEmail = notifications.sendEmail,
  enabled = () => process.env.STAFF_ACCESS_EMAIL_ENABLED === 'true' && Boolean(env.resendApiKey && env.resendFromEmail) } = {}) {
  let running = false;
  async function runOnce() {
    if (!enabled() || running) return;
    running = true;
    try {
      for (let i = 0; i < 10; i++) {
        const found = await database.withTransaction(async client => {
          const { rows } = await client.query(`SELECT * FROM staff_access_email_outbox
            WHERE status = 'pending' AND available_at <= NOW() ORDER BY id
            LIMIT 1 FOR UPDATE SKIP LOCKED`);
          const intent = rows[0];
          if (!intent) return false;
          // Stop before the provider's 24-hour idempotency window can expire.
          if (Date.now() - new Date(intent.created_at).getTime() >= 23 * 60 * 60 * 1000) {
            await client.query("UPDATE staff_access_email_outbox SET status = 'failed', completed_at = NOW() WHERE id = $1", [intent.id]);
            return true;
          }
          const { rows: recipients } = await client.query(`SELECT u.id FROM users u
            WHERE u.id = $1 AND u.email = $2 AND u.email_verified = TRUE
            AND ($3 = 'member' OR EXISTS (SELECT 1 FROM tenant_memberships m
              WHERE m.user_id = u.id AND m.tenant_id = $4 AND m.role = 'owner' AND m.is_active = TRUE))`,
          [intent.recipient_user_id, intent.recipient_email, intent.audience, intent.tenant_id]);
          if (!recipients.length) {
            await client.query("UPDATE staff_access_email_outbox SET status = 'skipped', completed_at = NOW() WHERE id = $1", [intent.id]);
            return true;
          }
          try {
            const sent = await sendEmail({ to: intent.recipient_email, ...intent.payload.email,
              tenantId: intent.tenant_id, purpose: 'vendor_staff_access',
              idempotencyKey: `staff-access/${intent.event_id}/${intent.recipient_user_id}`,
              metadata: { staffAccessEventId: intent.event_id } });
            if (!sent) throw new Error('Email was not accepted');
            await client.query("UPDATE staff_access_email_outbox SET status = 'sent', attempts = attempts + 1, completed_at = NOW() WHERE id = $1", [intent.id]);
          } catch {
            await client.query(`UPDATE staff_access_email_outbox SET attempts = attempts + 1,
              status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
              available_at = NOW() + INTERVAL '5 minutes',
              completed_at = CASE WHEN attempts >= 5 THEN NOW() ELSE NULL END WHERE id = $1`, [intent.id]);
          }
          return true;
        });
        if (!found) break;
      }
    } finally { running = false; }
  }
  return { runOnce };
}
module.exports = { ...createWorker(), createWorker };
