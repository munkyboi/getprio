export function needsLegacyRegistration(surface: "customer" | "vendor", authenticated: boolean, hasOauthHandoff: boolean, hasRouterState: boolean): boolean {
  return surface === "vendor" ? authenticated || hasOauthHandoff : hasRouterState;
}
