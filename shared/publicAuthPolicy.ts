/** The public site's credentialed capability is finite, never /auth/*. */
export const PUBLIC_AUTH_ENDPOINTS: Record<string, readonly string[]> = {
  GET: ["/auth/me", "/auth/csrf", "/auth/oauth/providers", "/public/business-categories"],
  POST: ["/auth/login", "/auth/mfa/verify", "/auth/mfa/email/send", "/auth/refresh", "/auth/logout", "/auth/password-reset/request", "/auth/register/customer", "/auth/register/vendor"]
};
export function publicAuthPathAllowed(path: string, method = "GET"): boolean {
  const pathname = path.split("?")[0];
  return Boolean(PUBLIC_AUTH_ENDPOINTS[method.toUpperCase()]?.includes(pathname));
}
