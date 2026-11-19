import type { OAuthProviderId } from "@shared";

// Apple credentials currently enable native sign-in only on this backend.
export function isWebOAuthProviderAvailable(provider: OAuthProviderId, configured: boolean): boolean {
  return provider !== "apple" && configured;
}
