/** Preparation only. Activation requires reviewed server-side session fencing. */
export const UNIVERSAL_AUTH_ENABLED = false as const;
export type Surface = 'customer' | 'vendor';
export type OtpChallenge = { challengeId: string; step: 'email_otp'; deliveryTarget: string; expiresAt: string };
export type AuthResult = { user: { tenants?: Array<{ id: string; name: string; slug: string; role: string; isActive: boolean }> } };
export interface UniversalAuthFakeAdapter {
  login?(input: { identifier: string; password: string; surface: Surface }): Promise<AuthResult | { mfaRequired: true; challengeToken: string }>;
  verifyMfa?(input: { challengeToken: string; code: string; surface: Surface }): Promise<AuthResult>;
  startVendor?(input: { name: string; username: string; email: string; password: string; tenantName: string; tenantSlug: string; categoryId: string }): Promise<AuthResult>;
  startOAuth?(provider: 'google' | 'facebook', intent: 'login' | 'register_customer' | 'register_vendor', surface: Surface): Promise<void>;
  providers?: { google: boolean; facebook: boolean };
  startCustomer(input: { name: string; username: string; email: string; password: string }): Promise<OtpChallenge>;
  resendCustomer(challengeId: string): Promise<OtpChallenge>;
  verifyCustomer(challengeId: string, code: string): Promise<AuthResult>;
}
export function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
export function safeNext(value: string | null, surface: Surface): string {
  const fallback = surface === 'vendor' ? '/dashboard' : '/account';
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || hasControlCharacters(value)) return fallback;
  try {
    const url = new URL(value, 'https://local.invalid');
    let path = url.pathname;
    for (let i = 0; i < 4; i++) { const next = decodeURIComponent(path); if (next === path) break; path = next; }
    if (url.origin !== 'https://local.invalid' || hasControlCharacters(path) || path.includes('//') || /(?:^|\/)\.\.?(?:\/|$)/.test(path)) return fallback;
    if (!(surface === 'vendor' ? /^\/(dashboard|queue-board)(?:\/|$)/ : /^\/(account|vendors|join|ticket|payment)(?:\/|$)/).test(path)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
export function canEnter(surface: Surface, result: AuthResult): boolean {
  if (!result || typeof result !== 'object' || !result.user || typeof result.user !== 'object' || Array.isArray(result.user)) throw new Error('Invalid auth result');
  if (result.user.tenants !== undefined && (!Array.isArray(result.user.tenants) || result.user.tenants.some(tenant => !tenant || typeof tenant !== 'object' || Array.isArray(tenant) || typeof tenant.isActive !== 'boolean' || !['id', 'name', 'slug', 'role'].every(key => typeof (tenant as unknown as Record<string, unknown>)[key] === 'string' && Boolean((tenant as unknown as Record<string, string>)[key]))))) throw new Error('Invalid memberships');
  return surface === 'customer' || !!result.user.tenants?.some(tenant => tenant.isActive === true);
}
