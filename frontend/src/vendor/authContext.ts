/** Presentation hint only; identity, permissions and redirect policy stay shared. */
export function isVendorLoginContext(nextPath: string | null) {
  return Boolean(nextPath && /^\/dashboard(?:[/?#]|$)/.test(nextPath));
}

/** Retry only preserves an existing vendor target; other shared sign-ins retain their default. */
export function vendorSignInRetryPath(nextPath: string | null) {
  if (!nextPath || !isVendorLoginContext(nextPath)) return "/login";
  return `/login?${new URLSearchParams({ next: nextPath }).toString()}`;
}
