/** Presentation hint only; identity, permissions and redirect policy stay shared. */
export function isVendorLoginContext(nextPath: string | null) {
  return Boolean(nextPath && /^\/dashboard(?:[/?#]|$)/.test(nextPath));
}

/** Retry only preserves an existing vendor target; other shared sign-ins retain their default. */
export function vendorSignInRetryPath(nextPath: string | null) {
  if (!nextPath || !isVendorLoginContext(nextPath)) return "/login";
  return `/login?${new URLSearchParams({ next: nextPath }).toString()}`;
}

/** The API validates this hint again before it can enter an emailed reset URL. */
export function vendorPasswordResetRequest(email: string, nextPath: string | null) {
  const request: { email: string; next?: string } = { email };
  if (!nextPath || !isVendorLoginContext(nextPath) || nextPath.length > 2048 ||
      Array.from(nextPath).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char.charCodeAt(0) === 92) || nextPath.split(/[?#]/)[0].includes("%")) return request;
  const url = new URL(nextPath, "https://vendor-return.invalid");
  if (url.origin === "https://vendor-return.invalid" && isVendorLoginContext(url.pathname)) request.next = nextPath;
  return request;
}
