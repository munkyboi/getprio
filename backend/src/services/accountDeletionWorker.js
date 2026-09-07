const db = require('../config/db');
const notificationService = require('./notificationService');
const { REQUIRED_TASKS } = require('./accountDeletionService');
const env = require('../config/env');

function emailConfigured() {
  return Boolean(env.resendApiKey || env.sendgridApiKey || (env.smtpHost && env.smtpUser && env.smtpPass));
}

// Cleanup outside PostgreSQL must be attested before the final transaction runs.
// A pending/failed external task can never produce a completion notification.
async function processRequest(client, request) {
  const { rows: tasks } = await client.query("SELECT kind,status,evidence FROM account_deletion_tasks WHERE request_id=$1", [request.id]);
  if (!REQUIRED_TASKS.every(kind => tasks.some(task => task.kind === kind && task.status === 'completed' && task.evidence)) || !request.retention_notice) {
    await client.query("UPDATE account_deletion_requests SET status='review_required', next_attempt_at=NOW()+INTERVAL '1 hour', updated_at=NOW() WHERE id=$1", [request.id]);
    return false;
  }
  const { rows: [user] } = await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [request.user_id]);
  if (user) {
    // Financial/legal preservation is a prerequisite task. Identity copies are not kept in product tables.
    await client.query(`UPDATE tickets SET customer_name='Deleted customer',customer_email=NULL,customer_phone=NULL,notes=NULL,
      notify_by_email=FALSE,notify_by_sms=FALSE WHERE user_id=$1`, [user.id]);
    await client.query(`UPDATE bookings SET customer_name='Deleted customer',customer_email=NULL,customer_phone=NULL,notes=NULL,
      notify_by_email=FALSE,notify_by_sms=FALSE WHERE customer_user_id=$1`, [user.id]);
    await client.query('DELETE FROM auth_login_attempts WHERE identifier_value=ANY($1::text[])', [[user.email, user.username].filter(Boolean)]);
    await client.query('DELETE FROM auth_security_events WHERE user_id=$1', [user.id]);
    // Foreign-key restrictions fail closed for unresolved business ownership or campaigns.
    await client.query('DELETE FROM users WHERE id=$1', [user.id]);
  }
  await client.query("UPDATE account_deletion_requests SET status='completed',completed_at=NOW(),last_error_code=NULL,updated_at=NOW() WHERE id=$1", [request.id]);
  return true;
}

async function runOnce() {
  // PostgreSQL advisory lock serializes workers across server instances, including email dispatch.
  const client = await db.pool.connect();
  let locked = false;
  try {
    const { rows: [lock] } = await client.query('SELECT pg_try_advisory_lock(7090701) AS locked');
    if (!lock.locked) return;
    locked = true;
    const { rows } = await client.query(`SELECT * FROM account_deletion_requests
      WHERE next_attempt_at<=NOW() AND (status<>'completed' OR completion_sent_at IS NULL)
      ORDER BY requested_at LIMIT 20`);
    if (rows.length && !emailConfigured()) console.error('[account-deletion-email] Configure delivery before processing requests');
    for (const request of rows) {
      try {
        if (!emailConfigured()) {
          await client.query("UPDATE account_deletion_requests SET next_attempt_at=NOW()+INTERVAL '1 hour',last_error_code='EMAIL_NOT_CONFIGURED' WHERE id=$1", [request.id]);
          continue;
        }
        if (!request.acknowledgement_sent_at && emailConfigured()) {
          const sent = await notificationService.sendEmail({to: request.contact_email,subject:'GetPrio account deletion requested',
            text:`Your account deletion request ${request.id} was accepted. Access has been revoked. We will complete deletion by ${new Date(request.due_at).toISOString().slice(0,10)} and notify you. Only records with a documented legal retention basis may remain.`,purpose:'account_deletion'});
          if (sent) await client.query('UPDATE account_deletion_requests SET acknowledgement_sent_at=NOW() WHERE id=$1',[request.id]);
        }
        let complete = request.status === 'completed';
        if (!complete) {
          await client.query('BEGIN');
          complete = await processRequest(client, request);
          await client.query('COMMIT');
        }
        if (complete && emailConfigured()) {
          const sent = await notificationService.sendEmail({to:request.contact_email,subject:'GetPrio account deletion completed',
            text:`Account deletion request ${request.id} is complete. Your account and non-required personal data have been removed. ${request.retention_notice}`,purpose:'account_deletion'});
          if (sent) await client.query('UPDATE account_deletion_requests SET completion_sent_at=NOW(),contact_email=NULL WHERE id=$1',[request.id]);
          else throw Object.assign(new Error('Completion notification failed'), {code: 'COMPLETION_EMAIL_FAILED'});
        }
      } catch (error) {
        await client.query('ROLLBACK');
        await client.query(`UPDATE account_deletion_requests SET attempts=attempts+1,last_error_code=$2,
          next_attempt_at=NOW()+INTERVAL '1 hour',updated_at=NOW() WHERE id=$1`,[request.id, error.code || 'DELETION_PROCESSING_FAILED']);
      }
    }
    const { rows: [overdue] } = await client.query("SELECT count(*)::int AS count FROM account_deletion_requests WHERE status<>'completed' AND due_at<NOW()+INTERVAL '7 days'");
    if(overdue.count) console.error(`[account-deletion-deadline] ${overdue.count} requests require operator action`);
    await client.query("DELETE FROM account_deletion_requests WHERE completed_at<NOW()-INTERVAL '12 months' AND completion_sent_at IS NOT NULL");
  } finally {
    try { if (locked) await client.query('SELECT pg_advisory_unlock(7090701)'); } finally { client.release(); }
  }
}
module.exports={runOnce,processRequest};
