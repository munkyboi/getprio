function normalizeOAuthSurface(value) {
  return value === "customer" || value === "vendor" ? value : undefined;
}

function getPostOauthPath(intent, provider, user, surface) {
  if (intent === "login" && surface === "customer") return "/account/dashboard";
  const hasTenantMemberships = Boolean(user.tenantMemberships?.length);

  if (intent === "register_vendor" && !hasTenantMemberships) {
    return `/register/vendor?oauth=${provider}`;
  }

  if (hasTenantMemberships) {
    return "/dashboard";
  }

  return "/";
}


module.exports = { normalizeOAuthSurface, getPostOauthPath };
