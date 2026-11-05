const db = require('../config/db');
const permissions = require('./permissions');
const privileged = require('./privilegedTransactionService');
const audit = require('../repositories/securityAudit');

const ACTION = 'platform.maintenance.update';
const MANAGE = 'platform.settings.manage';
function invalid(message, statusCode = 400, code = 'INVALID_MAINTENANCE') {
  throw Object.assign(new Error(message), { statusCode, code });
}
function normalize(draft) {
  if (typeof draft?.enabled !== 'boolean' || typeof draft?.forceScreen !== 'boolean'
    || typeof draft?.message !== 'string') invalid('Enter valid maintenance settings.');
  const message = draft.message.trim();
  if (!message || message.length > 500) invalid('Enter a public message between 1 and 500 characters.');
  if (draft.forceScreen && !draft.enabled) invalid('Enable maintenance before forcing the maintenance screen.');
  return { enabled: draft.enabled, forceScreen: draft.forceScreen, message };
}
function reasonFor(value) {
  const reason = String(value || '').trim().replace(/\s+/g, ' ');
  if (reason.length < 8 || reason.length > 500) invalid('Enter an audit reason between 8 and 500 characters.');
  return reason;
}
async function readPolicy(client = db.pool, lock = '') {
  const row = (await client.query(`SELECT revision,enabled,force_screen,message,updated_at FROM platform_maintenance WHERE id=1${lock}`)).rows[0];
  if (!row) invalid('Maintenance controls are unavailable.', 503, 'MAINTENANCE_UNAVAILABLE');
  return { revision: String(row.revision), enabled: row.enabled, forceScreen: row.force_screen, message: row.message, updatedAt: row.updated_at };
}
async function read(user) {
  permissions.assertPermission(user, 'platform.tenants.read');
  return readPolicy();
}
async function publicStatus() {
  const { enabled, forceScreen, message } = await readPolicy();
  return { enabled, forceScreen, message };
}
async function operationStatus(user, operationKey) {
  permissions.assertPermission(user, MANAGE);
  if (typeof operationKey !== 'string' || operationKey.length < 8 || operationKey.length > 128) invalid('Invalid operation key.');
  const receipt = (await db.pool.query('SELECT response FROM platform_maintenance_operations WHERE actor_user_id=$1 AND operation_key=$2', [user._id, operationKey])).rows[0];
  // Absence is NOT proof of failure: the original request may still be waiting
  // for admission/authority locks. Only a committed receipt resolves a save.
  return receipt ? { state: receipt.response.abandoned ? 'abandoned' : 'committed', policy: await readPolicy() } : { state: 'unknown' };
}
// Serialize abandonment against every save on the policy lock. A durable
// tombstone prevents an original delayed request from committing afterwards.
async function abandon({ user, session, operationKey }) {
  permissions.assertPermission(user, MANAGE);
  if (typeof operationKey !== 'string' || operationKey.length < 8 || operationKey.length > 128) invalid('Invalid operation key.');
  return db.withTransaction(async client => {
    const currentSession = await lockedSession(client, user, session);
    const current = await readPolicy(client, ' FOR UPDATE');
    if (currentSession.deadlines.some(value => new Date(value).getTime() <= Date.now())) invalid('Please sign in again.', 401, 'MAINTENANCE_SESSION_EXPIRED');
    const receipt = (await client.query('SELECT response FROM platform_maintenance_operations WHERE actor_user_id=$1 AND operation_key=$2', [user._id, operationKey])).rows[0];
    if (!receipt) {
      await client.query('INSERT INTO platform_maintenance_operations(actor_user_id,operation_key,payload_digest,response) VALUES($1,$2,$3,$4::jsonb)', [user._id, operationKey, 'abandoned', JSON.stringify({ abandoned: true })]);
      await audit.appendEvent({ actorId: user._id, actorRole: 'platform_admin', sessionId: session._id,
        action: 'platform.maintenance.abandon', resourceType: 'platform_maintenance', resourceId: 'global',
        reason: 'Safely abandon an unresolved maintenance confirmation', outcome: 'success',
        metadata: { operationKey } }, { client });
    }
    return { state: !receipt || receipt.response.abandoned ? 'abandoned' : 'committed', policy: current };
  });
}
// Called before external work and again in the durable admission transaction.
// SHARE makes enabling maintenance wait for already-admitted writes to commit.
async function assertNewIntake({ client } = {}) {
  const policy = await readPolicy(client || db.pool, client ? ' FOR SHARE' : '');
  if (policy.enabled) invalid(policy.message, 503, 'PLATFORM_MAINTENANCE');
}
async function preview({ user, session, draft, reason }) {
  permissions.assertPermission(user, MANAGE);
  const policy = normalize(draft);
  const current = await readPolicy();
  const confirmation = await privileged.issueConfirmation({ actorId: user._id, session, action: ACTION,
    target: 'global', reason: reasonFor(reason), payload: policy, previewRevision: current.revision });
  return { policy, revision: current.revision, confirmation };
}
async function lockedSession(client, user, session) {
  // Same authority order as other privileged writers: actor, session, policy.
  const actor = (await client.query('SELECT roles,mfa_enabled,deletion_requested_at,platform_access_suspended_at FROM users WHERE id=$1 FOR SHARE', [user._id])).rows[0];
  if (!actor || !actor.mfa_enabled || actor.deletion_requested_at || actor.platform_access_suspended_at)
    invalid('Platform authority is no longer active.', 403, 'MAINTENANCE_AUTHORITY_REVOKED');
  permissions.assertPermission(actor, MANAGE);
  const row = (await client.query('SELECT * FROM auth_sessions WHERE user_id=$1 AND id=$2 FOR SHARE', [user._id, session?._id])).rows[0];
  if (!row || row.status !== 'active' || row.surface !== 'app') invalid('Please sign in again.', 401, 'MAINTENANCE_SESSION_REVOKED');
  return { _id: String(row.id), primaryAuthenticatedAt: row.primary_authenticated_at, mfaVerifiedAt: row.mfa_verified_at,
    deadlines: [row.expires_at, row.absolute_expires_at, row.inactivity_expires_at].filter(Boolean) };
}
async function update({ user, session, draft, reason, expectedRevision, confirmationToken, operationKey }) {
  permissions.assertPermission(user, MANAGE);
  privileged.assertRecentAssurance(session);
  const policy = normalize(draft), auditReason = reasonFor(reason);
  if (typeof expectedRevision !== 'string' || !/^[1-9]\d{0,18}$/.test(expectedRevision)) invalid('Invalid maintenance revision.');
  if (typeof operationKey !== 'string' || operationKey.length < 8 || operationKey.length > 128) invalid('An idempotency key is required.');
  const digest = privileged.buildPayloadDigest({ policy, reason: auditReason, expectedRevision });
  return db.withTransaction(async client => {
    const currentSession = await lockedSession(client, user, session);
    const current = await readPolicy(client, ' FOR UPDATE');
    if (currentSession.deadlines.some(value => new Date(value).getTime() <= Date.now())) invalid('Please sign in again.', 401, 'MAINTENANCE_SESSION_EXPIRED');
    privileged.assertRecentAssurance(currentSession);
    const receipt = (await client.query('SELECT payload_digest,response FROM platform_maintenance_operations WHERE actor_user_id=$1 AND operation_key=$2', [user._id, operationKey])).rows[0];
    if (receipt) {
      if (receipt.payload_digest !== digest) invalid('This operation key was used for another change.', 409, 'MAINTENANCE_KEY_CONFLICT');
      return JSON.parse(JSON.stringify(current));
    }
    if (current.revision !== expectedRevision) invalid('Maintenance settings changed. Refresh and review again.', 409, 'MAINTENANCE_STALE');
    await privileged.consumeConfirmation({ token: confirmationToken, actorId: user._id, session: currentSession,
      action: ACTION, target: 'global', reason: auditReason, payload: policy, previewRevision: expectedRevision,
      currentPreviewRevision: current.revision }, { client });
    await client.query('UPDATE platform_maintenance SET revision=revision+1,enabled=$1,force_screen=$2,message=$3,updated_at=clock_timestamp() WHERE id=1', [policy.enabled, policy.forceScreen, policy.message]);
    const updated = await readPolicy(client);
    await audit.appendEvent({ actorId: user._id, actorRole: 'platform_admin', sessionId: session._id,
      action: ACTION, resourceType: 'platform_maintenance', resourceId: 'global', reason: auditReason,
      outcome: 'success', beforeState: current, afterState: updated,
      metadata: { existingWorkPreserved: true, staffAndAdminAccessPreserved: true } }, { client });
    await client.query('INSERT INTO platform_maintenance_operations(actor_user_id,operation_key,payload_digest,response) VALUES($1,$2,$3,$4::jsonb)', [user._id, operationKey, digest, JSON.stringify(updated)]);
    // JSON-normalize dates so an idempotent replay has the same public shape.
    return JSON.parse(JSON.stringify(updated));
  });
}
module.exports = { read, publicStatus, operationStatus, abandon, assertNewIntake, preview, update };
