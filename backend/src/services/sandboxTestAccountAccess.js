const { normalizeApiPath } = require("../middleware/apiPath");

const SANDBOX_HOSTS = new Set(["sandbox-api.getprio.online", "sandbox.getprio.online"]);
const SANDBOX_AUTH_PATHS = new Set(["/auth/login", "/auth/refresh", "/auth/me", "/auth/logout"]);

function requestHostname(req) {
  return String(req?.hostname || req?.headers?.host || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
}

function isSandboxRequest(req) {
  const hostname = requestHostname(req);
  return SANDBOX_HOSTS.has(hostname) || hostname === "localhost" || hostname === "127.0.0.1";
}

function isSupportedSandboxRoute(req) {
  const path = normalizeApiPath(req?.originalUrl || req?.url);
  return SANDBOX_AUTH_PATHS.has(path) || path === "/mobile" || path.startsWith("/mobile/");
}

function isExpired(user, now = new Date()) {
  return Boolean(
    user?.isSandboxTestAccount &&
    user.sandboxTestAccountExpiresAt &&
    new Date(user.sandboxTestAccountExpiresAt).getTime() <= now.getTime()
  );
}

function assertRequestAllowed(user, req, now = new Date()) {
  if (!user?.isSandboxTestAccount) return;
  if (isExpired(user, now)) {
    const error = new Error("This Sandbox test account has expired. Reset it from the Developer Portal.");
    error.statusCode = 401;
    error.code = "SANDBOX_TEST_ACCOUNT_EXPIRED";
    throw error;
  }
  if (!isSandboxRequest(req)) {
    const error = new Error("Sandbox test accounts can only be used with the Sandbox app.");
    error.statusCode = 401;
    error.code = "SANDBOX_TEST_ACCOUNT_ONLY";
    throw error;
  }
  if (!isSupportedSandboxRoute(req)) {
    const error = new Error("Sandbox test accounts can only use the Sandbox mobile API.");
    error.statusCode = 403;
    error.code = "SANDBOX_TEST_ACCOUNT_ROUTE_NOT_ALLOWED";
    throw error;
  }
}

module.exports = { assertRequestAllowed, isExpired, isSandboxRequest, isSupportedSandboxRoute };
