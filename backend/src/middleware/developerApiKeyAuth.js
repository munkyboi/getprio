const developerApiKeyRepository = require("../repositories/developerProjects");
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

async function authenticateDeveloperApiKey(req, _res, next) {
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
      environment: key.environment,
      scopes: key.scopes
    };
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
