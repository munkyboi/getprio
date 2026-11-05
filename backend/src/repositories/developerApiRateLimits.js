const db = require("../config/db");
const env = require("../config/env");
const securityRateLimitService = require("../services/securityRateLimitService");

const WINDOW_SECONDS = 60;

function queryClient(client) {
  return client || db.pool;
}

function normalizeEnvironment(value) {
  const environment = String(value || "sandbox").trim().toLowerCase();
  if (!["sandbox", "production"].includes(environment)) {
    const error = new Error("environment must be sandbox or production.");
    error.statusCode = 400;
    error.code = "INVALID_API_ENVIRONMENT";
    throw error;
  }
  return environment;
}

function readConfiguredLimit(value, fallback) {
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : fallback;
}

function defaultLimits() {
  return {
    readLimitPerMinute: readConfiguredLimit(env.developerApiReadRateLimitPerMinute, 600),
    writeLimitPerMinute: readConfiguredLimit(env.developerApiWriteRateLimitPerMinute, 120)
  };
}

function mapLimits(row, environment) {
  const defaults = defaultLimits();
  return {
    projectId: row?.developer_project_id ? String(row.developer_project_id) : null,
    environment: row?.environment || environment,
    readLimitPerMinute: Number(row?.read_limit_per_minute || defaults.readLimitPerMinute),
    writeLimitPerMinute: Number(row?.write_limit_per_minute || defaults.writeLimitPerMinute),
    updatedByUserId: row?.updated_by_user_id == null ? null : String(row.updated_by_user_id),
    updatedAt: row?.updated_at || null
  };
}

async function get(projectId, environment, options = {}) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const result = await queryClient(options.client).query(
    `SELECT developer_project_id, environment, read_limit_per_minute,
            write_limit_per_minute, updated_by_user_id, updated_at
     FROM developer_project_rate_limits
     WHERE developer_project_id = $1 AND environment = $2
     LIMIT 1`,
    [projectId, normalizedEnvironment]
  );
  return mapLimits(result.rows[0], normalizedEnvironment);
}

async function save({ projectId, environment, readLimitPerMinute, writeLimitPerMinute, userId }, options = {}) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const result = await queryClient(options.client).query(
    `INSERT INTO developer_project_rate_limits (
       developer_project_id, environment, read_limit_per_minute,
       write_limit_per_minute, updated_by_user_id
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (developer_project_id, environment)
     DO UPDATE SET read_limit_per_minute = EXCLUDED.read_limit_per_minute,
       write_limit_per_minute = EXCLUDED.write_limit_per_minute,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       updated_at = NOW()
     RETURNING developer_project_id, environment, read_limit_per_minute,
       write_limit_per_minute, updated_by_user_id, updated_at`,
    [projectId, normalizedEnvironment, readLimitPerMinute, writeLimitPerMinute, Number(userId)]
  );
  return mapLimits(result.rows[0], normalizedEnvironment);
}

async function consume({ projectId, environment, kind }, options = {}) {
  const limits = await get(projectId, environment, options);
  const isRead = kind === "read";
  const limit = isRead ? limits.readLimitPerMinute : limits.writeLimitPerMinute;
  try {
    const result = await securityRateLimitService.consume({
      bucketKey: `developer-api:${limits.environment}:${limits.projectId || projectId}:${isRead ? "read" : "write"}`,
      limit,
      windowSeconds: WINDOW_SECONDS,
      blockedMessage: "Developer API rate limit exceeded. Please retry later."
    }, options);
    return { ...result, limit, windowSeconds: WINDOW_SECONDS };
  } catch (error) {
    error.rateLimit = { limit, windowSeconds: WINDOW_SECONDS };
    throw error;
  }
}

module.exports = { WINDOW_SECONDS, consume, defaultLimits, get, mapLimits, normalizeEnvironment, save };
