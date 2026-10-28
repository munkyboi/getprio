const { safeReturnPath } = require("./browserSurfaceUrls");
function hasActiveVendorMembership(user) {
  return Boolean(user?.tenantMemberships?.some(membership => membership.isActive !== false));
}
function getPostOauthPath(intent, provider, user) {
  if (hasActiveVendorMembership(user)) return "/dashboard";
  return intent === "register_vendor" ? `/register/vendor?oauth=${provider}` : "/";
}
function resolveOAuthDestination({ surface, intent, provider, user, next, legacyNext }) {
  if (surface === "customer") return safeReturnPath(next, "customer") || "/account/dashboard";
  if (surface === "vendor") {
    // Membership is checked before the caller's desired destination, including
    // the universal page's default /dashboard next value.
    if (!hasActiveVendorMembership(user)) return `/register/vendor?oauth=${provider}`;
    return safeReturnPath(next, "vendor") || "/dashboard";
  }
  return legacyNext || getPostOauthPath(intent, provider, user);
}
module.exports = { resolveOAuthDestination, getPostOauthPath };
