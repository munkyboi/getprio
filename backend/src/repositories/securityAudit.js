const crypto = require("node:crypto");
const db = require("../config/db");

async function appendEvent(data, options = {}) {
  const append = async (client) => {
    const chainKey = data.tenantId ? Number(data.tenantId) : 0;
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [chainKey]);
    const previous = await client.query(
      `SELECT event_digest FROM security_audit_events
       WHERE tenant_id IS NOT DISTINCT FROM $1
       ORDER BY id DESC LIMIT 1`,
      [data.tenantId ? Number(data.tenantId) : null]
    );
    const previousDigest = previous.rows[0]?.event_digest || null;
    const occurredAt = new Date();
    const digestPayload = JSON.stringify({ previousDigest, ...data, occurredAt: occurredAt.toISOString() });
    const eventDigest = crypto.createHash("sha256").update(digestPayload).digest("hex");
    const result = await client.query(
      `INSERT INTO security_audit_events (
         actor_user_id, actor_role, session_id, tenant_id, action_key, resource_type,
         resource_id, reason, outcome, before_state, after_state, metadata,
         previous_digest, event_digest, occurred_at, retention_until
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16)
       RETURNING id, event_digest, occurred_at`,
      [
        data.actorId ? Number(data.actorId) : null, data.actorRole || null,
        data.sessionId ? Number(data.sessionId) : null, data.tenantId ? Number(data.tenantId) : null,
        data.action, data.resourceType, data.resourceId || null, data.reason || null,
        data.outcome, JSON.stringify(data.beforeState ?? null), JSON.stringify(data.afterState ?? null),
        JSON.stringify(data.metadata || {}), previousDigest, eventDigest, occurredAt,
        data.retentionUntil || new Date(occurredAt.getTime() + 7 * 365 * 24 * 60 * 60_000)
      ]
    );
    return { id: String(result.rows[0].id), digest: result.rows[0].event_digest, occurredAt: result.rows[0].occurred_at };
  };
  if (options.client) return append(options.client);
  return db.withTransaction(append);
}

async function listEvents(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 100), 1), 500);
  const values = [limit];
  const tenantFilter = options.tenantId ? `WHERE events.tenant_id = $2` : "";
  if (options.tenantId) values.push(Number(options.tenantId));
  const result = await db.pool.query(
    `SELECT events.id, events.action_key, events.resource_type, events.resource_id,
            events.reason, events.outcome, events.metadata, events.event_digest,
            events.previous_digest, events.occurred_at, events.tenant_id,
            users.email AS actor_email
     FROM security_audit_events events
     LEFT JOIN users ON users.id=events.actor_user_id
     ${tenantFilter}
     ORDER BY events.id DESC LIMIT $1`,
    values
  );
  return result.rows;
}

module.exports = { appendEvent, listEvents };
