const { normalizeApiPath } = require("../middleware/apiPath");
const endpoints = {
  GET: new Set(["/auth/me", "/auth/csrf", "/auth/oauth/providers", "/public/business-categories"]),
  POST: new Set(["/auth/login", "/auth/mfa/verify", "/auth/mfa/email/send", "/auth/refresh", "/auth/logout", "/auth/password-reset/request", "/auth/register/customer", "/auth/register/vendor"])
};
function publicAuthRequestAllowed(path, method, requestedMethod) {
  const verb = String(method).toUpperCase() === "OPTIONS" ? String(requestedMethod || "").toUpperCase() : String(method).toUpperCase();
  return Boolean(endpoints[verb]?.has(normalizeApiPath(path)));
}
module.exports = { publicAuthRequestAllowed };
