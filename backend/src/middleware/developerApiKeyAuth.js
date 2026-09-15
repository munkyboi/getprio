const developerApiKeyRepository = require("../repositories/developerProjects");
const developerApiRateLimits = require("../repositories/developerApiRateLimits");
const { hashApiKey } = require("../services/developerApiKeyService");

const ENVIRONMENT_HOSTS = Object.freeze({
  production: new Set(["api.getprio.online"]),
  sandbox: new Set(["sandbox-api.getprio.online"])
});

function getApiEnvironment(req) {
  const hostname = String(req.hostname || req.headers.host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  for (const [environment, hosts] of Object.entries(ENVIRONMENT_HOSTS)) {
    if (hosts.has(hostname)) return environment;
  }
  return "unknown";
}

function getApiKey(req) {
  const value = String(req.headers["x-api-key"] || "").trim();
  return value || null;
}

async function authenticateDeveloperApiKey(req, res, next) {
  try {
    const value = getApiKey(req);
    if (!value) {
      const error = new Error("API key required.");
      error.statusCode = 401;
      error.code = "API_KEY_REQUIRED";
      throw error;
    }

    const key = await developerApiKeyRepository.findApiKeyByHash(hashApiKey(value));
    const environment = getApiEnvironment(req);
    if (
      !key ||
      key.status !== "active" ||
      key.projectStatus !== "active" ||
      key.accountStatus !== "active" ||
      key.environment !== environment
    ) {
      const error = new Error("API key is not valid for this environment.");
      error.statusCode = 401;
      error.code = "API_KEY_INVALID";
      throw error;
    }

    req.apiKey = {
      id: key.id,
      projectId: key.projectId,
      createdByUserId: key.createdByUserId,
      environment: key.environment,
      scopes: key.scopes
    };
    const kind = ["GET", "HEAD", "OPTIONS"].includes(String(req.method || "").toUpperCase()) ? "read" : "write";
    try {
      const rate = await developerApiRateLimits.consume({ projectId: key.projectId, environment, kind });
      res.setHeader("RateLimit-Limit", String(rate.limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, rate.remaining)));
      res.setHeader("RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + rate.windowSeconds));
    } catch (error) {
      if (error.rateLimit) {
        res.setHeader("RateLimit-Limit", String(error.rateLimit.limit));
        res.setHeader("RateLimit-Remaining", "0");
        res.setHeader("RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + (error.retryAfterSeconds || error.rateLimit.windowSeconds)));
      }
      if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
      throw error;
    }
    await developerApiKeyRepository.touchApiKey(key.id);
    next();
  } catch (error) {
    next(error);
  }
}

function requireApiScope(scope) {
  return function apiScopeMiddleware(req, _res, next) {
    if (req.apiKey?.scopes?.includes(scope)) {
      next();
      return;
    }
    const error = new Error("This API key does not have the required scope.");
    error.statusCode = 403;
    error.code = "API_SCOPE_REQUIRED";
    next(error);
  };
}

module.exports = { authenticateDeveloperApiKey, getApiEnvironment, getApiKey, requireApiScope };
