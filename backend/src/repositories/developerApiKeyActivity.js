const db = require("../config/db");

function clientFor(options = {}) {
  return options.client || db.pool;
}

async function record({ apiKeyId, kind, statusCode, authFailure = false }, options = {}) {
  const readRequest = kind === "read";
  const code = Number(statusCode) || 0;
  const result = await clientFor(options).query(`
    INSERT INTO developer_api_key_activity_hourly (
      developer_api_key_id, bucket_start, request_count, read_requests, write_requests,
      client_errors, server_errors, rate_limited_requests, auth_failures, last_seen_at
    ) VALUES (
      $1, date_trunc('hour', NOW()), 1, $2, $3, $4, $5, $6, $7, NOW()
    )
    ON CONFLICT (developer_api_key_id, bucket_start) DO UPDATE SET
      request_count = developer_api_key_activity_hourly.request_count + 1,
      read_requests = developer_api_key_activity_hourly.read_requests + EXCLUDED.read_requests,
      write_requests = developer_api_key_activity_hourly.write_requests + EXCLUDED.write_requests,
      client_errors = developer_api_key_activity_hourly.client_errors + EXCLUDED.client_errors,
      server_errors = developer_api_key_activity_hourly.server_errors + EXCLUDED.server_errors,
      rate_limited_requests = developer_api_key_activity_hourly.rate_limited_requests + EXCLUDED.rate_limited_requests,
      auth_failures = developer_api_key_activity_hourly.auth_failures + EXCLUDED.auth_failures,
      last_seen_at = GREATEST(developer_api_key_activity_hourly.last_seen_at, EXCLUDED.last_seen_at)
  `, [apiKeyId, readRequest ? 1 : 0, readRequest ? 0 : 1, code >= 400 && code < 500 ? 1 : 0, code >= 500 ? 1 : 0, code === 429 ? 1 : 0, authFailure ? 1 : 0]);
  return result.rowCount;
}

async function listForProject(projectId, options = {}) {
  const result = await clientFor(options).query(`
    SELECT k.id AS key_id,
      COALESCE(SUM(a.request_count), 0)::BIGINT AS requests,
      COALESCE(SUM(a.read_requests), 0)::BIGINT AS reads,
      COALESCE(SUM(a.write_requests), 0)::BIGINT AS writes,
      COALESCE(SUM(a.client_errors), 0)::BIGINT AS client_errors,
      COALESCE(SUM(a.server_errors), 0)::BIGINT AS server_errors,
      COALESCE(SUM(a.rate_limited_requests), 0)::BIGINT AS rate_limited,
      COALESCE(SUM(a.auth_failures), 0)::BIGINT AS auth_failures,
      MAX(a.last_seen_at) AS last_seen_at
    FROM developer_api_keys k
    LEFT JOIN developer_api_key_activity_hourly a
      ON a.developer_api_key_id = k.id AND a.bucket_start >= NOW() - INTERVAL '24 hours'
    WHERE k.developer_project_id = $1
    GROUP BY k.id
    ORDER BY k.created_at DESC
  `, [projectId]);
  return result.rows.map((row) => ({
    keyId: String(row.key_id),
    requests: Number(row.requests || 0),
    reads: Number(row.reads || 0),
    writes: Number(row.writes || 0),
    clientErrors: Number(row.client_errors || 0),
    serverErrors: Number(row.server_errors || 0),
    rateLimited: Number(row.rate_limited || 0),
    authFailures: Number(row.auth_failures || 0),
    lastSeenAt: row.last_seen_at
  }));
}

async function pruneExpired(options = {}) {
  const result = await clientFor(options).query(`
    DELETE FROM developer_api_key_activity_hourly
    WHERE bucket_start < NOW() - INTERVAL '30 days'
  `);
  return result.rowCount;
}

module.exports = { listForProject, pruneExpired, record };
