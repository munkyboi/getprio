const crypto = require("node:crypto");
const env = require("../config/env");

const KEY_PREFIXES = Object.freeze({
  sandbox: "gpk_sbx_",
  production: "gpk_live_"
});

function normalizeEnvironment(value) {
  const environment = String(value || "").trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(KEY_PREFIXES, environment)) {
    const error = new Error("environment must be sandbox or production.");
    error.statusCode = 400;
    error.code = "INVALID_KEY_ENVIRONMENT";
    throw error;
  }
  return environment;
}

function hashApiKey(value) {
  return crypto.scryptSync(
    String(value),
    String(env.developerApiKeyPepper || env.jwtSecret || ""),
    32
  ).toString("hex");
}

function createApiKey(environment) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  const secret = crypto.randomBytes(32).toString("base64url");
  const value = `${KEY_PREFIXES[normalizedEnvironment]}${secret}`;
  return {
    value,
    keyPrefix: value.slice(0, 20),
    secretHash: hashApiKey(value),
    environment: normalizedEnvironment
  };
}

module.exports = {
  KEY_PREFIXES,
  createApiKey,
  hashApiKey,
  normalizeEnvironment
};
