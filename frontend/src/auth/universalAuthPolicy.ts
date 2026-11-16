/** Preparation only. Activation requires reviewed server-side session fencing. */
export const UNIVERSAL_AUTH_ENABLED = false as const;
export type Surface = 'customer' | 'vendor';
export type OtpChallenge = { challengeId: string; step: 'email_otp'; deliveryTarget: string; expiresAt: string };
export type AuthResult = { user: { tenants?: Array<{ isActive?: boolean }> } };
export interface UniversalAuthFakeAdapter {
  startCustomer(input: { name: string; username: string; email: string; password: string }): Promise<OtpChallenge>;
  resendCustomer(challengeId: string): Promise<OtpChallenge>;
  verifyCustomer(challengeId: string, code: string): Promise<AuthResult>;
}
export function safeNext(value: string | null, surface: Surface): string {
  const fallback = surface === 'vendor' ? '/dashboard' : '/account';
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://local.invalid');
    let path = url.pathname;
    for (let i = 0; i < 4; i++) { const next = decodeURIComponent(path); if (next === path) break; path = next; }
    if (url.origin !== 'https://local.invalid' || /[\\\u0000-\u001f\u007f]/.test(path) || path.includes('//') || /(?:^|\/)\.\.?(?:\/|$)/.test(path)) return fallback;
    if (!(surface === 'vendor' ? /^\/(dashboard|queue-board)(?:\/|$)/ : /^\/(account|vendors|join|ticket|payment)(?:\/|$)/).test(path)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}
export function canEnter(surface: Surface, result: AuthResult): boolean {
  return surface === 'customer' || !!result.user.tenants?.some(tenant => tenant.isActive !== false);
}
