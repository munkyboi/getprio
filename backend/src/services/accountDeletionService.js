const db = require('../config/db');
const crypto = require('node:crypto');
const authService = require('./authService');
const queueEventRepository = require('../repositories/queueEvents');
const sessions = require('../repositories/authSessions');

const REQUIRED_TASKS = ['personal_data_inventory','object_storage_versions_and_caches','supplier_data','financial_and_legal_retention','backup_disposal'];

function failure(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

async function refreshCancelledQueues(userId) {
  const { rows } = await db.pool.query(`SELECT DISTINCT tenant_id,location_id FROM tickets
    WHERE user_id=$1 AND status_reason='account_deletion'`, [userId]);
  for (const scope of rows) {
    try {
      const tenant = await require('../repositories/tenants').findTenantById(scope.tenant_id);
      const location = await require('../repositories/storeLocations').findLocationById(scope.location_id);
      if (!tenant || !location) continue;
      await require('./queueAutomationHelpers').maybeAutoResumeQueueDay(tenant, { location });
      await require('./queueService').maybeNotifyUpcomingTickets(tenant, { location });
      await require('./queueService').publishSnapshot(tenant, { location });
    } catch {
      // Cancellation is committed. Snapshot/notification failure must not undo its receipt.
      console.warn('[account-deletion-queue-refresh] Queue refresh failed');
    }
  }
}

async function cancelWaitingTickets(client, userId) {
  // Wait for concurrent call-next changes and recheck status; never skip a locked waiting ticket.
  const { rows } = await client.query(`WITH waiting AS (
    SELECT id,status FROM tickets WHERE user_id=$1 AND status IN ('waiting','pending_carry_over')
    ORDER BY id FOR UPDATE
  )
  UPDATE tickets t SET status='cancelled',status_reason='account_deletion',
    cancelled_at=NOW(),terminal_at=NOW(),current_queue_day_id=NULL,updated_at=NOW()
  FROM waiting w WHERE t.id=w.id RETURNING t.*,w.status AS previous_status`, [userId]);
  for (const ticket of rows) {
    await client.query(`UPDATE queue_ticket_segments SET ended_at=NOW(),segment_outcome='cancelled',
      outcome_reason='account_deletion' WHERE ticket_id=$1 AND ended_at IS NULL`, [ticket.id]);
    await queueEventRepository.createQueueEvent({
      ticketId: ticket.id, tenantId: ticket.tenant_id, locationId: ticket.location_id,
      queueDateKey: ticket.queue_date_key || ticket.date_key, eventType: 'ticket_cancelled',
      fromStatus: ticket.previous_status, toStatus: 'cancelled', source: 'system',
      metadata: { reason: 'account_deletion' }
    }, { client });
  }
}

function createAccountDeletionService({ transaction = db.withTransaction, verifyPassword = authService.verifyPasswordLogin, revokeSessions = sessions.revokeAllSessionsForUser, refreshQueues = refreshCancelledQueues } = {}) {
  async function requestDeletion({ userId, password, session }) {
    const receipt = await transaction(async (client) => {
      // Serializes password changes and concurrent deletion requests for this account.
      const { rows: [user] } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!user) throw failure(401, 'AUTH_REQUIRED', 'Please sign in again.');
      if (user.password_hash) {
        if (typeof password !== 'string' || !password.length || password.length > 1024) {
          throw failure(400, 'PASSWORD_REQUIRED', 'Enter your current password.');
        }
        if (!await verifyPassword({ passwordHash: user.password_hash, passwordHashAlgorithm: user.password_hash_algorithm }, password)) {
          throw failure(403, 'INVALID_PASSWORD', 'Your password is incorrect.');
        }
      } else {
        const age = Date.now() - new Date(session?.primaryAuthenticatedAt).getTime();
        if (!['google', 'facebook'].includes(session?.authMethod) || !Number.isFinite(age) || age < 0 || age > 5 * 60 * 1000) {
          throw failure(403, 'PROVIDER_REAUTH_REQUIRED', 'Sign out and sign in with your original Google or Facebook account, then return here within five minutes to confirm deletion.');
        }
      }
      const id = crypto.randomUUID();
      const { rows: [request] } = await client.query(`INSERT INTO account_deletion_requests(id,user_id,contact_email)
        VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id
        RETURNING id,status,due_at`, [id, userId, user.email]);
      await client.query('UPDATE users SET deletion_requested_at=COALESCE(deletion_requested_at,NOW()), avatar_url=NULL WHERE id=$1', [userId]);
      await revokeSessions(userId, 'account_deletion', { client });
      await client.query('DELETE FROM push_subscriptions WHERE user_id=$1', [userId]);
      await client.query('UPDATE mobile_push_registrations SET is_active=FALSE WHERE user_id=$1', [userId]);
      await client.query('UPDATE tickets SET notify_by_email=FALSE,notify_by_sms=FALSE WHERE user_id=$1', [userId]);
      await cancelWaitingTickets(client, userId);
      await client.query('UPDATE bookings SET notify_by_email=FALSE,notify_by_sms=FALSE WHERE customer_user_id=$1', [userId]);
      await client.query(`UPDATE queue_notification_outbox SET status='obsolete',lease_owner=NULL,leased_until=NULL
        WHERE ticket_id IN (SELECT id FROM tickets WHERE user_id=$1) AND status IN ('pending','retry','processing')`, [userId]);
      await client.query('DELETE FROM vendor_reviews WHERE customer_user_id=$1', [userId]);
      // External stores and retained business records require evidence before completion.
      for (const kind of REQUIRED_TASKS) {
        await client.query(`INSERT INTO account_deletion_tasks(request_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING`, [request.id, kind]);
      }
      return { status: request.status === 'completed' ? 'completed' : 'accepted', requestId: request.id, dueAt: request.due_at };
    });
    try { await refreshQueues(userId); } catch {
      console.warn('[account-deletion-queue-refresh] Queue refresh failed');
    }
    return receipt;
  }
  return { requestDeletion };
}
module.exports = { REQUIRED_TASKS, createAccountDeletionService, ...createAccountDeletionService() };
