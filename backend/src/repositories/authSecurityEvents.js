const db = require("../config/db");

function buildQueryClient(client) {
  return client || db.pool;
}

async function createSecurityEvent(data, options = {}) {
  const queryClient = buildQueryClient(options.client);
  await queryClient.query(
    `
      INSERT INTO auth_security_events (
        user_id,
        session_id,
        event_type,
        actor_role,
        ip_address,
        user_agent,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      data.userId ? Number(data.userId) : null,
      data.sessionId ? Number(data.sessionId) : null,
      data.eventType,
      data.actorRole || null,
      data.ipAddress || null,
      data.userAgent || null,
      JSON.stringify(data.metadata || {})
    ]
  );
}

module.exports = {
  createSecurityEvent
};
