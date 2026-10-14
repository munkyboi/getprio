/** Presentation hint only; identity, permissions and redirect policy stay shared. */
export function isVendorLoginContext(nextPath: string | null) {
  return Boolean(nextPath && /^\/dashboard(?:[/?#]|$)/.test(nextPath));
}
